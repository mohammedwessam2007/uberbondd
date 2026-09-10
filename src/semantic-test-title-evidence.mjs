const NEGATIVE_INVARIANT=/(?:refus|reject|block|tamper|cannot|must not|without|invalid|stale|wrong|duplicate|revok|unauthor|mismatch|fail|deny|expired|missing|\bnever\b|\b(?:does|do|is|are|may|can|must)\s+not\b)/i;
const RECOVERY_INVARIANT=/(?:recover|restart|resume|rollback|retry|restore|revoke|delete|reconcile|crash|idempot)/i;

export const SEMANTIC_TEST_TITLE_EVIDENCE_VERSION='uberbond.semantic-test-title-evidence.v1';

/**
 * A hostile falsifier is still required to be a real test bound to the row.
 * This classifier only recognizes the language of a negative invariant in that
 * already-bound test title. It cannot create a test, bind an unrelated test, or
 * promote a requirement state.
 */
export function isHostileTestTitle(title){
  return NEGATIVE_INVARIANT.test(String(title??''));
}

export function isRecoveryTestTitle(title){
  return RECOVERY_INVARIANT.test(String(title??''));
}
