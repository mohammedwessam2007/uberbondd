import { sha256 } from '../../src/omnia-v9/canonical.mjs';

/** Test-only authoritative response. Never imported by production code. */
export function allowOutboundConsequenceForTest(context) {
  return {
    decision: 'ALLOW',
    authoritative: true,
    enforced: true,
    contextDigest: sha256(context),
    reservationId: context.reservation.id,
    actionIntentDigest: context.actionIntentDigest,
    effectPayloadDigest: context.effectPayloadDigest,
    authorizationDigest: sha256(`test-authorization:${context.actionIntentDigest}`),
    policyDigest: sha256('test-policy'),
    constitutionDigest: sha256('test-constitution'),
    authorityReservationId: `test-authority:${context.reservation.id}`
  };
}
