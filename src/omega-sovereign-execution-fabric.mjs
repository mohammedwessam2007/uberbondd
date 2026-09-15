import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const OMEGA_SOVEREIGN_EXECUTION_FABRIC_VERSION = 'uberbond.omega-sovereign-execution-fabric.v1';

export const OMEGA_EXECUTION_BACKENDS = Object.freeze([
  'LOCAL_TRUSTED',
  'CONFIDENTIAL_TEE',
  'FHE',
  'MPC_FSS',
  'ZK_VERIFIABLE',
  'UNTRUSTED_REEXECUTABLE'
]);

const DATA_CLASSES = new Set(['PUBLIC', 'INTERNAL_NON_SECRET', 'FOUNDER_PRIVATE']);
const VERIFY_CLASSES = new Set(['DETERMINISTIC_REEXECUTION', 'ATTESTED_ENVIRONMENT', 'CRYPTOGRAPHIC_PROOF']);
const BACKENDS = new Set(OMEGA_EXECUTION_BACKENDS);

const envelope = extra => ({
  businessEffectAuthority: 'NONE',
  externalEffectAuthority: 'NONE',
  externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS),
  ...extra
});
const fail = (status, reasonCodes, extra = {}) => envelope({ ok: false, status, version: OMEGA_SOVEREIGN_EXECUTION_FABRIC_VERSION, reasonCodes: [...new Set(reasonCodes.filter(Boolean))], ...extra });
const text = (value, max = 240) => { const out = String(value ?? '').trim(); return out && out.length <= max ? out : null; };
const refs = value => Array.isArray(value) && value.length <= 64 ? [...new Set(value.map(v => text(v, 500)).filter(Boolean))].sort() : null;
const finite = value => Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

function normalizeJob(raw = {}) {
  const id = text(raw.id);
  const dataClass = String(raw.dataClass || '');
  const verificationClass = String(raw.verificationClass || '');
  const payloadHash = /^[a-f0-9]{64}$/.test(String(raw.payloadHash || '')) ? String(raw.payloadHash) : null;
  if (!id || !DATA_CLASSES.has(dataClass) || !VERIFY_CLASSES.has(verificationClass) || !payloadHash) return null;
  return {
    id,
    dataClass,
    verificationClass,
    payloadHash,
    deterministic: raw.deterministic === true,
    maxObservedCostCents: raw.maxObservedCostCents == null ? null : finite(raw.maxObservedCostCents),
    maxObservedLatencyMs: raw.maxObservedLatencyMs == null ? null : finite(raw.maxObservedLatencyMs)
  };
}

function normalizeCandidate(raw = {}) {
  const id = text(raw.id);
  const type = String(raw.type || '');
  const evidenceRefs = refs(raw.evidenceRefs);
  const privacyModes = Array.isArray(raw.privacyModes) ? [...new Set(raw.privacyModes.map(String))].sort() : null;
  const verificationModes = Array.isArray(raw.verificationModes) ? [...new Set(raw.verificationModes.map(String))].sort() : null;
  const observedLatencyMs = finite(raw.observedLatencyMs);
  const observedCostCents = finite(raw.observedCostCents);
  if (!id || !BACKENDS.has(type) || !evidenceRefs?.length || !privacyModes || !verificationModes || observedLatencyMs == null || observedCostCents == null) return null;
  return { id, type, evidenceRefs, privacyModes, verificationModes, observedLatencyMs, observedCostCents, available: raw.available === true };
}

function privacyRequiredModes(job, candidate) {
  if (job.dataClass !== 'FOUNDER_PRIVATE') return [];
  if (candidate.type === 'LOCAL_TRUSTED') return ['LOCAL_TRUST_BOUNDARY'];
  if (candidate.type === 'CONFIDENTIAL_TEE') return ['ATTESTATION_VERIFIED', 'DATA_IN_USE_CONFIDENTIAL'];
  if (candidate.type === 'FHE') return ['CIPHERTEXT_COMPUTE'];
  if (candidate.type === 'MPC_FSS') return ['SECRET_SHARED'];
  if (candidate.type === 'ZK_VERIFIABLE') return ['PRIVATE_INPUT_PROTECTED'];
  return ['PRIVATE_DATA_NOT_ADMISSIBLE'];
}

function verifierRequiredModes(job, candidate) {
  if (job.verificationClass === 'CRYPTOGRAPHIC_PROOF') return ['CRYPTOGRAPHIC_PROOF'];
  if (job.verificationClass === 'ATTESTED_ENVIRONMENT') return candidate.type === 'LOCAL_TRUSTED' ? ['LOCAL_VERIFICATION'] : ['ATTESTATION_VERIFIED'];
  if (job.verificationClass === 'DETERMINISTIC_REEXECUTION') return candidate.type === 'LOCAL_TRUSTED' ? ['LOCAL_VERIFICATION'] : ['DETERMINISTIC_REEXECUTION'];
  return ['UNSUPPORTED_VERIFICATION'];
}

function evaluateCandidate(job, candidate) {
  const reasons = [];
  if (!candidate.available) reasons.push('backend-not-observed-available');
  for (const mode of privacyRequiredModes(job, candidate)) if (!candidate.privacyModes.includes(mode)) reasons.push(`missing-privacy-mode:${mode}`);
  for (const mode of verifierRequiredModes(job, candidate)) if (!candidate.verificationModes.includes(mode)) reasons.push(`missing-verification-mode:${mode}`);
  if (job.maxObservedCostCents != null && candidate.observedCostCents > job.maxObservedCostCents) reasons.push('observed-cost-over-job-limit');
  if (job.maxObservedLatencyMs != null && candidate.observedLatencyMs > job.maxObservedLatencyMs) reasons.push('observed-latency-over-job-limit');
  if (candidate.type === 'UNTRUSTED_REEXECUTABLE' && job.dataClass === 'FOUNDER_PRIVATE') reasons.push('untrusted-backend-private-data-refused');
  return { ...candidate, admissible: reasons.length === 0, reasonCodes: reasons };
}

export function compileSovereignExecutionPlan({ job: rawJob, candidates: rawCandidates = [] } = {}) {
  const job = normalizeJob(rawJob);
  if (!job) return fail('OMEGA_EXECUTION_PLAN_REFUSED', ['invalid-job']);
  if (!Array.isArray(rawCandidates) || rawCandidates.length === 0 || rawCandidates.length > 128) return fail('OMEGA_EXECUTION_PLAN_REFUSED', ['candidates-required']);
  const candidates = rawCandidates.map(normalizeCandidate);
  if (candidates.some(candidate => !candidate)) return fail('OMEGA_EXECUTION_PLAN_REFUSED', ['invalid-candidate']);
  const evaluated = candidates.map(candidate => evaluateCandidate(job, candidate));
  const admissible = evaluated.filter(candidate => candidate.admissible).sort((a, b) =>
    a.observedCostCents - b.observedCostCents ||
    a.observedLatencyMs - b.observedLatencyMs ||
    a.id.localeCompare(b.id)
  );
  if (!admissible.length) return fail('OMEGA_EXECUTION_PLAN_NO_ADMISSIBLE_BACKEND', ['no-admissible-backend'], { job, candidates: evaluated });
  const selected = admissible[0];
  const planCore = {
    jobHash: digest(job),
    payloadHash: job.payloadHash,
    backendId: selected.id,
    backendType: selected.type,
    requiredDataClass: job.dataClass,
    requiredVerificationClass: job.verificationClass,
    evidenceRefs: selected.evidenceRefs,
    founderKeyPolicy: 'FOUNDER_ROOT_KEY_NEVER_DELEGATED',
    secretReleasePolicy: job.dataClass === 'FOUNDER_PRIVATE' ? 'RELEASE_ONLY_TO_VERIFIED_PROTOCOL_OR_LOCAL_TRUST_BOUNDARY' : 'NO_PRIVATE_SECRET_RELEASE_REQUIRED',
    executionAuthority: 'NONE',
    spendAuthority: 'NONE'
  };
  return envelope({
    ok: true,
    status: 'OMEGA_EXECUTION_PLAN_COMPILED',
    version: OMEGA_SOVEREIGN_EXECUTION_FABRIC_VERSION,
    job,
    selected,
    candidates: evaluated,
    plan: { ...planCore, planHash: digest(planCore) },
    truthBoundary: 'This is a zero-effect routing plan over caller-supplied observations. It does not attest a backend, release secrets, spend money, execute compute, or prove privacy/performance.'
  });
}

export function verifyExecutionReceiptBinding({ plan, receipt } = {}) {
  if (!plan?.planHash || !receipt || typeof receipt !== 'object' || Array.isArray(receipt)) return fail('OMEGA_EXECUTION_RECEIPT_REFUSED', ['plan-and-receipt-required']);
  const reasons = [];
  if (receipt.planHash !== plan.planHash) reasons.push('plan-hash-mismatch');
  if (receipt.payloadHash !== plan.payloadHash) reasons.push('payload-hash-mismatch');
  if (receipt.backendId !== plan.backendId) reasons.push('backend-id-mismatch');
  if (receipt.backendType !== plan.backendType) reasons.push('backend-type-mismatch');
  const evidenceRefs = refs(receipt.evidenceRefs);
  if (!evidenceRefs?.length) reasons.push('execution-evidence-required');
  return envelope({
    ok: reasons.length === 0,
    status: reasons.length === 0 ? 'OMEGA_EXECUTION_RECEIPT_BOUND' : 'OMEGA_EXECUTION_RECEIPT_REFUSED',
    version: OMEGA_SOVEREIGN_EXECUTION_FABRIC_VERSION,
    reasonCodes: reasons,
    binding: reasons.length === 0 ? { planHash: plan.planHash, payloadHash: plan.payloadHash, backendId: plan.backendId, evidenceRefs } : null,
    truthBoundary: 'Binding proves only that receipt fields match the compiled plan. Cryptographic attestation/proof validity must be checked by the protocol-specific verifier.'
  });
}
