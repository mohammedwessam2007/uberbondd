import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { validateFrontierCallabilityProbeReceipt } from './frontier-callability-provenance.mjs';
import { validateCompiledSealedArchitectureTrial } from './apex-sealed-tournament.mjs';
import { certifyPairedZeroLoss } from './absolute-frontier-quality-invariant.mjs';

export const FRONTIER_CROWN_CERTIFICATE_VERSION = 'uberbond.frontier-crown-certificate.v1';

const liveCrownCertificates = new WeakMap();

function zeroEffects() { return structuredClone(ZERO_EXTERNAL_EFFECTS); }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}
function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}
function envelope(extra = {}) {
  return {
    policyVersion: FRONTIER_CROWN_CERTIFICATE_VERSION,
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects(),
    promotionAuthority: 'NONE',
    ...extra
  };
}
function fail(status, reasonCodes, extra = {}) {
  return envelope({
    ok: false,
    status,
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    ...extra
  });
}
function text(value, max = 1000) {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
}
function subjectIdentity(trial) {
  const subject = trial?.architectureIdentity?.benchmarkSubject;
  if (!subject || subject.exclusiveCognitiveSubject !== true) return null;
  const profileId = text(subject.profileId, 120)?.toLowerCase();
  const provider = text(subject.provider, 80)?.toLowerCase();
  const model = text(subject.model, 160);
  const revision = text(subject.revision, 240);
  return profileId && provider && model && revision ? { profileId, provider, model, revision } : null;
}
function metricVector(trial) {
  return {
    quality: Number(trial?.statistics?.verifiedSuccessRate),
    processScore: Number(trial?.arenaTrial?.processScore),
    falsePositiveRate: Number(trial?.statistics?.falsePositiveRate),
    meanCostUsd: Number(trial?.economics?.meanCostUsd),
    meanLatencyMs: Number(trial?.economics?.meanLatencyMs)
  };
}
function sameCrownMetrics(a, b) {
  return a.quality === b.quality
    && a.processScore === b.processScore
    && a.falsePositiveRate === b.falsePositiveRate;
}
function compareQualityOnly(a, b) {
  const am = metricVector(a);
  const bm = metricVector(b);
  return bm.quality - am.quality
    || bm.processScore - am.processScore
    || am.falsePositiveRate - bm.falsePositiveRate
    || String(a.architectureId).localeCompare(String(b.architectureId));
}
function trialSetKey(trial) {
  return `${trial?.suiteVersion ?? ''}::${trial?.corpusDigest ?? ''}::${trial?.manifestDigest ?? ''}::${trial?.taskClass ?? ''}`;
}
function probeUniverse(provenance) {
  return provenance.observations.map(row => ({
    profileId: row.profileId,
    provider: row.observedProvider,
    model: row.observedModel,
    revision: row.observedRevision,
    transportProvider: row.observedTransportProvider,
    transportModel: row.observedTransportModel
  })).sort((a, b) => a.profileId.localeCompare(b.profileId));
}

export function certifyCanonicalFrontierCrown({
  callabilityProvenance,
  sealedTrials = []
} = {}) {
  const probe = validateFrontierCallabilityProbeReceipt({ ...(callabilityProvenance ?? {}), allowSynthetic: true });
  if (!probe.ok) return fail('FRONTIER_CROWN_CERTIFICATION_REFUSED', probe.reasonCodes);
  if (!Array.isArray(sealedTrials) || sealedTrials.length === 0 || sealedTrials.length > 64) {
    return fail('FRONTIER_CROWN_CERTIFICATION_REFUSED', ['bounded-sealed-trial-universe-required']);
  }

  const reasons = [];
  const trialRows = [];
  const seenProfiles = new Set();
  for (const trial of sealedTrials) {
    const origin = validateCompiledSealedArchitectureTrial(trial);
    if (!origin.ok) {
      reasons.push('canonical-sealed-trial-required');
      continue;
    }
    const subject = subjectIdentity(trial);
    if (!subject) {
      reasons.push('exclusive-sealed-benchmark-subject-required');
      continue;
    }
    if (seenProfiles.has(subject.profileId)) {
      reasons.push(`one-sealed-trial-per-profile-required:${subject.profileId}`);
      continue;
    }
    seenProfiles.add(subject.profileId);
    const metrics = metricVector(trial);
    if (!Object.values(metrics).every(Number.isFinite)) {
      reasons.push(`complete-crown-metrics-required:${subject.profileId}`);
      continue;
    }
    trialRows.push({ trial, origin, subject, metrics });
  }

  const universe = probeUniverse(probe);
  const trialProfileIds = [...seenProfiles].sort();
  const universeProfileIds = universe.map(row => row.profileId).sort();
  if (JSON.stringify(trialProfileIds) !== JSON.stringify(universeProfileIds)) {
    reasons.push('sealed-trial-universe-must-exactly-match-callability-probe-universe');
  }

  const observationById = new Map(probe.observations.map(row => [row.profileId, row]));
  for (const row of trialRows) {
    const observed = observationById.get(row.subject.profileId);
    if (!observed
      || observed.observedProvider !== row.subject.provider
      || observed.observedModel !== row.subject.model
      || observed.observedRevision !== row.subject.revision) {
      reasons.push(`sealed-trial-subject-callability-identity-mismatch:${row.subject.profileId}`);
    }
  }

  const setKeys = new Set(trialRows.map(row => trialSetKey(row.trial)));
  if (setKeys.size !== 1 || [...setKeys][0].startsWith('::')) {
    reasons.push('same-sealed-evaluation-set-required-for-frontier-crown');
  }
  if (reasons.length) return fail('FRONTIER_CROWN_CERTIFICATION_REFUSED', reasons);

  const qualitySorted = trialRows.map(row => row.trial).sort(compareQualityOnly);
  const qualityLeader = qualitySorted[0];
  const leaderMetrics = metricVector(qualityLeader);
  const tied = qualitySorted.filter(trial => sameCrownMetrics(metricVector(trial), leaderMetrics));

  if (tied.length > 1) {
    const anchor = [...tied].sort((a, b) => String(a.architectureId).localeCompare(String(b.architectureId)))[0];
    for (const other of tied) {
      if (other === anchor) continue;
      const forward = certifyPairedZeroLoss({
        baselineTrial: anchor,
        candidateTrial: other,
        provenanceValidator: validateCompiledSealedArchitectureTrial
      });
      const reverse = certifyPairedZeroLoss({
        baselineTrial: other,
        candidateTrial: anchor,
        provenanceValidator: validateCompiledSealedArchitectureTrial
      });
      if (!forward.ok || !reverse.ok) {
        return fail('FRONTIER_CROWN_CERTIFICATION_REFUSED', ['aggregate-crown-tie-without-paired-equivalence']);
      }
    }
  }

  const crownTrial = [...tied].sort((a, b) =>
    Number(a.economics.meanCostUsd) - Number(b.economics.meanCostUsd)
    || Number(a.economics.meanLatencyMs) - Number(b.economics.meanLatencyMs)
    || String(a.architectureId).localeCompare(String(b.architectureId))
  )[0];
  const crownSubject = subjectIdentity(crownTrial);
  const universeDigest = digest(universe);
  const body = {
    schemaVersion: FRONTIER_CROWN_CERTIFICATE_VERSION,
    callabilityReceiptDigest: probe.receiptDigest,
    callabilitySourceRef: probe.sourceRef,
    profileUniverseDigest: universeDigest,
    profileIds: universeProfileIds,
    simulationOnly: probe.simulationOnly === true,
    trustedForLiveExecution: probe.trustedForLiveExecution === true,
    suiteVersion: crownTrial.suiteVersion,
    corpusDigest: crownTrial.corpusDigest,
    manifestDigest: crownTrial.manifestDigest,
    taskClass: crownTrial.taskClass,
    crownProfileId: crownSubject.profileId,
    crownProvider: crownSubject.provider,
    crownModel: crownSubject.model,
    crownRevision: crownSubject.revision,
    crownArchitectureId: crownTrial.architectureId,
    crownTrialReceiptDigest: crownTrial.receiptDigest,
    crownTaskOutcomeDigest: crownTrial.taskOutcomeDigest,
    crownMetrics: metricVector(crownTrial),
    reviewedTrialReceiptDigests: trialRows.map(row => row.trial.receiptDigest).sort(),
    tiedCrownCount: tied.length,
    tieResolution: tied.length > 1 ? 'PAIRED_ZERO_LOSS_EQUIVALENT_THEN_COST' : 'UNIQUE_QUALITY_CROWN',
    law: 'CROWN_SELECTION_IGNORES_COST_UNTIL_ALL_TOP_QUALITY_PROCESS_FALSE_POSITIVE_METRICS_TIE_AND_PAIRED_ZERO_LOSS_EQUIVALENCE_IS_PROVEN'
  };
  const certificate = Object.freeze({ ...body, certificateDigest: digest(body) });
  liveCrownCertificates.set(certificate, certificate.certificateDigest);

  return envelope({
    ok: true,
    status: 'CANONICAL_FRONTIER_CROWN_CERTIFIED',
    certificate,
    certificateDigest: certificate.certificateDigest,
    truthBoundary: 'THE CROWN IS COMPLETE ONLY FOR THE EXACT PROCESS-BOUND CALLABILITY-PROBE UNIVERSE. OMITTING A MODEL FROM THE AUTHORITATIVE CONFIGURED/PROBED UNIVERSE IS OUTSIDE THIS CERTIFICATE AND REMAINS A ROOT-OF-TRUST CONFIGURATION CHANGE.'
  });
}

export function validateCanonicalFrontierCrownCertificate(certificate, {
  expectedCallabilityReceiptDigest = null,
  expectedCrownTrialReceiptDigest = null,
  expectedCrownProfileId = null
} = {}) {
  const reasons = [];
  const expected = certificate && typeof certificate === 'object' ? liveCrownCertificates.get(certificate) : null;
  const actual = certificate && typeof certificate === 'object'
    ? digest(Object.fromEntries(Object.entries(certificate).filter(([key]) => key !== 'certificateDigest')))
    : null;
  if (!expected || expected !== certificate?.certificateDigest || actual !== certificate?.certificateDigest) {
    reasons.push('canonical-frontier-crown-certificate-producer-origin-required');
  }
  if (certificate?.schemaVersion !== FRONTIER_CROWN_CERTIFICATE_VERSION) reasons.push('frontier-crown-certificate-schema-required');
  if (!text(certificate?.callabilityReceiptDigest, 64)) reasons.push('frontier-crown-callability-receipt-required');
  if (!text(certificate?.profileUniverseDigest, 64)) reasons.push('frontier-crown-profile-universe-digest-required');
  if (!text(certificate?.crownTrialReceiptDigest, 64)) reasons.push('frontier-crown-trial-receipt-required');
  if (expectedCallabilityReceiptDigest && certificate?.callabilityReceiptDigest !== expectedCallabilityReceiptDigest) reasons.push('frontier-crown-callability-receipt-mismatch');
  if (expectedCrownTrialReceiptDigest && certificate?.crownTrialReceiptDigest !== expectedCrownTrialReceiptDigest) reasons.push('frontier-crown-trial-receipt-mismatch');
  if (expectedCrownProfileId && certificate?.crownProfileId !== expectedCrownProfileId) reasons.push('frontier-crown-profile-mismatch');
  return reasons.length
    ? fail('FRONTIER_CROWN_CERTIFICATE_REFUSED', reasons)
    : envelope({
        ok: true,
        status: 'FRONTIER_CROWN_CERTIFICATE_VALID',
        certificateDigest: certificate.certificateDigest,
        profileUniverseDigest: certificate.profileUniverseDigest,
        crownProfileId: certificate.crownProfileId,
        crownArchitectureId: certificate.crownArchitectureId,
        crownTrialReceiptDigest: certificate.crownTrialReceiptDigest,
        simulationOnly: certificate.simulationOnly === true,
        trustedForLiveExecution: certificate.trustedForLiveExecution === true
      });
}
