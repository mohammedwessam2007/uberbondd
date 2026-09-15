import crypto from 'node:crypto';

const sha256 = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const clean = value => String(value ?? '').trim();
const uniq = values => [...new Set(values)];

export const UBERSWARM_WORKER_STATES = Object.freeze(['READY','DEGRADED','OFFLINE','REVOKED']);

export function admitUberSwarmWorker(raw = {}, { now = new Date(), maxEvidenceAgeHours = 24 } = {}) {
  const reasons = [];
  const workerId = clean(raw.workerId);
  const platform = clean(raw.platform).toUpperCase();
  const ownerAuthorityRef = clean(raw.ownerAuthorityRef);
  const observedAtMs = Date.parse(String(raw.observedAt || ''));
  const nowMs = new Date(now).getTime();
  const ageHours = Number.isFinite(observedAtMs) ? (nowMs - observedAtMs) / 3_600_000 : Infinity;

  if (!workerId) reasons.push('worker-id-required');
  if (!['LINUX','MACOS','WINDOWS','ANDROID','IOS'].includes(platform)) reasons.push('supported-platform-required');
  if (raw.ownerAuthorized !== true) reasons.push('owner-authorization-required');
  if (!ownerAuthorityRef) reasons.push('owner-authority-receipt-required');
  if (raw.consentOrOwnershipVerified !== true) reasons.push('ownership-or-consent-proof-required');
  if (raw.stealthInstall === true || raw.deceptiveEnrollment === true) reasons.push('deceptive-enrollment-forbidden');
  if (raw.deviceCompromised === true) reasons.push('compromised-device-forbidden');
  if (!Number.isFinite(ageHours) || ageHours < -0.05 || ageHours > maxEvidenceAgeHours) reasons.push('worker-evidence-stale-or-undated');
  if (raw.state && !UBERSWARM_WORKER_STATES.includes(String(raw.state).toUpperCase())) reasons.push('worker-state-invalid');

  const memoryMb = Number(raw.memoryMb || 0);
  const logicalCpus = Number(raw.logicalCpus || 0);
  const thermalHeadroom = Number(raw.thermalHeadroom ?? 1);
  if (!Number.isFinite(memoryMb) || memoryMb < 256) reasons.push('worker-memory-insufficient');
  if (!Number.isFinite(logicalCpus) || logicalCpus < 1) reasons.push('worker-cpu-insufficient');
  if (!Number.isFinite(thermalHeadroom) || thermalHeadroom <= 0) reasons.push('worker-thermal-headroom-required');

  const capabilities = uniq((raw.capabilities || []).map(clean).filter(Boolean)).sort();
  const ready = reasons.length === 0 && String(raw.state || 'READY').toUpperCase() === 'READY';
  return {
    workerId: workerId || null,
    platform: platform || null,
    ready,
    reasonCodes: uniq(reasons),
    capabilities,
    memoryMb: Number.isFinite(memoryMb) ? memoryMb : 0,
    logicalCpus: Number.isFinite(logicalCpus) ? logicalCpus : 0,
    thermalHeadroom: Number.isFinite(thermalHeadroom) ? thermalHeadroom : 0,
    ownerAuthorityRef: ownerAuthorityRef || null,
    evidenceAgeHours: Number.isFinite(ageHours) ? Number(ageHours.toFixed(3)) : null
  };
}

export function compileUberSwarmPlan({ workers = [], tasks = [], now = new Date() } = {}) {
  const admitted = workers.map(worker => admitUberSwarmWorker(worker, { now }));
  const ready = admitted.filter(worker => worker.ready);
  const assignments = [];
  const unassigned = [];

  for (const task of tasks) {
    const taskId = clean(task.taskId);
    const required = uniq((task.requiredCapabilities || []).map(clean).filter(Boolean));
    const candidates = ready
      .filter(worker => required.every(cap => worker.capabilities.includes(cap)))
      .sort((a,b) => (b.logicalCpus * b.thermalHeadroom) - (a.logicalCpus * a.thermalHeadroom));
    if (!taskId || !candidates.length) {
      unassigned.push({ taskId: taskId || null, reason: taskId ? 'no-authorized-capable-worker' : 'task-id-required' });
      continue;
    }
    const worker = candidates[assignments.length % candidates.length];
    assignments.push({ taskId, workerId: worker.workerId, leaseSeconds: Math.max(30, Math.min(900, Number(task.leaseSeconds || 300))) });
  }

  const seed = { workers: admitted, assignments, unassigned };
  return {
    ...seed,
    planId: `ubswarm_${sha256(seed)}`,
    state: unassigned.length ? (assignments.length ? 'PARTIAL' : 'BLOCKED') : 'READY',
    automaticExternalEffectAuthority: false,
    externalEffectAuthority: 'NONE',
    truthBoundary: 'This plan schedules internal compute only. It does not grant messaging, network-relay, device-enrollment, spend, deployment, or provider authority.'
  };
}
