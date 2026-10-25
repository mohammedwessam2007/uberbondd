import { types as nodeTypes } from 'node:util';

/**
 * PHOENIX Railway Free cost-floor estimator, T235 hardening (2026-10-25).
 * Planning only. Published pricing may change; not a bill, account receipt,
 * entitlement proof, zero-overage guarantee, or deployment authority.
 * Never reads or prints secrets. Rejects hostile JS accessors and Proxies.
 */
export const PRICING = Object.freeze({
  memoryGbSecondUsd: 0.00000386,
  cpuVcpuSecondUsd: 0.00000772,
  volumeGbSecondUsd: 0.00000006,
  egressGbUsd: 0.05,
  freeMonthlyCreditUsd: 1,
  observedDate: '2026-10-25'
});
const ROOT = new Set(['billingPeriodSeconds','services','volumeGb','volumeSeconds','egressGb','remainingFreeCreditUsd','freePlanAuthenticated','providerZeroOverageVerified','requiresRailwayCron','requiresCustomDomain']);
const SERVICE = new Set(['role','memoryGb','averageCpuVcpu','runningSeconds']);
const finite = x => typeof x === 'number' && Number.isFinite(x) && x >= 0;
const safeRound = x => Math.round(x * 1e6) / 1e6;

// Snapshot own data properties only, before any reads. Never access untrusted
// object properties via ordinary property lookup or destructuring.
function ownDataSnapshot(obj, allowed, required) {
  if (obj === null || typeof obj !== 'object' || nodeTypes.isProxy(obj) || Array.isArray(obj) ||
      Object.getPrototypeOf(obj) !== Object.prototype) return null;
  const keys = Reflect.ownKeys(obj);
  if (keys.length !== required.size || keys.some(k => typeof k !== 'string' || !allowed.has(k))) return null;
  const out = Object.create(null);
  for (const k of keys) {
    const d = Object.getOwnPropertyDescriptor(obj, k);
    if (!d || !Object.hasOwn(d, 'value')) return null;
    out[k] = d.value;
  }
  for (const k of required) if (!Object.hasOwn(out, k)) return null;
  return out;
}

function snapshotTwoServices(array) {
  if (nodeTypes.isProxy(array) || !Array.isArray(array) || Object.getPrototypeOf(array) !== Array.prototype) return null;
  const keys = Reflect.ownKeys(array);
  if (keys.length !== 3 || !keys.includes('0') || !keys.includes('1') || !keys.includes('length')) return null;
  const length = Object.getOwnPropertyDescriptor(array, 'length');
  if (!length || length.value !== 2) return null;
  const a = Object.getOwnPropertyDescriptor(array, '0');
  const b = Object.getOwnPropertyDescriptor(array, '1');
  if (!a || !b || !Object.hasOwn(a, 'value') || !Object.hasOwn(b, 'value')) return null;
  return [a.value, b.value];
}

export function estimateRailwayFreeFloor(input) {
  const blocked = reason => Object.freeze({status:'HOLD',reason,deploymentPermitted:false,resourceCreationPermitted:false,spendingPermitted:false});
  try {
    const root = ownDataSnapshot(input, ROOT, ROOT);
    if (!root) return blocked('INVALID_ROOT_SHAPE');
    const {billingPeriodSeconds:t,volumeGb,volumeSeconds,egressGb,remainingFreeCreditUsd:credit} = root;
    const services = snapshotTwoServices(root.services);
    if (!finite(t) || t <= 0 || t > 31*86400 || !services ||
        !finite(volumeGb) || volumeGb > 1e6 || !finite(volumeSeconds) || volumeSeconds > t ||
        !finite(egressGb) || egressGb > 1e6 || !finite(credit) || credit > PRICING.freeMonthlyCreditUsd)
      return blocked('INVALID_USAGE_INPUT');
    const roles = new Set();
    let memoryUsd=0,cpuUsd=0;
    for (const service of services) {
      const s = ownDataSnapshot(service, SERVICE, SERVICE);
      if (!s || !['web','worker'].includes(s.role) || roles.has(s.role) ||
          !finite(s.memoryGb) || !finite(s.averageCpuVcpu) || !finite(s.runningSeconds) ||
          s.runningSeconds > t || s.memoryGb > 0.5 || s.averageCpuVcpu > 1)
        return blocked('INVALID_SERVICE_SCOPE_OR_USAGE');
      roles.add(s.role);
      memoryUsd += s.memoryGb * s.runningSeconds * PRICING.memoryGbSecondUsd;
      cpuUsd += s.averageCpuVcpu * s.runningSeconds * PRICING.cpuVcpuSecondUsd;
    }
    if (!roles.has('web') || !roles.has('worker')) return blocked('WEB_WORKER_SEPARATION_REQUIRED');
    const volumeUsd=volumeGb*volumeSeconds*PRICING.volumeGbSecondUsd;
    const egressUsd=egressGb*PRICING.egressGbUsd;
    const total=memoryUsd+cpuUsd+volumeUsd+egressUsd;
    if (![memoryUsd,cpuUsd,volumeUsd,egressUsd,total].every(Number.isFinite)) return blocked('INVALID_COST_ARITHMETIC');
    const costs=Object.freeze({memoryUsd:safeRound(memoryUsd),cpuUsd:safeRound(cpuUsd),volumeUsd:safeRound(volumeUsd),egressUsd:safeRound(egressUsd),totalUsd:safeRound(total)});
    const reasons=[];
    if (root.freePlanAuthenticated !== true) reasons.push('FREE_PLAN_NOT_AUTHENTICATED');
    if (root.providerZeroOverageVerified !== true) reasons.push('ZERO_OVERAGE_NOT_VERIFIED');
    // A priced volume is a billable resource, even when its projected usage
    // fits inside promotional credit or its measured duration is zero.
    // Zero-new-charge missions cannot infer permission to provision it.
    if (volumeGb !== 0 || volumeSeconds !== 0) reasons.push('BILLABLE_VOLUME_NOT_AUTHORIZED');
    if (root.requiresRailwayCron !== false) reasons.push('FREE_PLAN_CRON_NOT_AVAILABLE');
    if (root.requiresCustomDomain !== false) reasons.push('FREE_PLAN_CUSTOM_DOMAIN_NOT_AVAILABLE');
    if (total > credit) reasons.push('ESTIMATED_COST_EXCEEDS_REMAINING_CREDIT');
    return Object.freeze({status:reasons.length?'HOLD':'BUDGET_PLAUSIBLE_UNVERIFIED',reasons,costs,
      creditUsd:credit,pricingDate:PRICING.observedDate,providerUsageMeasured:false,
      deploymentPermitted:false,resourceCreationPermitted:false,spendingPermitted:false});
  } catch { return blocked('UNTRUSTED_INPUT_REFUSED'); }
}