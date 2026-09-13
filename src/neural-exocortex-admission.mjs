import crypto from 'node:crypto';
import { normalizeCapability } from './capability-genome-schema.mjs';
import { admitCapability } from './capability-genome-admission.mjs';
import { ACTIVE_NEURAL_CORTEX_MAX } from './neural-exocortex-genome.mjs';

export const NEURAL_EXOCORTEX_ADMISSION_VERSION = 'uberbond.neural-exocortex-admission.v1';
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const clean = (value, max = 2000) => String(value ?? '').trim().slice(0, max);
const clamp = value => Math.max(0, Math.min(1, Number(value) || 0));
const tokens = value => new Set(String(value ?? '').toLowerCase().match(/[a-z0-9][a-z0-9.+_-]{1,}/g) || []);
function overlap(a, b) { if (!a.size || !b.size) return 0; let hit = 0; for (const token of a) if (b.has(token)) hit += 1; return hit / new Set([...a, ...b]).size; }

export function compileNeuralCapabilityAcquisitionRequest(reference = {}) {
  const id = clean(reference.id, 240);
  const sourceUrl = clean(reference.sourceUrl, 1000);
  const family = clean(reference.family, 120).toLowerCase();
  if (!id || !sourceUrl || !/^https:\/\/github\.com\//i.test(sourceUrl) || !family) {
    return { ok: false, status: 'NEURAL_ACQUISITION_REQUEST_REJECTED', reasonCodes: ['valid-neural-reference-required'] };
  }
  const request = {
    neuralReferenceId: id,
    sourceUrl,
    family,
    requiredEvidence: [
      'IMMUTABLE_SOURCE_REVISION', 'SOURCE_SHA256', 'BODY_OR_MANIFEST_IMPORT', 'CAPABILITY_ATOM_EXTRACTION',
      'LICENSE_AND_CONFIDENCE', 'MAINTAINER_IDENTITY', 'STATIC_SECURITY', 'SEMANTIC_SECURITY', 'SANDBOX_SECURITY',
      'HOLDOUT_BENCHMARK', 'CAPABILITY_GENOME_PROMOTION'
    ],
    targetLifecycle: 'APPROVED_OR_ACTIVE_CANONICAL_CAPABILITY',
    executionAuthority: 'NONE',
    consequenceAuthority: 'NONE'
  };
  return { ok: true, status: 'NEURAL_CAPABILITY_ACQUISITION_REQUIRED', request, requestDigest: digest(request) };
}

function sourceUrlOf(capability) { return clean(capability?.source?.url, 1000).replace(/\/$/, '').toLowerCase(); }
function referenceUrl(reference) { return clean(reference?.sourceUrl, 1000).replace(/\/$/, '').toLowerCase(); }
function missionScore(mission, reference, capability, benchmark) {
  const missionTokens = tokens(mission);
  const candidateTokens = tokens([
    reference.family, reference.role, reference.repositoryFullName, reference.description,
    ...(reference.topics || []), ...(capability.taskClasses || []),
    ...(capability.capabilityAtoms || []).flatMap(atom => [atom.id, atom.verb, atom.noun, atom.description])
  ].join(' '));
  const lexical = overlap(missionTokens, candidateTokens);
  const neuralPrior = clamp(reference?.neuralPrior?.score);
  const taskSuccess = clamp(benchmark?.record?.candidate?.taskSuccess ?? benchmark?.taskSuccess ?? 0);
  const quality = clamp(benchmark?.record?.candidate?.quality ?? benchmark?.quality ?? 0);
  const reliability = clamp(benchmark?.record?.candidate?.reliability ?? benchmark?.reliability ?? 0);
  return lexical * 0.30 + neuralPrior * 0.20 + taskSuccess * 0.20 + quality * 0.15 + reliability * 0.15;
}

export function selectCapabilityGenomeBackedNeuralCortex({
  mission,
  neuralReferences = [],
  canonicalCapabilities = [],
  securityEvidenceByCapability = {},
  benchmarkEvidenceByCapability = {},
  authorizedPermissions = [],
  limit = ACTIVE_NEURAL_CORTEX_MAX
} = {}) {
  if (!clean(mission, 4000)) return { ok: false, status: 'NEURAL_CAPABILITY_GENOME_ROUTE_REJECTED', reasonCodes: ['mission-required'] };
  const canonical = [];
  for (const raw of canonicalCapabilities) {
    const normalized = normalizeCapability(raw);
    if (normalized.ok) canonical.push(normalized.capability);
  }
  const bySource = new Map();
  for (const capability of canonical) {
    const source = sourceUrlOf(capability);
    if (!source) continue;
    if (!bySource.has(source)) bySource.set(source, []);
    bySource.get(source).push(capability);
  }

  const eligible = [];
  const blocked = [];
  for (const reference of neuralReferences) {
    if (!reference?.id || reference?.revocationState?.revoked === true) continue;
    const matches = bySource.get(referenceUrl(reference)) || [];
    if (!matches.length) {
      blocked.push({ neuralReferenceId: reference.id, reason: 'CANONICAL_CAPABILITY_BODY_NOT_AVAILABLE', acquisition: compileNeuralCapabilityAcquisitionRequest(reference) });
      continue;
    }
    for (const capability of matches) {
      if (!['APPROVED', 'ACTIVE'].includes(capability.promotionState)) {
        blocked.push({ neuralReferenceId: reference.id, capabilityId: capability.id, reason: 'CAPABILITY_NOT_APPROVED' });
        continue;
      }
      const admission = admitCapability(capability, {
        securityEvidence: securityEvidenceByCapability[capability.id] || [],
        requestedPermissions: capability.permissions,
        authorizedPermissions,
        intendedUse: 'EXTERNAL_INVOCATION'
      });
      if (!admission.ok || admission.decision !== 'ELIGIBLE') {
        blocked.push({ neuralReferenceId: reference.id, capabilityId: capability.id, reason: 'CAPABILITY_GENOME_ADMISSION_NOT_ELIGIBLE', admission });
        continue;
      }
      const benchmark = benchmarkEvidenceByCapability[capability.id];
      const benchmarkEligible = benchmark?.status === 'BENCHMARK_ELIGIBLE' && benchmark?.record?.securityPassed === true && benchmark?.record?.nonRegressing === true;
      if (!benchmarkEligible) {
        blocked.push({ neuralReferenceId: reference.id, capabilityId: capability.id, reason: 'FRESH_ELIGIBLE_BENCHMARK_REQUIRED' });
        continue;
      }
      eligible.push({
        neuralReferenceId: reference.id,
        capabilityId: capability.id,
        sourceHash: capability.sourceHash,
        family: reference.family,
        score: missionScore(mission, reference, capability, benchmark),
        admissionDigest: admission.securityEvidenceDigest,
        benchmarkDigest: benchmark.benchmarkDigest || null
      });
    }
  }

  const cap = Math.max(1, Math.min(ACTIVE_NEURAL_CORTEX_MAX, Number(limit) || ACTIVE_NEURAL_CORTEX_MAX));
  eligible.sort((a, b) => b.score - a.score || a.capabilityId.localeCompare(b.capabilityId));
  const selected = eligible.slice(0, cap).map(item => ({ ...item, score: Number(item.score.toFixed(6)) }));
  return {
    ok: true,
    status: selected.length ? 'CAPABILITY_GENOME_BACKED_NEURAL_CORTEX_SELECTED' : 'NO_CAPABILITY_GENOME_BACKED_NEURAL_ROUTE',
    mission,
    selected,
    eligibleCount: eligible.length,
    blocked,
    activeLimit: cap,
    selectionDigest: digest(selected),
    executionAuthority: 'EXISTING_CAPABILITY_AND_MISSION_GATES_ONLY',
    consequenceAuthority: 'NONE_CREATED_BY_NEURAL_SELECTION',
    truthBoundary: 'NEURAL_REFERENCE_PRESENCE_IS_NOT_EXECUTABILITY. ACTIVE_EXOCORTEX_SELECTION_REQUIRES_A_CANONICAL_CAPABILITY_GENOME_OBJECT_WITH_IMMUTABLE_SOURCE_HASH, APPROVED_OR_ACTIVE_LIFECYCLE, ELIGIBLE_ADMISSION, CURRENT_SECURITY_EVIDENCE, AND_NONREGRESSING_HOLDOUT_BENCHMARK.'
  };
}
