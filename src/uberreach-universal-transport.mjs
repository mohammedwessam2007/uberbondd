import crypto from 'node:crypto';

const sha256 = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const clean = value => String(value ?? '').trim();
const uniq = values => [...new Set(values)];

export const UBERREACH_CHANNELS = Object.freeze(['EMAIL','WEB_CONTACT','MATRIX','ACTIVITYPUB','NOSTR','XMTP','BUSINESS_API','ATTENTION_API']);

export function evaluateReachEndpoint(raw = {}, { now = new Date(), maxEvidenceAgeHours = 24 } = {}) {
  const reasons = [];
  const endpointId = clean(raw.endpointId);
  const channel = clean(raw.channel).toUpperCase();
  const observed = Date.parse(String(raw.observedAt || ''));
  const ageHours = Number.isFinite(observed) ? (new Date(now).getTime() - observed) / 3_600_000 : Infinity;
  if (!endpointId) reasons.push('endpoint-id-required');
  if (!UBERREACH_CHANNELS.includes(channel)) reasons.push('supported-channel-required');
  if (raw.publicOrAuthorized !== true) reasons.push('public-or-authorized-endpoint-required');
  if (!clean(raw.evidenceRef)) reasons.push('endpoint-evidence-required');
  if (raw.suppressed === true) reasons.push('endpoint-suppressed');
  if (raw.platformTermsCompatible !== true) reasons.push('platform-terms-compatibility-required');
  if (!Number.isFinite(ageHours) || ageHours < -0.05 || ageHours > maxEvidenceAgeHours) reasons.push('endpoint-evidence-stale-or-undated');
  return {
    endpointId: endpointId || null,
    channel: channel || null,
    recipientId: clean(raw.recipientId) || null,
    ready: reasons.length === 0,
    reasonCodes: uniq(reasons),
    evidenceRef: clean(raw.evidenceRef) || null,
    evidenceAgeHours: Number.isFinite(ageHours) ? Number(ageHours.toFixed(3)) : null
  };
}

export function compileUniversalReachPlan({ opportunities = [], endpoints = [], now = new Date() } = {}) {
  const evaluated = endpoints.map(row => evaluateReachEndpoint(row, { now }));
  const readyByRecipient = new Map();
  for (const row of evaluated.filter(row => row.ready && row.recipientId)) {
    const list = readyByRecipient.get(row.recipientId) || [];
    list.push(row);
    readyByRecipient.set(row.recipientId, list);
  }
  const routes = [];
  const unreachable = [];
  for (const opportunity of opportunities) {
    const opportunityId = clean(opportunity.opportunityId);
    const recipientId = clean(opportunity.recipientId);
    const candidates = readyByRecipient.get(recipientId) || [];
    const preferred = (opportunity.preferredChannels || []).map(value => clean(value).toUpperCase());
    const ranked = [...candidates].sort((a,b) => {
      const ai = preferred.indexOf(a.channel); const bi = preferred.indexOf(b.channel);
      return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
    });
    if (!opportunityId || !recipientId || !ranked.length) {
      unreachable.push({ opportunityId: opportunityId || null, recipientId: recipientId || null, reason: 'no-ready-legitimate-channel' });
      continue;
    }
    routes.push({ opportunityId, recipientId, endpointId: ranked[0].endpointId, channel: ranked[0].channel });
  }
  const seed = { routes, unreachable };
  return {
    ...seed,
    planId: `uberreach_${sha256(seed)}`,
    state: unreachable.length ? (routes.length ? 'PARTIAL' : 'BLOCKED') : 'READY',
    automaticContactAuthority: false,
    externalEffectAuthority: 'NONE',
    truthBoundary: 'A route means a legitimate reachable endpoint exists. It does not grant permission to contact or prove delivery, response, revenue, or equivalence to the SMTP 100K certificate.'
  };
}
