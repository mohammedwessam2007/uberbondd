import crypto from 'node:crypto';

export const AGENT_MESH_CRON_BOUNDARY_POLICY_VERSION = 'agent-mesh-cron-boundary-1.0.0';
export const AGENT_MESH_CRON_PATH = '/api/agent-mesh-cron';
export const AGENT_MESH_CRON_SCHEDULE = '17 12 * * *';

const MAX_HEADER_LENGTH = 512;

function text(value, max = MAX_HEADER_LENGTH) {
  return String(value ?? '').trim().slice(0, max);
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left ?? ''), 'utf8');
  const b = Buffer.from(String(right ?? ''), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function header(headers, name) {
  if (!headers) return '';
  if (typeof headers.get === 'function') return text(headers.get(name));
  const needle = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (String(key).toLowerCase() === needle) return text(Array.isArray(value) ? value[0] : value);
  }
  return '';
}

function utcDay(date) {
  const parsed = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(parsed.getTime())) throw new Error('invalid-cron-date');
  return parsed.toISOString().slice(0, 10);
}

export function deriveAgentMeshCronOccurrenceKey({ date = new Date(), schedule = AGENT_MESH_CRON_SCHEDULE } = {}) {
  const normalizedSchedule = text(schedule, 120);
  if (!normalizedSchedule) throw new Error('cron-schedule-required');
  return `vercel-cron:${normalizedSchedule}:${utcDay(date)}`;
}

export function authorizeAgentMeshCronRequest({
  method,
  headers,
  cronSecret,
  date = new Date(),
  expectedSchedule = AGENT_MESH_CRON_SCHEDULE
} = {}) {
  if (String(method || '').toUpperCase() !== 'GET') {
    return { ok: false, statusCode: 405, reasonCode: 'cron-method-not-allowed' };
  }

  const secret = String(cronSecret ?? '');
  if (!secret) {
    return { ok: false, statusCode: 503, reasonCode: 'cron-secret-not-configured' };
  }

  const authorization = header(headers, 'authorization');
  const expectedAuthorization = `Bearer ${secret}`;
  if (!safeEqual(authorization, expectedAuthorization)) {
    return { ok: false, statusCode: 401, reasonCode: 'cron-authorization-invalid' };
  }

  const observedSchedule = header(headers, 'x-vercel-cron-schedule');
  if (!observedSchedule) {
    return { ok: false, statusCode: 400, reasonCode: 'vercel-cron-schedule-header-required' };
  }
  if (!safeEqual(observedSchedule, expectedSchedule)) {
    return { ok: false, statusCode: 409, reasonCode: 'vercel-cron-schedule-mismatch' };
  }

  return {
    ok: true,
    statusCode: 200,
    policyVersion: AGENT_MESH_CRON_BOUNDARY_POLICY_VERSION,
    occurrenceKey: deriveAgentMeshCronOccurrenceKey({ date, schedule: expectedSchedule }),
    executionMode: 'ZERO_EXTERNAL_IO_CANARY',
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE'
  };
}

export function publicAgentMeshCronResult(result = {}) {
  return {
    ok: result?.ok === true,
    status: text(result?.status, 80) || null,
    reasonCodes: Array.isArray(result?.reasonCodes)
      ? [...new Set(result.reasonCodes.map(code => text(code, 120)).filter(Boolean))].slice(0, 12)
      : [],
    cycleId: text(result?.cycleId, 80) || null,
    cycleReceiptState: text(result?.cycleReceiptState, 40) || null,
    duplicateDelivery: result?.duplicateDelivery === true,
    executionMode: text(result?.executionMode, 80) || 'ZERO_EXTERNAL_IO_CANARY',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: result?.externalEffectLedger && typeof result.externalEffectLedger === 'object'
      ? Object.fromEntries(Object.entries(result.externalEffectLedger).map(([key, value]) => [text(key, 80), Number.isFinite(Number(value)) ? Number(value) : 0]))
      : {}
  };
}
