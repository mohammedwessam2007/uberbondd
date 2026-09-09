import crypto from 'node:crypto';
import { fingerprintGamechangerObservation } from './gamechanger-mesh.mjs';
import { compileGenesisMechanisms } from './genesis-mechanism-compiler.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const GAMECHANGER_GENESIS_ADAPTER_VERSION = 'uberbond.gamechanger-genesis-adapter.v1';

const ALLOWED_ATTENTION = new Set(['RESEARCH', 'ATOMIZE', 'EXPERIMENT_CANDIDATE']);
const text = (value, max = 2000) => {
  const out = String(value ?? '').trim();
  return out ? out.slice(0, max) : null;
};
const list = (value, max = 40) => Array.isArray(value)
  ? value.map(item => text(item, 500)).filter(Boolean).slice(0, max)
  : [];
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const zero = () => structuredClone(ZERO_EXTERNAL_EFFECTS);
const fail = reasonCodes => ({
  ok: false,
  version: GAMECHANGER_GENESIS_ADAPTER_VERSION,
  status: 'GAMECHANGER_GENESIS_ADMISSION_REFUSED',
  reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  promotionAuthority: 'NONE',
  executableAuthority: 'NONE',
  businessEffectAuthority: 'NONE',
  externalEffectLedger: zero()
});

function sourceBoundCandidate(candidate = {}) {
  const fp = fingerprintGamechangerObservation(candidate?.observation || {});
  if (!fp.ok) return { ok: false, reasons: ['valid-gamechanger-observation-required'] };
  if (String(candidate?.fingerprint || '') !== fp.fingerprint) {
    return { ok: false, reasons: ['gamechanger-fingerprint-must-match-observation'] };
  }
  if (!ALLOWED_ATTENTION.has(String(candidate?.attentionState || '').toUpperCase())) {
    return { ok: false, reasons: ['research-grade-gamechanger-attention-required'] };
  }
  return { ok: true, candidate: { ...candidate, observation: fp.observation } };
}

export function compileGamechangerIntoGenesis({
  gamechangerCandidate,
  extractedMechanism,
  peerDonors = [],
  maxCandidates = 50
} = {}) {
  const bound = sourceBoundCandidate(gamechangerCandidate);
  if (!bound.ok) return fail(bound.reasons);
  const candidate = bound.candidate;
  const observation = candidate.observation;
  const extraction = extractedMechanism && typeof extractedMechanism === 'object' ? extractedMechanism : {};
  const reasons = [];

  const sourceFingerprint = text(extraction.sourceFingerprint, 128);
  const sourceObservationId = text(extraction.sourceObservationId, 300)?.toLowerCase();
  const evidenceRef = text(extraction.evidenceRef, 3000);
  const mechanismId = text(extraction.mechanismId, 160)?.toLowerCase();
  const domain = text(extraction.domain, 160);
  const does = text(extraction.does, 800);
  const exploits = text(extraction.exploits, 800);
  const assumptions = list(extraction.assumptions, 40);

  if (sourceFingerprint !== candidate.fingerprint) reasons.push('extraction-must-bind-gamechanger-fingerprint');
  if (sourceObservationId !== observation.id) reasons.push('extraction-must-bind-observation-id');
  if (!evidenceRef || !observation.evidenceRefs.includes(evidenceRef)) reasons.push('extraction-evidence-ref-must-come-from-observation');
  if (!mechanismId) reasons.push('mechanism-id-required');
  if (!domain) reasons.push('mechanism-domain-required');
  if (!does) reasons.push('explicit-causal-action-required');
  if (!exploits) reasons.push('explicit-exploited-constraint-required');
  if (assumptions.length === 0) reasons.push('load-bearing-assumptions-required');
  if (!Array.isArray(peerDonors) || peerDonors.length < 1 || peerDonors.length > 49) reasons.push('one-or-more-bounded-peer-donors-required');
  if (reasons.length) return fail(reasons);

  const donor = {
    mechanismId,
    domain,
    does,
    exploits,
    preconditions: list(extraction.preconditions, 40),
    effects: list(extraction.effects, 40),
    assumptions,
    // A public signal can motivate a causal extraction, but it cannot be
    // upgraded past supported inference by this adapter. Stronger evidence must
    // enter GENESIS through its own canonical donor path.
    evidenceClass: 'SUPPORTED_INFERENCE',
    source: {
      kind: 'PUBLIC_DOCUMENT',
      ref: evidenceRef,
      observedAt: observation.observedAt
    }
  };

  const compilation = compileGenesisMechanisms({
    donors: [donor, ...structuredClone(peerDonors)],
    maxCandidates
  });
  if (!compilation?.ok) {
    return fail((compilation?.reasonCodes || ['canonical-genesis-compilation-refused'])
      .map(code => `genesis:${code}`));
  }

  const binding = {
    sourceFingerprint: candidate.fingerprint,
    sourceObservationId: observation.id,
    sourceEvidenceRef: evidenceRef,
    sourceObservedAt: observation.observedAt,
    attentionState: candidate.attentionState,
    donorMechanismId: mechanismId,
    donorEvidenceClass: 'SUPPORTED_INFERENCE',
    genesisCompilerVersion: compilation.version,
    candidateIds: Array.isArray(compilation.candidates)
      ? compilation.candidates.map(row => row?.candidateId).filter(Boolean).sort()
      : []
  };

  return {
    ok: true,
    version: GAMECHANGER_GENESIS_ADAPTER_VERSION,
    status: 'GAMECHANGER_CAUSAL_EXTRACTION_ROUTED_TO_CANONICAL_GENESIS',
    binding,
    bindingDigest: hash(binding),
    donor,
    genesisCompilation: compilation,
    truthBoundary: 'PUBLIC_SIGNAL_IS_NOT_A_MECHANISM_FACT__EXTRACTED_CAUSAL_MODEL_IS_SUPPORTED_INFERENCE_AT_MOST__GENESIS_OUTPUT_REMAINS_HYPOTHESIS',
    promotionAuthority: 'NONE',
    executableAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zero()
  };
}
