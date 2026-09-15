import crypto from 'node:crypto';

export const UBEROS_STATE_ENGINE_VERSION = 'uberos.transactional-state.v1';

const hash = value => `sha256:${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
const uniq = values => [...new Set((Array.isArray(values) ? values : []).filter(Boolean))].sort();

export function compileStateTransition({ currentState, candidateState, checks = [], rollback = null, provenanceRef = null } = {}) {
  const reasons = [];
  if (!currentState || typeof currentState !== 'object') reasons.push('current-state-required');
  if (!candidateState || typeof candidateState !== 'object') reasons.push('candidate-state-required');
  if (!provenanceRef) reasons.push('provenance-reference-required');
  if (!rollback || typeof rollback !== 'object') reasons.push('rollback-plan-required');
  const normalizedChecks = (Array.isArray(checks) ? checks : []).map(row => ({ id: String(row?.id ?? '').trim(), passed: row?.passed === true, evidenceRef: String(row?.evidenceRef ?? '').trim() || null }));
  if (!normalizedChecks.length) reasons.push('at-least-one-verification-check-required');
  if (normalizedChecks.some(row => !row.id || !row.evidenceRef)) reasons.push('check-id-and-evidence-required');
  if (reasons.length) return { ok: false, status: 'STATE_TRANSITION_INVALID', reasonCodes: uniq(reasons), consequenceAuthority: 'NONE' };
  const failedChecks = normalizedChecks.filter(row => !row.passed);
  const plan = { currentDigest: hash(currentState), candidateDigest: hash(candidateState), checks: normalizedChecks, rollback, provenanceRef };
  return { ok: true, status: failedChecks.length ? 'STATE_TRANSITION_REJECTED' : 'STATE_TRANSITION_VERIFIED', promotable: failedChecks.length === 0, failedChecks: failedChecks.map(row => row.id), transitionDigest: hash(plan), law: 'CANDIDATE_STATE_MUST_BE_VERIFIED_BEFORE_ATOMIC_PROMOTION_AND_REMAIN_ROLLBACKABLE', consequenceAuthority: 'NONE' };
}

export function compileRollbackReceipt({ transitionDigest, restoredState, cause, observedAt = new Date().toISOString() } = {}) {
  if (!/^sha256:[a-f0-9]{64}$/i.test(String(transitionDigest || '')) || !restoredState || typeof restoredState !== 'object' || !String(cause || '').trim() || !Number.isFinite(Date.parse(observedAt))) {
    return { ok: false, status: 'ROLLBACK_RECEIPT_INVALID', reasonCodes: ['transition-digest-restored-state-cause-and-time-required'], consequenceAuthority: 'NONE' };
  }
  const core = { transitionDigest, restoredStateDigest: hash(restoredState), cause: String(cause).trim(), observedAt: new Date(observedAt).toISOString() };
  return { ok: true, status: 'ROLLBACK_RECEIPT_READY', receipt: { ...core, receiptDigest: hash(core) }, consequenceAuthority: 'NONE' };
}
