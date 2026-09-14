import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const UBERQUALITY_CAPACITY_VERSION = 'uberbond.uberquality-capacity.v1';

const finite = value => Number.isFinite(Number(value)) ? Number(value) : null;
const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);

function zero(extra = {}) {
  return {
    version: UBERQUALITY_CAPACITY_VERSION,
    externalEffectAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS),
    ...extra
  };
}

function uniqueQualifiedLeads(leads = [], { minLeadScore, maxContactsPerAccountPerDay }) {
  const seenEmail = new Set();
  const perAccount = new Map();
  const accepted = [];
  const rejected = [];

  for (const lead of Array.isArray(leads) ? leads : []) {
    const email = clean(lead?.email || lead?.address, 320).toLowerCase();
    const accountKey = clean(lead?.accountId || lead?.companyDomain || lead?.company || email.split('@')[1], 320).toLowerCase();
    const score = finite(lead?.qualityScore ?? lead?.score);
    const reasons = [];
    if (!email || !email.includes('@')) reasons.push('valid-email-required');
    if (seenEmail.has(email)) reasons.push('duplicate-contact');
    if (lead?.safeForOutreach !== true) reasons.push('safe-for-outreach-required');
    if (lead?.suppressed === true || lead?.unsubscribed === true) reasons.push('suppressed-or-unsubscribed');
    if (lead?.cooldownActive === true) reasons.push('contact-cooldown-active');
    if (!['VERIFIED', 'SAFE', 'OWNER_CONFIRMED'].includes(clean(lead?.verificationStatus, 80).toUpperCase())) reasons.push('verified-contact-required');
    if (score == null || score < minLeadScore) reasons.push('quality-floor-not-met');
    const accountCount = perAccount.get(accountKey) || 0;
    if (accountKey && accountCount >= maxContactsPerAccountPerDay) reasons.push('account-contact-density-cap');

    if (reasons.length) {
      rejected.push({ email: email || null, accountKey: accountKey || null, qualityScore: score, reasonCodes: reasons });
      continue;
    }
    seenEmail.add(email);
    if (accountKey) perAccount.set(accountKey, accountCount + 1);
    accepted.push({ email, accountKey: accountKey || null, qualityScore: score });
  }
  return { accepted, rejected };
}

function warmCapacity(warmFleet = {}) {
  if (!Array.isArray(warmFleet?.decisions)) return 0;
  return warmFleet.decisions
    .filter(row => ['LIMITED_CANARY', 'RAMP', 'HOLD'].includes(clean(row?.state, 80).toUpperCase()))
    .reduce((sum, row) => sum + Math.max(0, Math.floor(finite(row?.recommendedColdDailyCap) || 0)), 0);
}

function observedCapacity(rows = [], { stateField = 'status', readyStates = ['GREEN', 'READY'], capField = 'observedColdDailyCap' } = {}) {
  if (!Array.isArray(rows) || !rows.length) return 0;
  const ready = new Set(readyStates);
  return rows.reduce((sum, row) => {
    const state = clean(row?.[stateField], 80).toUpperCase();
    const cap = finite(row?.[capField]);
    return sum + (ready.has(state) && cap != null && cap >= 0 ? Math.floor(cap) : 0);
  }, 0);
}

/**
 * Returns one number: the maximum number of cold outreach messages UberBond
 * can send today without relaxing the fixed lead-quality floor or any observed
 * infrastructure capacity. More low-quality leads NEVER increase this number.
 */
export function compileQualityPreservingOutreachCapacity({
  warmFleet = {},
  domains = [],
  egress = {},
  recipientBudgets = [],
  leads = [],
  policy = {}
} = {}) {
  const minLeadScore = Math.max(0, Math.min(1, finite(policy.minLeadScore) ?? 0.82));
  const maxContactsPerAccountPerDay = Math.max(1, Math.floor(finite(policy.maxContactsPerAccountPerDay) ?? 1));
  const campaignCeiling = Math.max(0, Math.floor(finite(policy.campaignDailyCeiling) ?? Number.MAX_SAFE_INTEGER));

  const mailboxReadyCapacity = warmCapacity(warmFleet);
  const domainCapacity = observedCapacity(domains, { stateField: 'status', readyStates: ['GREEN', 'READY'], capField: 'observedColdDailyCap' });
  const egressCapacity = Math.max(0, Math.floor(finite(egress?.totalReadyColdDailyCap ?? egress?.topology?.totalReadyColdDailyCap) || 0));
  const recipientCapacity = observedCapacity(recipientBudgets, { stateField: 'status', readyStates: ['GREEN', 'READY'], capField: 'observedColdDailyCap' });
  const qualified = uniqueQualifiedLeads(leads, { minLeadScore, maxContactsPerAccountPerDay });
  const highQualityLeadInventory = qualified.accepted.length;

  const dimensions = {
    mailboxReadyCapacity,
    domainCapacity,
    egressCapacity,
    recipientCapacity,
    highQualityLeadInventory,
    campaignCeiling
  };
  const qualityPreservingDailyMax = Math.min(...Object.values(dimensions));
  const bottlenecks = Object.entries(dimensions)
    .filter(([, value]) => value === qualityPreservingDailyMax)
    .map(([key]) => key);

  const status = qualityPreservingDailyMax > 0 ? 'QUALITY_PRESERVING_CAPACITY_READY' : 'QUALITY_PRESERVING_CAPACITY_ZERO';
  return zero({
    ok: true,
    status,
    qualityPreservingDailyMax,
    minLeadScore,
    maxContactsPerAccountPerDay,
    dimensions,
    bottlenecks,
    qualifiedLeadCount: highQualityLeadInventory,
    rejectedLeadCount: qualified.rejected.length,
    acceptedLeads: qualified.accepted,
    rejectedLeads: qualified.rejected,
    qualityFloorRelaxed: false,
    fillRule: 'NEVER_LOWER_QUALITY_TO_FILL_CAPACITY; DISCOVER_ENRICH_VERIFY_MORE_HIGH_QUALITY_OPPORTUNITIES_INSTEAD',
    truthBoundary: 'This number is only as real as the supplied observed mailbox, domain, egress, recipient and lead evidence. Unknown capacity contributes zero.'
  });
}
