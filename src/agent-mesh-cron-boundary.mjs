import crypto from 'node:crypto';

export const AGENT_MESH_CRON_BOUNDARY_POLICY_VERSION = 'agent-mesh-cron-boundary-1.0.0';
export const VERCEL_AGENT_MESH_CRON_SCHEDULE = '17 12 * * *';

export const ZERO_EXTERNAL_EFFECTS = Object.freeze({
  providerCalls: 0,
  messages: 0,
  purchases: 0,
  deployments: 0,
  credentialChanges: 0,
  dnsChanges: 0,
  productionMutations: 0,
  spendCents: 0
});

function cloneZeroEffects() {
  return { ...ZERO_EXTERNAL_EFFECTS };
}

function headerValue(value) {
  if (Array.isArray(value)) return value.length === 1 ? String(value[0] ?? '') : '';
  return typeof value === 'string' ? value : '';
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function fail(httpStatus, reasonCodes) {
  return {
    ok: false,
    policyVersion: AGENT_MESH_CRON_BOUNDARY_POLICY_VERSION,
    httpStatus,
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    businessEffectAuthority: 'NONE',
    externalEffectLedger: cloneZeroEffects()
  };
}

export function authorizeVercelCronRequest({
  method,
  authorizationHeader,
  cronSecret,
  scheduleHeader,
  expectedSchedule = VERCEL_AGENT_MESH_CRON_SCHEDULE
} = {}) {
  if (String(method || '').toUpperCase() !== 'GET') {
    return fail(405, ['cron-get-required']);
  }

  const secret = String(cronSecret || '');
  if (!secret) return fail(503, ['cron-secret-not-configured']);

  const authorization = headerValue(authorizationHeader);
  if (!safeEqual(authorization, `Bearer ${secret}`)) {
    return fail(401, ['cron-authorization-invalid']);
  }

  const schedule = headerValue(scheduleHeader).trim();
  if (!schedule) return fail(403, ['vercel-cron-schedule-header-required']);
  if (schedule !== expectedSchedule) return fail(403, ['vercel-cron-schedule-mismatch']);

  return {
    ok: true,
    policyVersion: AGENT_MESH_CRON_BOUNDARY_POLICY_VERSION,
    httpStatus: 200,
    schedule,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: cloneZeroEffects()
  };
}

export function deriveVercelDailyOccurrence({
  scheduleHeader,
  date = new Date(),
  expectedSchedule = VERCEL_AGENT_MESH_CRON_SCHEDULE
} = {}) {
  const schedule = headerValue(scheduleHeader).trim();
  if (!schedule) return fail(400, ['vercel-cron-schedule-header-required']);
  if (schedule !== expectedSchedule) return fail(400, ['vercel-cron-schedule-mismatch']);

  const instant = date instanceof Date ? new Date(date.getTime()) : new Date(date);
  if (!Number.isFinite(instant.getTime())) return fail(400, ['valid-cron-observed-at-required']);

  const utcDay = instant.toISOString().slice(0, 10);
  const scheduleDigest = crypto.createHash('sha256').update(schedule).digest('hex').slice(0, 16);
  return {
    ok: true,
    policyVersion: AGENT_MESH_CRON_BOUNDARY_POLICY_VERSION,
    schedule,
    utcDay,
    occurrenceKey: `vercel-cron:agent-mesh:${utcDay}:${scheduleDigest}`,
    identityRule: 'DECLARED_SCHEDULE_PLUS_UTC_DAY_SOURCE_BOUND_SEPARATELY',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: cloneZeroEffects()
  };
}

export function publicCronResult(result = {}) {
  return {
    ok: result.ok === true,
    status: String(result.status || (result.ok ? 'OK' : 'REFUSED')).slice(0, 80),
    occurrenceKey: result.occurrenceKey || null,
    cycleId: result.cycleId || null,
    cycleReceiptState: result.cycleReceiptState || null,
    duplicateDelivery: result.duplicateDelivery === true,
    activationStatus: result.activationStatus || null,
    permittedMode: result.permittedMode || null,
    workersConfigured: Number.isSafeInteger(result.workersConfigured) ? result.workersConfigured : 0,
    workersWithheld: Number.isSafeInteger(result.workersWithheld) ? result.workersWithheld : 0,
    reasonCodes: Array.isArray(result.reasonCodes) ? result.reasonCodes.slice(0, 20) : [],
    businessEffectAuthority: 'NONE',
    externalEffectLedger: cloneZeroEffects()
  };
}
