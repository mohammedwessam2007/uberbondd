// UberBond free-first outreach economic router.
//
// This module encodes current public research as routing constraints, not as
// commercial outcomes or provider authorization. A free quota is usable only
// for message purposes the provider permits. Cold B2B never falls through to
// an opt-in/transactional provider merely because free quota remains.

export const FREE_FIRST_OUTREACH_POLICY_VERSION = 'free-first-outreach-1.0.0';

export const MESSAGE_PURPOSES = Object.freeze([
  'TRANSACTIONAL',
  'CUSTOMER_OPERATIONAL',
  'OPT_IN_MARKETING',
  'PARTNER_OPT_IN',
  'ONE_TO_ONE_B2B',
  'COLD_B2B',
  'INTERNAL',
  'PUSH_OPT_IN',
  'INBOUND_REPLY'
]);

const PERMISSIONED = Object.freeze([
  'TRANSACTIONAL',
  'CUSTOMER_OPERATIONAL',
  'OPT_IN_MARKETING',
  'PARTNER_OPT_IN',
  'INTERNAL'
]);

function provider({ id, quotaDaily = null, quotaMonthly = null, recipientCap = null, allowedPurposeClasses = PERMISSIONED, api = false, smtp = false, webhooks = false, policyUrl, pricingUrl, notes = '' }) {
  return Object.freeze({
    id,
    costCents: 0,
    quotaDaily,
    quotaMonthly,
    recipientCap,
    allowedPurposeClasses: Object.freeze([...allowedPurposeClasses]),
    coldAllowed: allowedPurposeClasses.includes('COLD_B2B'),
    api,
    smtp,
    webhooks,
    policyUrl,
    pricingUrl,
    observedAt: '2026-09-01T00:00:00.000Z',
    policyFreshUntil: '2026-10-01T00:00:00.000Z',
    notes
  });
}

// Current one-legitimate-allocation/provider research baseline. Quotas are
// intentionally the stricter of the provider's published daily/monthly limits
// where both exist. These records do not create accounts or credentials.
export const FREE_FIRST_PROVIDER_REGISTRY = Object.freeze([
  provider({ id: 'sender-net', quotaMonthly: 15000, recipientCap: 2500, policyUrl: 'https://www.sender.net/anti-spam-policy/', pricingUrl: 'https://www.sender.net/pricing/', notes: 'Permissioned marketing only; unsolicited traffic is not routed.' }),
  provider({ id: 'sendpulse', quotaMonthly: 15000, recipientCap: 500, policyUrl: 'https://sendpulse.com/legal/antispam', pricingUrl: 'https://sendpulse.com/pricing', notes: 'Permissioned marketing only.' }),
  provider({ id: 'onesignal-email', quotaMonthly: 10000, api: true, policyUrl: 'https://onesignal.com/tos', pricingUrl: 'https://onesignal.com/pricing', notes: 'Permissioned/customer messaging; push is a separate capability.' }),
  provider({ id: 'brevo', quotaDaily: 300, api: true, smtp: true, policyUrl: 'https://www.brevo.com/legal/antispam-policy/', pricingUrl: 'https://www.brevo.com/pricing/', notes: 'Unsolicited campaigns are not routed.' }),
  provider({ id: 'mailjet', quotaDaily: 200, quotaMonthly: 6000, recipientCap: 1000, api: true, smtp: true, webhooks: true, policyUrl: 'https://www.mailjet.com/legal/acceptable-use-policy/', pricingUrl: 'https://www.mailjet.com/pricing/', notes: 'Unsolicited mail and third-party lists are not routed.' }),
  provider({ id: 'mailtrap', quotaMonthly: 4000, api: true, smtp: true, policyUrl: 'https://mailtrap.io/terms-of-service/', pricingUrl: 'https://mailtrap.io/pricing/', notes: 'Commercial mail requires consent.' }),
  provider({ id: 'resend', quotaDaily: 100, quotaMonthly: 3000, api: true, smtp: true, policyUrl: 'https://resend.com/legal/acceptable-use', pricingUrl: 'https://resend.com/pricing', notes: 'AUP explicitly prohibits cold outreach.' }),
  provider({ id: 'mailgun', quotaDaily: 100, api: true, smtp: true, webhooks: true, policyUrl: 'https://www.mailgun.com/legal/aup/', pricingUrl: 'https://www.mailgun.com/pricing/', notes: 'Cold use is fail-closed until affirmative provider-policy evidence exists.' }),
  provider({ id: 'elastic-email', quotaDaily: 100, quotaMonthly: 3000, api: true, smtp: true, policyUrl: 'https://elasticemail.com/resources/usage-policies/acceptable-use-policy', pricingUrl: 'https://elasticemail.com/email-api-pricing', notes: 'AUP prohibits unsolicited commercial email.' }),
  provider({ id: 'mailerlite', quotaMonthly: 2500, recipientCap: 250, policyUrl: 'https://www.mailerlite.com/legal/anti-spam-policy', pricingUrl: 'https://www.mailerlite.com/pricing', notes: 'Permission-based lists only.' }),
  provider({ id: 'hubspot-marketing-email', quotaMonthly: 2000, policyUrl: 'https://legal.hubspot.com/acceptable-use', pricingUrl: 'https://www.hubspot.com/pricing/marketing', notes: 'Marketing quota is not treated as a cold-email pool.' }),
  provider({ id: 'smtp2go', quotaDaily: 200, quotaMonthly: 1000, api: true, smtp: true, policyUrl: 'https://www.smtp2go.com/terms/', pricingUrl: 'https://www.smtp2go.com/pricing/', notes: 'Official terms prohibit unsolicited email.' }),
  provider({ id: 'mailersend', quotaDaily: 100, quotaMonthly: 500, api: true, smtp: true, policyUrl: 'https://www.mailersend.com/legal/acceptable-use-policy', pricingUrl: 'https://www.mailersend.com/pricing', notes: 'Marketing messages require consent.' }),
  provider({ id: 'mailchimp', quotaDaily: 250, quotaMonthly: 500, recipientCap: 250, policyUrl: 'https://mailchimp.com/legal/acceptable_use/', pricingUrl: 'https://mailchimp.com/pricing/marketing/', notes: 'Third-party/public-data lists are not routed.' }),
  provider({ id: 'omnisend', quotaMonthly: 500, recipientCap: 250, policyUrl: 'https://www.omnisend.com/terms/', pricingUrl: 'https://www.omnisend.com/pricing/', notes: 'Cold eligibility not affirmatively proven; fail closed.' }),
  provider({ id: 'postmark-developer', quotaMonthly: 100, api: true, smtp: true, policyUrl: 'https://postmarkapp.com/terms-of-service', pricingUrl: 'https://postmarkapp.com/pricing', notes: 'Permission-based subscription traffic only.' })
]);

export const EXPERIMENTAL_COLD_ROUTES = Object.freeze([
  Object.freeze({
    id: 'oracle-always-free-postal',
    status: 'EXPERIMENTAL_NOT_PRODUCTION',
    costCents: 0,
    allowedPurposeClasses: Object.freeze(['COLD_B2B']),
    fixedDailyCapacity: null,
    blockers: Object.freeze([
      'OUTBOUND_SMTP_PERMISSION_UNPROVEN',
      'PTR_RDNS_UNPROVEN',
      'SPF_DKIM_DMARC_UNPROVEN',
      'IP_REPUTATION_UNPROVEN',
      'SEED_PLACEMENT_UNPROVEN',
      'PROVIDER_AUP_FIT_UNPROVEN'
    ])
  })
]);

export function daysInUtcMonth(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) throw new TypeError('invalid-date');
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}

export function providerMonthlyCapacity(record, date = new Date()) {
  const days = daysInUtcMonth(date);
  const dailyBound = record.quotaDaily == null ? Infinity : Math.max(0, Number(record.quotaDaily)) * days;
  const monthlyBound = record.quotaMonthly == null ? Infinity : Math.max(0, Number(record.quotaMonthly));
  const capacity = Math.min(dailyBound, monthlyBound);
  return Number.isFinite(capacity) ? capacity : 0;
}

export function freeCapacitySnapshot({ date = new Date('2026-09-01T00:00:00.000Z'), registry = FREE_FIRST_PROVIDER_REGISTRY } = {}) {
  const days = daysInUtcMonth(date);
  const providers = registry.map(record => ({ id: record.id, monthlyCapacity: providerMonthlyCapacity(record, date), coldAllowed: record.coldAllowed }));
  const monthlyCapacity = providers.reduce((sum, item) => sum + item.monthlyCapacity, 0);
  const coldMonthlyCapacity = providers.filter(item => item.coldAllowed).reduce((sum, item) => sum + item.monthlyCapacity, 0);
  return {
    policyVersion: FREE_FIRST_OUTREACH_POLICY_VERSION,
    monthDays: days,
    providerCount: providers.length,
    monthlyCapacity,
    normalizedDailyCapacity: monthlyCapacity / days,
    coldMonthlyCapacity,
    coldNormalizedDailyCapacity: coldMonthlyCapacity / days,
    providers
  };
}

function usageFor(usage, providerId) {
  const value = usage?.[providerId] || {};
  return { dailyUsed: Math.max(0, Number(value.dailyUsed || 0)), monthlyUsed: Math.max(0, Number(value.monthlyUsed || 0)) };
}

export function remainingQuota(record, { date = new Date(), usage = {} } = {}) {
  const days = daysInUtcMonth(date);
  const current = usageFor(usage, record.id);
  const dailyRemaining = record.quotaDaily == null ? Infinity : Math.max(0, Number(record.quotaDaily) - current.dailyUsed);
  const monthlyRemaining = record.quotaMonthly == null ? Infinity : Math.max(0, Number(record.quotaMonthly) - current.monthlyUsed);
  const monthlyAverageRemaining = Number.isFinite(monthlyRemaining) ? monthlyRemaining / days : Infinity;
  return {
    dailyRemaining,
    monthlyRemaining,
    planningDailyRemaining: Math.min(dailyRemaining, monthlyAverageRemaining)
  };
}

export function providerEligibility(record, { purpose, date = new Date(), usage = {} } = {}) {
  if (!MESSAGE_PURPOSES.includes(purpose)) return { ok: false, reason: 'UNKNOWN_PURPOSE' };
  const now = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(now.getTime())) return { ok: false, reason: 'INVALID_DATE' };
  if (Date.parse(record.policyFreshUntil || '') <= now.getTime()) return { ok: false, reason: 'POLICY_STALE' };
  if (!record.allowedPurposeClasses.includes(purpose)) return { ok: false, reason: purpose === 'COLD_B2B' ? 'COLD_PROHIBITED' : 'PURPOSE_PROHIBITED' };
  const quota = remainingQuota(record, { date: now, usage });
  if (quota.dailyRemaining <= 0 || quota.monthlyRemaining <= 0 || quota.planningDailyRemaining <= 0) return { ok: false, reason: 'QUOTA_EXHAUSTED', quota };
  return { ok: true, reason: 'ELIGIBLE', quota };
}

export function routeFreeFirst({ purpose, date = new Date(), usage = {}, registry = FREE_FIRST_PROVIDER_REGISTRY } = {}) {
  const candidates = registry
    .map(record => ({ record, eligibility: providerEligibility(record, { purpose, date, usage }) }))
    .filter(item => item.eligibility.ok)
    .sort((a, b) => {
      const delta = b.eligibility.quota.planningDailyRemaining - a.eligibility.quota.planningDailyRemaining;
      if (delta !== 0) return delta;
      return a.record.id.localeCompare(b.record.id);
    });
  if (!candidates.length) {
    return {
      ok: false,
      status: purpose === 'COLD_B2B' ? 'NO_FREE_COLD_ROUTE' : 'NO_ELIGIBLE_FREE_ROUTE',
      purpose,
      policyVersion: FREE_FIRST_OUTREACH_POLICY_VERSION
    };
  }
  const winner = candidates[0];
  return {
    ok: true,
    status: 'FREE_ROUTE_SELECTED',
    purpose,
    provider: winner.record.id,
    costCents: 0,
    quota: winner.eligibility.quota,
    policyVersion: FREE_FIRST_OUTREACH_POLICY_VERSION
  };
}

export function coldRouteReadiness(route = EXPERIMENTAL_COLD_ROUTES[0], proofs = {}) {
  const missing = (route.blockers || []).filter(blocker => proofs[blocker] !== true);
  return {
    ok: route.status === 'PRODUCTION_READY' && missing.length === 0 && Number.isFinite(route.fixedDailyCapacity) && route.fixedDailyCapacity > 0,
    route: route.id,
    status: route.status,
    fixedDailyCapacity: route.fixedDailyCapacity,
    missing
  };
}
