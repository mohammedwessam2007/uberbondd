import crypto from 'node:crypto';
import { mine, conceptPressure } from '../unknown-unknown-mining.mjs';

export const UBEROS_UNKNOWN_UNKNOWN_LAB_VERSION = 'uberos.unknown-unknown-lab.v1';
export const PERTURBATION_FAMILIES = Object.freeze(['CLOCK_DISCONTINUITY','STORAGE_ACK_LIES','NETWORK_IDENTITY_SHIFT','MEMORY_WITHDRAWAL','AUTHORITY_REVOCATION_MID_ACTION','MODEL_PROVIDER_DISAPPEARANCE','PARTIAL_BOOT_CORRUPTION','CPU_HETEROGENEITY','DEPENDENCY_DISAPPEARANCE','POWER_LOSS_AT_COMMIT_BOUNDARY','FILESYSTEM_READ_ONLY_FLIP','ENTROPY_SOURCE_FAILURE']);
const clean = (value, max = 1400) => { const text = String(value ?? '').trim(); return text && text.length <= max ? text : null; };
const digest = value => `sha256:${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;

export function compileAssumptionExperiment({ assumption, invariant, observable, sourceA = 'simulator-a', sourceB = 'simulator-b', families = PERTURBATION_FAMILIES } = {}) {
  const a = clean(assumption); const inv = clean(invariant); const obs = clean(observable);
  if (!a || !inv || !obs) return { ok: false, status: 'ASSUMPTION_EXPERIMENT_INVALID', reasonCodes: ['assumption-invariant-observable-required'], consequenceAuthority: 'NONE' };
  const selected = [...new Set((Array.isArray(families) ? families : []).map(v => String(v).trim().toUpperCase()).filter(v => PERTURBATION_FAMILIES.includes(v)))].sort();
  if (!selected.length) return { ok: false, status: 'ASSUMPTION_EXPERIMENT_INVALID', reasonCodes: ['known-perturbation-family-required'], consequenceAuthority: 'NONE' };
  const core = { assumption: a, invariant: inv, observable: obs, independentSources: [clean(sourceA, 160), clean(sourceB, 160)].filter(Boolean), perturbations: selected.map((family, index) => ({ experimentId: `ux_${index.toString().padStart(2, '0')}_${family.toLowerCase()}`, family, question: `DOES_${family}_VIOLATE_THE_DECLARED_INVARIANT`, expected: inv, observationContract: obs })) };
  return { ok: true, status: 'ASSUMPTION_EXPERIMENT_COMPILED', experiment: { ...core, experimentDigest: digest(core) }, consequenceAuthority: 'NONE' };
}

export function analyzeExperimentOutcomes({ observations = [], expectations = [], declaredDomains = [], sourceCoverage = {}, phenomenon = null, existingCategories = [], fitsAny = null, distortionIfForced = null } = {}) {
  const mined = mine({ observations, expectations, observedDomains: declaredDomains, sourceCoverage });
  const ontology = phenomenon ? conceptPressure({ phenomenon, existingCategories, fitsAny, distortionIfForced }) : null;
  return { ok: mined.ok === true && (ontology == null || ontology.ok === true), status: 'UBEROS_UNKNOWN_UNKNOWN_ANALYSIS_READY', mining: mined, ontology, promotionBoundary: 'QUESTIONS_AND_ONTOGENESIS_CANDIDATES_ONLY__NO_AUTOMATIC_KERNEL_OR_POLICY_CHANGE', consequenceAuthority: 'NONE' };
}

export function defaultOsAssumptionPortfolio() {
  return [
    ['wall-clock time is monotonic enough for coordination','state remains replay-safe across time discontinuity','duplicate or reordered durable effects'],
    ['a successful write acknowledgement means durable storage','committed state survives simulated acknowledgement lies','post-restart digest mismatch'],
    ['network identity stays stable during a transaction','identity change cannot widen or confuse authority','authority binding mismatch'],
    ['memory remains available until an operation completes','partial work is recoverable after memory withdrawal','orphaned transition'],
    ['authority survives for the duration of an operation','revocation stops further effects immediately','effect after revocation'],
    ['AI inference remains reachable','core boot and recovery require no model','boot dependency on model'],
    ['boot state is internally consistent','corrupt optional state cannot corrupt recovery root','recovery root mismatch'],
    ['CPU cores behave uniformly','correctness is architecture-capability bound not core-name bound','divergent test outcome'],
    ['dependencies present at build time remain available','runtime has explicit closure over required dependencies','missing dependency at execution'],
    ['power remains available around commit','atomic promotion yields old or new state never torn state','torn state'],
    ['filesystem writeability remains stable','read-only transition produces safe degraded mode','write loop or data loss'],
    ['entropy sources are available','security-sensitive operations fail closed without trusted entropy','weak-secret generation']
  ].map(([assumption, invariant, observable]) => ({ assumption, invariant, observable }));
}
