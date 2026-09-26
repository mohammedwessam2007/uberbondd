import crypto from 'node:crypto';
import { UBERDOSO_ROOTS } from './uberdoso-kernel.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const UBEREGRESS_VERSION = 'uberbond.uberegress.v1';
export const UBEREGRESS_ROUTE_TYPES = Object.freeze([
  'SELF_HOSTED_DIRECT_MX',
  'AUTHORIZED_SMTP_RELAY',
  'AUTHORIZED_HTTP_RELAY'
]);

const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const finite = value => Number.isFinite(Number(value)) ? Number(value) : null;

function ageHours(value, now) {
  const observed = Date.parse(String(value || ''));
  const current = now instanceof Date ? now.getTime() : Date.parse(String(now || ''));
  if (!Number.isFinite(observed) || !Number.isFinite(current)) return Infinity;
  return (current - observed) / 3600000;
}

function zero(extra = {}) {
  return {
    version: UBEREGRESS_VERSION,
    externalEffectAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS),
    ...extra
  };
}

function evaluateRoute(route = {}, { now, maxEvidenceAgeHours }) {
  const routeId = clean(route.routeId || route.id, 180);
  const type = clean(route.type, 80).toUpperCase();
  const reasons = [];
  if (!routeId) reasons.push('route-id-required');
  if (!UBEREGRESS_ROUTE_TYPES.includes(type)) reasons.push('supported-route-type-required');
  if (route.authorized !== true) reasons.push('route-not-authorized');
  if (route.termsCompatible !== true) reasons.push('route-terms-not-confirmed-compatible');
  if (clean(route.status, 80).toUpperCase() !== 'READY') reasons.push('route-not-ready');

  const evidenceAgeHours = ageHours(route.observedAt, now);
  if (!Number.isFinite(evidenceAgeHours) || evidenceAgeHours < -0.05 || evidenceAgeHours > maxEvidenceAgeHours) {
    reasons.push('route-evidence-stale-or-undated');
  }

  const dailyCap = finite(route.observedColdDailyCap);
  if (dailyCap == null || dailyCap < 0) reasons.push('observed-cold-daily-cap-required');

  if (type === 'SELF_HOSTED_DIRECT_MX') {
    if (route.outboundPort25Reachable !== true) reasons.push('outbound-port25-not-observed-reachable');
    if (route.staticPublicIp !== true) reasons.push('static-public-ip-required');
    if (route.ptrVerified !== true) reasons.push('ptr-not-verified');
    if (route.tlsReady !== true) reasons.push('tls-not-ready');
  }
  if (type === 'AUTHORIZED_SMTP_RELAY' || type === 'AUTHORIZED_HTTP_RELAY') {
    if (route.relayAuthenticated !== true) reasons.push('relay-authentication-not-observed');
    if (route.providerReady !== true) reasons.push('relay-provider-not-ready');
  }

  return {
    routeId: routeId || null,
    type: type || null,
    provider: clean(route.provider, 120) || null,
    evidenceSource: clean(route.evidenceSource, 700) || null,
    observedAt: route.observedAt || null,
    evidenceAgeHours: Number.isFinite(evidenceAgeHours) ? Number(evidenceAgeHours.toFixed(3)) : null,
    observedColdDailyCap: reasons.length ? 0 : Math.floor(dailyCap),
    ready: reasons.length === 0,
    reasonCodes: [...new Set(reasons)]
  };
}

/**
 * Compile only observed, authorized outbound routes into usable capacity.
 * Route count, source-IP count, and mailbox count never create capacity by
 * themselves. Every counted unit needs a fresh observed cold-send cap.
 */
export function compileUberEgressTopology({
  routes = [],
  domainBindings = [],
  roots = UBERDOSO_ROOTS,
  maxEvidenceAgeHours = 72,
  now = new Date()
} = {}) {
  const canonicalRoots = [...UBERDOSO_ROOTS].sort();
  const suppliedRoots = [...new Set((Array.isArray(roots) ? roots : []).map(value => clean(value, 253).toLowerCase()).filter(Boolean))].sort();
  if (suppliedRoots.length !== canonicalRoots.length || suppliedRoots.some((value, index) => value !== canonicalRoots[index])) {
    return zero({ ok: false, status: 'UBEREGRESS_REFUSED', reasonCodes: ['exact-owned-roots-required'], totalReadyColdDailyCap: 0 });
  }

  const maxAge = finite(maxEvidenceAgeHours);
  if (maxAge == null || maxAge <= 0) {
    return zero({ ok: false, status: 'UBEREGRESS_REFUSED', reasonCodes: ['positive-evidence-age-window-required'], totalReadyColdDailyCap: 0 });
  }

  const evaluations = (Array.isArray(routes) ? routes : []).map(route => evaluateRoute(route, { now, maxEvidenceAgeHours: maxAge }));
  const byId = new Map(evaluations.filter(row => row.routeId).map(row => [row.routeId, row]));
  const bindings = [];
  const bindingReasons = [];

  for (const binding of Array.isArray(domainBindings) ? domainBindings : []) {
    const domain = clean(binding?.domain, 253).toLowerCase();
    const routeId = clean(binding?.routeId, 180);
    const route = byId.get(routeId);
    const reasons = [];
    if (!canonicalRoots.includes(domain)) reasons.push('binding-domain-not-owned');
    if (!route) reasons.push('binding-route-not-found');
    if (route && !route.ready) reasons.push('binding-route-not-ready');
    if (binding.authorized !== true) reasons.push('binding-not-authorized');
    if (reasons.length) bindingReasons.push(...reasons.map(reason => `${domain || 'unknown'}:${reason}`));
    bindings.push({ domain: domain || null, routeId: routeId || null, ready: reasons.length === 0, reasonCodes: reasons });
  }

  const boundReadyRouteIds = new Set(bindings.filter(row => row.ready).map(row => row.routeId));
  const readyRoutes = evaluations.filter(row => row.ready && boundReadyRouteIds.has(row.routeId));
  const totalReadyColdDailyCap = readyRoutes.reduce((sum, row) => sum + row.observedColdDailyCap, 0);
  const coveredDomains = new Set(bindings.filter(row => row.ready).map(row => row.domain));
  const missingDomainBindings = canonicalRoots.filter(domain => !coveredDomains.has(domain));
  const status = totalReadyColdDailyCap > 0 && missingDomainBindings.length === 0
    ? 'UBEREGRESS_READY'
    : totalReadyColdDailyCap > 0
      ? 'UBEREGRESS_PARTIAL'
      : 'UBEREGRESS_BLOCKED';

  const topology = {
    schemaVersion: 'uberegress.topology.v1',
    roots: canonicalRoots,
    routeEvaluations: evaluations,
    bindings,
    readyRouteIds: readyRoutes.map(row => row.routeId),
    rejectedRouteIds: evaluations.filter(row => !row.ready).map(row => row.routeId).filter(Boolean),
    missingDomainBindings,
    bindingReasonCodes: [...new Set(bindingReasons)],
    totalReadyColdDailyCap,
    qualityRule: 'CAPACITY_COUNTS_ONLY_FRESH_OBSERVED_AUTHORIZED_ROUTES',
    quotaRule: 'NO_PROVIDER_QUOTA_BYPASS_NO_BILLING_EVASION_NO_REPUTATION_EVASION',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS)
  };
  topology.topologyDigest = digest(topology);

  return zero({ ok: true, status, topology, totalReadyColdDailyCap });
}
