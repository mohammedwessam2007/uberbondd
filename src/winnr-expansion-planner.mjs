// Provider-neutral sender-fleet expansion planner (3-mailbox pilot -> N mailboxes
// over M owned domains). Despite the file name, nothing in it is Winnr-specific:
// the provider enters only through an observed entitlement record.
//
// It is a pure PLANNER. It distinguishes three classes of statement and never
// lets one become another:
//   PLAN                         what would be done (this module's only output class)
//   AUTHORIZED_EXTERNAL_MUTATION a plan step bound to an unexpired, exactly
//                                matching owner authorization reference
//   OBSERVED_PROVIDER_STATE      only what `observed` says the provider/DNS/mailboxes
//                                actually are. A plan never becomes provider truth.
//
// Doctrine encoded here (each is a tested refusal, not a suggestion):
//   - spread risk: no more than `maxMailboxesPerDomain` per domain, a reserve pool
//     of domains is never allocated, primary brand roots are never used
//   - never rotate to evade enforcement and never replace a quarantined sender
//     merely to escape its reputation evidence (replacement needs an explicit
//     retirement decision)
//   - domain count is not send authority; the provider's plan maximum is not a safe
//     send rate; current capacity is measured from observed healthy mailboxes at
//     their evidence-earned ramp caps, never from marketing numbers
//   - expansion is only recommended when capacity is demonstrably the bottleneck
//   - no invented identities: mailbox local parts come from caller-supplied
//     truthful names
import { createHash } from 'node:crypto';

export const WINNR_EXPANSION_PLANNER_VERSION = 'uberbond.sender-fleet-expansion-planner.v1';

export const STATEMENT_CLASSES = Object.freeze({
  PLAN: 'PLAN',
  AUTHORIZED_EXTERNAL_MUTATION: 'AUTHORIZED_EXTERNAL_MUTATION',
  OBSERVED_PROVIDER_STATE: 'OBSERVED_PROVIDER_STATE'
});

// Evidence-first ramp ceilings per green mailbox per day. These are the
// repository's ramp stages, deliberately far below provider maxima.
export const RAMP_STAGE_DAILY_CAP = Object.freeze({ 0: 0, 1: 2, 2: 5, 3: 10 });
const MUTATING_ACTIONS = new Set(['PURCHASE_PLAN', 'CONNECT_OWNED_DOMAIN', 'WRITE_DNS', 'CREATE_MAILBOXES', 'IMPORT_CREDENTIALS', 'ENABLE_WARMING', 'RETIRE_MAILBOX', 'QUARANTINE_RELEASE']);

const text = (value, max = 300) => String(value ?? '').trim().slice(0, max);
const lower = value => text(value, 300).toLowerCase();
const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const int = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : fallback);

function evenSpread(total, buckets) {
  if (buckets < 1) return [];
  const base = Math.floor(total / buckets);
  const remainder = total % buckets;
  return Array.from({ length: buckets }, (_, index) => base + (index < remainder ? 1 : 0));
}

// An authorization counts only if it names this exact action AND this exact
// plan digest, is unexpired, and carries a reference. It is never inferred.
function authorizationFor(action, planDigest, authorizations, now) {
  const match = (Array.isArray(authorizations) ? authorizations : []).find(a => text(a?.action) === action && text(a?.ref) && a?.planDigest === planDigest && Date.parse(a?.expiresAt) > now.getTime());
  return match || null;
}

/**
 * @param {object} input
 * @param {object} input.observed   OBSERVED_PROVIDER_STATE: { entitlement, mailboxes[], domains[] }
 * @param {object} input.target     { mailboxes, ownedDomains[], mailboxesPerDomainMax, reservePoolFraction, primaryBrandDomains[], truthfulMailboxNames[] }
 * @param {object} [input.demand]   { eligibleProspectsPerDay, sendsAttemptedPerDay }
 * @param {object[]} [input.authorizations] owner authorizations (never inferred)
 * @param {object[]} [input.retirementDecisions] explicit decisions to retire a mailbox ({ address, ref })
 */
export function compileSenderFleetExpansionPlan({ observed = {}, target = {}, demand = null, authorizations = [], retirementDecisions = [], now = new Date() } = {}) {
  const at = new Date(now);
  const blockers = [];
  const refusals = [];

  // ---- OBSERVED_PROVIDER_STATE (verbatim, never inferred from the plan) ----
  const mailboxes = (Array.isArray(observed.mailboxes) ? observed.mailboxes : []).map(m => ({
    ordinal: m?.ordinal ?? null, address: lower(m?.address), domain: lower(m?.domain || String(m?.address || '').split('@')[1]),
    smtpVerified: m?.smtpVerified === true, imapVerified: m?.imapVerified === true,
    quarantined: m?.quarantined === true, quarantineReason: text(m?.quarantineReason, 120) || null,
    rampStage: [0, 1, 2, 3].includes(Number(m?.rampStage)) ? Number(m.rampStage) : 0,
    qualityCapPerDay: Number.isFinite(Number(m?.qualityCapPerDay)) ? Math.max(0, Math.floor(Number(m.qualityCapPerDay))) : null
  }));
  const entitlement = observed.entitlement && typeof observed.entitlement === 'object'
    ? { plan: text(observed.entitlement.plan, 60), mailboxLimit: int(observed.entitlement.mailboxLimit), observedAt: text(observed.entitlement.observedAt, 40), source: text(observed.entitlement.source, 200) }
    : null;
  const observedDomains = (Array.isArray(observed.domains) ? observed.domains : []).map(d => ({ domain: lower(d?.domain), owned: d?.owned === true, dnsReady: d?.dnsReady === true, providerLeased: d?.providerLeased === true }));
  const observedState = { class: STATEMENT_CLASSES.OBSERVED_PROVIDER_STATE, entitlement, mailboxCount: mailboxes.length, mailboxes, domains: observedDomains };

  // ---- measured capacity (what evidence allows today) ----
  const green = mailboxes.filter(m => m.smtpVerified && !m.quarantined);
  const currentEvidenceCapacityPerDay = green.reduce((sum, m) => {
    const ramp = RAMP_STAGE_DAILY_CAP[m.rampStage] ?? 0;
    return sum + (m.qualityCapPerDay === null ? ramp : Math.min(ramp, m.qualityCapPerDay));
  }, 0);

  // ---- target topology ----
  const wantMailboxes = int(target.mailboxes, 0);
  const domains = [...new Set((Array.isArray(target.ownedDomains) ? target.ownedDomains : []).map(lower).filter(Boolean))];
  const primary = new Set((Array.isArray(target.primaryBrandDomains) ? target.primaryBrandDomains : []).map(lower));
  const maxPerDomain = Math.max(1, Math.min(10, int(target.mailboxesPerDomainMax, 3)));
  const reserveFraction = Math.min(0.5, Math.max(0, Number.isFinite(Number(target.reservePoolFraction)) ? Number(target.reservePoolFraction) : 0.2));
  const names = [...new Set((Array.isArray(target.truthfulMailboxNames) ? target.truthfulMailboxNames : []).map(lower).filter(Boolean))];

  for (const domain of domains) if (primary.has(domain)) refusals.push(`primary-brand-domain-never-used-for-cold-volume:${domain}`);
  const usable = domains.filter(domain => !primary.has(domain));
  const reserveCount = usable.length ? Math.max(1, Math.ceil(usable.length * reserveFraction)) : 0;
  const reserve = usable.slice(usable.length - reserveCount);
  const active = usable.slice(0, usable.length - reserveCount);
  if (!wantMailboxes) blockers.push('target-mailbox-count-required');
  if (!active.length && wantMailboxes) blockers.push('owned-sending-domains-required');
  if (wantMailboxes && active.length * maxPerDomain < wantMailboxes) blockers.push(`topology-cannot-meet-target-within-${maxPerDomain}-mailboxes-per-domain:need-${Math.ceil(wantMailboxes / maxPerDomain)}-active-domains`);
  if (wantMailboxes && !names.length) blockers.push('truthful-mailbox-name-scheme-required');

  const perDomain = active.length ? evenSpread(wantMailboxes, active.length).map(n => Math.min(n, maxPerDomain)) : [];
  const allocation = active.map((domain, index) => ({ domain, mailboxes: perDomain[index] || 0, dnsReady: observedDomains.find(d => d.domain === domain)?.dnsReady === true, owned: observedDomains.find(d => d.domain === domain)?.owned === true }));
  const allocatedMailboxes = allocation.reduce((sum, a) => sum + a.mailboxes, 0);
  if (wantMailboxes && allocatedMailboxes < wantMailboxes && !blockers.some(b => b.startsWith('topology-cannot'))) blockers.push('allocation-short-of-target');

  // ---- entitlement (observed, never assumed) ----
  const entitlementCovers = entitlement && entitlement.mailboxLimit >= wantMailboxes;
  if (wantMailboxes > mailboxes.length) {
    if (!entitlement) blockers.push('provider-entitlement-unobserved');
    else if (!entitlementCovers) blockers.push(`provider-entitlement-insufficient:limit-${entitlement.mailboxLimit}-need-${wantMailboxes}`);
  }

  // ---- quarantine and retirement: never replace to escape evidence ----
  const quarantined = mailboxes.filter(m => m.quarantined);
  const retirementRefs = new Map((Array.isArray(retirementDecisions) ? retirementDecisions : []).filter(r => text(r?.address) && text(r?.ref)).map(r => [lower(r.address), text(r.ref)]));
  const quarantineDisposition = quarantined.map(m => ({
    address: m.address, ordinal: m.ordinal, reason: m.quarantineReason,
    capacityContribution: 0,
    disposition: retirementRefs.has(m.address) ? 'RETIRE_PER_EXPLICIT_DECISION' : 'HOLD_QUARANTINED_NO_AUTOMATIC_REPLACEMENT',
    replacementAllowed: retirementRefs.has(m.address),
    release: 'REQUIRES_NEW_MATCHED_EVIDENCE_UNDER_EXISTING_RELEASE_POLICY'
  }));

  // ---- steps: PLAN, with rollback, never executed here ----
  const steps = [];
  const add = (action, detail, reversible, rollback, requires) => steps.push({ class: STATEMENT_CLASSES.PLAN, action, detail, reversible, rollback, requires, mutates: MUTATING_ACTIONS.has(action) });
  const missingDns = allocation.filter(a => !a.dnsReady);
  if (wantMailboxes > mailboxes.length) {
    add('PURCHASE_PLAN', { plan: 'target-capacity-plan', mailboxes: wantMailboxes, entitlementObserved: Boolean(entitlement) }, false, 'cancel at provider per its written terms; recurring charge only until cancelled', 'explicit founder spend authority for the exact charge');
    for (const a of allocation.filter(x => !x.owned)) add('CONNECT_OWNED_DOMAIN', { domain: a.domain }, true, 'disconnect domain at provider', 'domain owned by the founder and DNS control confirmed');
    for (const a of missingDns) add('WRITE_DNS', { domain: a.domain, records: ['MX', 'SPF', 'DKIM', 'DMARC'] }, true, 'remove the added records', 'explicit authorization naming the exact records');
    add('CREATE_MAILBOXES', { perDomain: allocation.map(a => ({ domain: a.domain, count: a.mailboxes })), startingRampStage: 0, startingCapPerDay: 0 }, true, 'delete the new mailboxes', 'purchase and domain steps complete');
    add('IMPORT_CREDENTIALS', { storage: 'encrypted custody only; never plaintext in git, logs or receipts' }, true, 'delete the encrypted records', 'mailboxes exist at the provider');
  }
  add('VERIFY_SMTP_IMAP_AND_PLACEMENT', { each: 'new mailbox starts at ramp stage 0 with a zero cap until observed evidence earns stage 1' }, true, 'pause the mailbox', 'credentials imported');
  const planDigest = sha({ target: { wantMailboxes, allocation, reserve, maxPerDomain }, blockers: [...new Set(blockers)], steps: steps.map(s => [s.action, s.detail]) });
  const plannedSteps = steps.map(s => {
    if (!s.mutates) return s;
    const auth = authorizationFor(s.action, planDigest, authorizations, at);
    return { ...s, class: auth ? STATEMENT_CLASSES.AUTHORIZED_EXTERNAL_MUTATION : STATEMENT_CLASSES.PLAN, authorizationRef: auth ? text(auth.ref) : null, authorized: Boolean(auth) };
  });

  // ---- capacity: planned vs observed vs bottleneck ----
  const plannedFullRampPerDay = wantMailboxes * RAMP_STAGE_DAILY_CAP[3];
  const eligiblePerDay = demand && Number.isFinite(Number(demand.eligibleProspectsPerDay)) ? Math.max(0, Number(demand.eligibleProspectsPerDay)) : null;
  const capacityIsBinding = eligiblePerDay === null || currentEvidenceCapacityPerDay === 0 ? null : eligiblePerDay > currentEvidenceCapacityPerDay;
  const expansionRecommended = capacityIsBinding === true && green.length > 0;

  const plan = {
    version: WINNR_EXPANSION_PLANNER_VERSION,
    generatedAt: at.toISOString(),
    classes: STATEMENT_CLASSES,
    observedState,
    capacity: {
      class: STATEMENT_CLASSES.OBSERVED_PROVIDER_STATE,
      currentEvidenceCapacityPerDay,
      greenMailboxes: green.length,
      quarantinedMailboxes: quarantined.length,
      plannedFullRampPerDay,
      providerMaximumIsNotASafeSendRate: true,
      domainCountIsNotSendAuthority: true
    },
    topology: { class: STATEMENT_CLASSES.PLAN, targetMailboxes: wantMailboxes, activeDomains: allocation, reserveDomains: reserve, maxMailboxesPerDomain: maxPerDomain, protectedPrimaryDomains: [...primary], mailboxNameCount: names.length },
    quarantine: quarantineDisposition,
    steps: plannedSteps,
    expansionDecision: {
      capacityIsBinding,
      expansionRecommended,
      reason: capacityIsBinding === null ? 'demand-or-current-capacity-unknown: expansion is not recommended without proof that capacity is the bottleneck' : capacityIsBinding ? 'eligible demand exceeds measured evidence capacity' : 'measured evidence capacity already meets eligible demand: more mailboxes would solve nothing',
      purchaseRequiresExplicitFounderSpendAuthority: true
    },
    blockers: [...new Set(blockers)],
    refusals: [...new Set(refusals)],
    authorizedExternalMutations: plannedSteps.filter(s => s.class === STATEMENT_CLASSES.AUTHORIZED_EXTERNAL_MUTATION).map(s => ({ action: s.action, authorizationRef: s.authorizationRef })),
    externalMutationsPerformed: 0,
    providerCalls: 0,
    spend: 0,
    sendAuthority: false,
    truthBoundary: 'A plan is not provider truth: mailboxes, domains, DNS and entitlement exist only as far as OBSERVED_PROVIDER_STATE says. Planned capacity never raises a send cap; caps rise only from observed healthy evidence under the existing ramp.'
  };
  return { ...plan, planDigest };
}
