import crypto from 'node:crypto';

const sha256 = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const clean = value => String(value ?? '').trim();
const nonnegativeInt = value => Number.isFinite(Number(value)) && Number(value) >= 0 ? Math.floor(Number(value)) : null;
const uniq = values => [...new Set(values)];

function fresh(raw, now, maxAgeHours) {
  const observed = Date.parse(String(raw?.observedAt || ''));
  const current = new Date(now).getTime();
  const age = Number.isFinite(observed) ? (current - observed) / 3_600_000 : Infinity;
  return Number.isFinite(age) && age >= -0.05 && age <= maxAgeHours;
}

export function evaluateMailCapacityOffer(raw = {}, { now = new Date(), maxEvidenceAgeHours = 24 } = {}) {
  const reasons = [];
  const offerId = clean(raw.offerId);
  const routeId = clean(raw.routeId);
  const provider = clean(raw.provider).toLowerCase();
  const dailyCap = nonnegativeInt(raw.observedDailyCap);
  const usedToday = nonnegativeInt(raw.usedToday);
  const remaining = dailyCap == null || usedToday == null || usedToday > dailyCap ? null : dailyCap - usedToday;

  if (!offerId) reasons.push('offer-id-required');
  if (!routeId) reasons.push('route-id-required');
  if (!provider) reasons.push('provider-required');
  if (raw.ownerAuthorized !== true) reasons.push('capacity-owner-authorization-required');
  if (!clean(raw.authorityReceiptRef)) reasons.push('capacity-authority-receipt-required');
  if (raw.providerTermsCompatible !== true) reasons.push('provider-terms-compatibility-required');
  if (raw.senderIdentityAuthenticated !== true) reasons.push('authenticated-sender-identity-required');
  if (raw.reputationHealthy !== true) reasons.push('healthy-reputation-required');
  if (raw.openRelay === true) reasons.push('open-relay-forbidden');
  if (raw.residentialIpEvasion === true) reasons.push('residential-ip-evasion-forbidden');
  if (raw.disposableIdentityRotation === true) reasons.push('disposable-identity-rotation-forbidden');
  if (remaining == null) reasons.push('observed-capacity-and-usage-required');
  if (!fresh(raw, now, maxEvidenceAgeHours)) reasons.push('capacity-evidence-stale-or-undated');

  return {
    offerId: offerId || null,
    routeId: routeId || null,
    provider: provider || null,
    remainingDailyCap: reasons.length ? 0 : remaining,
    ready: reasons.length === 0,
    reasonCodes: uniq(reasons),
    authorityReceiptRef: clean(raw.authorityReceiptRef) || null,
    evidenceRef: clean(raw.evidenceRef) || null
  };
}

export function compileUberMailExchange({ offers = [], required = 0, now = new Date(), maxEvidenceAgeHours = 24 } = {}) {
  const evaluated = offers.map(offer => evaluateMailCapacityOffer(offer, { now, maxEvidenceAgeHours }));
  const seenOffers = new Set();
  const seenRoutes = new Set();
  const accepted = [];
  const rejected = [];

  for (const row of evaluated) {
    const reasons = [...row.reasonCodes];
    if (row.offerId && seenOffers.has(row.offerId)) reasons.push('duplicate-offer-id');
    if (row.routeId && seenRoutes.has(row.routeId)) reasons.push('duplicate-route-id');
    if (row.offerId) seenOffers.add(row.offerId);
    if (row.routeId) seenRoutes.add(row.routeId);
    const normalized = { ...row, ready: row.ready && reasons.length === 0, reasonCodes: uniq(reasons), remainingDailyCap: row.ready && reasons.length === 0 ? row.remainingDailyCap : 0 };
    (normalized.ready ? accepted : rejected).push(normalized);
  }

  const totalAvailable = accepted.reduce((sum, row) => sum + row.remainingDailyCap, 0);
  const need = Math.max(0, nonnegativeInt(required) ?? 0);
  const seed = { accepted, rejected, required: need, totalAvailable };
  return {
    ...seed,
    exchangeReceiptId: `ubmailx_${sha256(seed)}`,
    state: totalAvailable >= need ? 'CAPACITY_AVAILABLE' : 'CAPACITY_SHORTFALL',
    shortfall: Math.max(0, need - totalAvailable),
    automaticSendAuthority: false,
    externalEffectAuthority: 'NONE',
    truthBoundary: 'Capacity availability is evidence about explicitly authorized, terms-compatible transport only. It is not permission to send, inbox-placement proof, or a provider guarantee.'
  };
}
