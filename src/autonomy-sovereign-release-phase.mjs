import { verifySovereignReleaseRequest } from './sovereign-release-handoff.mjs';

export const AUTONOMY_SOVEREIGN_RELEASE_PHASE_VERSION = 'uberbond.autonomy-sovereign-release-phase.v1';
const SHA40 = /^[a-f0-9]{40}$/i;

function text(value, max = 1000) { return String(value ?? '').trim().slice(0, max); }

export function summarizeAutonomySovereignReleasePhase({
  evidenceState = 'UNAVAILABLE',
  request = null,
  currentSourceCommit = null,
  namedRuntimeStatus = 'NOT_MEASURED'
} = {}) {
  const runtimeVerified = String(namedRuntimeStatus || '') === 'NAMED_RUNTIME_VERIFIED_WITHIN_REHEARSED_SCOPE';
  const runtimePhase = runtimeVerified ? 'VERIFIED_WITHIN_REHEARSED_SCOPE' : 'RUNTIME_PROOF_PENDING';

  if (runtimeVerified) {
    return {
      version: AUTONOMY_SOVEREIGN_RELEASE_PHASE_VERSION,
      releasePhase: 'NOT_REQUIRED_FOR_ALREADY_VERIFIED_RUNTIME_SCOPE',
      runtimePhase,
      requestSourceCommit: null,
      requestDigest: null,
      reasonCodes: [],
      deploymentAuthority: 'NONE'
    };
  }

  if (evidenceState === 'UNAVAILABLE') {
    return {
      version: AUTONOMY_SOVEREIGN_RELEASE_PHASE_VERSION,
      releasePhase: 'NOT_OBSERVED',
      runtimePhase,
      requestSourceCommit: null,
      requestDigest: null,
      reasonCodes: ['sovereign-release-request-evidence-unavailable'],
      deploymentAuthority: 'NONE'
    };
  }
  if (evidenceState !== 'AVAILABLE' || !request || typeof request !== 'object' || Array.isArray(request)) {
    return {
      version: AUTONOMY_SOVEREIGN_RELEASE_PHASE_VERSION,
      releasePhase: 'INVALID',
      runtimePhase,
      requestSourceCommit: null,
      requestDigest: null,
      reasonCodes: ['sovereign-release-request-evidence-invalid'],
      deploymentAuthority: 'NONE'
    };
  }

  const verified = verifySovereignReleaseRequest(request);
  if (!verified?.ok) {
    return {
      version: AUTONOMY_SOVEREIGN_RELEASE_PHASE_VERSION,
      releasePhase: 'INVALID',
      runtimePhase,
      requestSourceCommit: text(request?.sourceCommit, 80) || null,
      requestDigest: text(request?.requestDigest, 90) || null,
      reasonCodes: Array.isArray(verified?.reasonCodes) ? verified.reasonCodes.slice(0, 20) : ['sovereign-release-request-verification-failed'],
      deploymentAuthority: 'NONE'
    };
  }

  const current = text(currentSourceCommit, 80).toLowerCase();
  const requested = text(request.sourceCommit, 80).toLowerCase();
  if (current && SHA40.test(current) && requested !== current) {
    return {
      version: AUTONOMY_SOVEREIGN_RELEASE_PHASE_VERSION,
      releasePhase: 'STALE_FOR_CURRENT_SOURCE',
      runtimePhase,
      requestSourceCommit: requested,
      requestDigest: request.requestDigest,
      reasonCodes: ['release-request-source-does-not-equal-current-source'],
      deploymentAuthority: 'NONE'
    };
  }

  return {
    version: AUTONOMY_SOVEREIGN_RELEASE_PHASE_VERSION,
    releasePhase: 'PENDING_OFFLINE_SIGNER',
    runtimePhase: 'WAITING_FOR_SIGNED_RELEASE_AND_REAL_HOST_REHEARSAL',
    requestSourceCommit: requested,
    requestDigest: request.requestDigest,
    reasonCodes: [],
    signingAuthority: 'NOT_GRANTED_BY_REQUEST',
    deploymentAuthority: 'NONE',
    truthBoundary: 'A VALID RELEASE REQUEST MEANS ONLY THAT AN INDEPENDENTLY VERIFIED SOURCE MERGE IS ELIGIBLE FOR OFFLINE PACKAGING. IT DOES NOT MEAN THE RELEASE WAS SIGNED, DEPLOYED, OR REHEARSED ON A REAL HOST.'
  };
}
