import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const FRONTIER_MODEL_TEAM_POLICY_VERSION = 'uberbond.frontier-model-team-1.1.0';
export const FRONTIER_MODEL_CANDIDATE_SCHEMA = 'uberbond.frontier-model-candidates.v1';

const ROLES = Object.freeze(['researcher', 'planner', 'builder', 'critic', 'verifier', 'adjudicator', 'general']);
const REASONING_TIERS = new Set(['FAST', 'STANDARD', 'DEEP', 'FRONTIER_MAX', 'COUNCIL_MAX']);

function zeroEffects() { return structuredClone(ZERO_EXTERNAL_EFFECTS); }
function text(value, max = 5000) { const out = String(value ?? '').trim(); return out && out.length <= max ? out : null; }
function integer(value, fallback, min, max) { const n = Number(value); return Number.isSafeInteger(n) && n >= min && n <= max ? n : fallback; }
function finite(value) { const n = Number(value); return Number.isFinite(n) && n >= 0 ? n : null; }
function timestamp(value) { const date = new Date(value); return Number.isFinite(date.getTime()) ? date.toISOString() : null; }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex'); }
function fail(reasonCodes, status = 'FRONTIER_MODEL_TEAM_BLOCKED', extra = {}) {
  return { ok: false, policyVersion: FRONTIER_MODEL_TEAM_POLICY_VERSION, status, reasonCodes: [...new Set(reasonCodes.filter(Boolean))], businessEffectAuthority: 'NONE', externalEffectLedger: zeroEffects(), ...extra };
}

function validateGatewayTransport(candidate, id) {
  const transport = candidate?.gatewayTransport;
  if (!transport || typeof transport !== 'object' || Array.isArray(transport)) return [`gateway-transport-required:${id || 'unknown'}`];
  const reasons = [];
  if (transport.transportProvider !== 'ai-gateway') reasons.push(`gateway-transport-provider-must-be-ai-gateway:${id || 'unknown'}`);
  if (!text(transport.transportModel, 240)?.includes('/')) reasons.push(`gateway-provider-model-slug-required:${id || 'unknown'}`);
  if (!String(transport.sourceRef || '').startsWith('https://vercel.com/ai-gateway/models/')) reasons.push(`gateway-official-model-source-required:${id || 'unknown'}`);
  if (!timestamp(transport.observedAt)) reasons.push(`gateway-observed-at-required:${id || 'unknown'}`);
  if (transport.evidenceClass !== 'OFFICIAL_SOURCE') reasons.push(`gateway-official-source-class-required:${id || 'unknown'}`);
  const pricing = transport.pricingHintUsdPerMillion;
  if (!pricing || finite(pricing.input) == null || finite(pricing.output) == null || !/NOT_PROFILE_PRICING_EVIDENCE/.test(String(pricing.truth || ''))) reasons.push(`gateway-pricing-hint-truth-boundary-required:${id || 'unknown'}`);
  return reasons;
}

export function validateFrontierModelCandidateRegistry(registry = {}) {
  const reasons = [];
  if (registry?.schemaVersion !== FRONTIER_MODEL_CANDIDATE_SCHEMA) reasons.push('candidate-registry-schema-invalid');
  if (!Array.isArray(registry?.candidates) || registry.candidates.length === 0 || registry.candidates.length > 256) reasons.push('bounded-candidate-list-required');
  const ids = new Set();
  const identities = new Set();
  const transportIdentities = new Set();
  for (const candidate of registry?.candidates || []) {
    const id = text(candidate?.id, 160)?.toLowerCase();
    const provider = text(candidate?.provider, 120)?.toLowerCase();
    const model = text(candidate?.canonicalModel, 200);
    if (!id || ids.has(id)) reasons.push('unique-candidate-id-required');
    else ids.add(id);
    const identity = provider && model ? `${provider}\u0000${model}` : null;
    if (!identity || identities.has(identity)) reasons.push('unique-provider-model-identity-required');
    else identities.add(identity);
    if (!Array.isArray(candidate?.rolePriors) || candidate.rolePriors.some(role => !ROLES.includes(role))) reasons.push(`recognized-role-priors-required:${id || 'unknown'}`);
    if (!Array.isArray(candidate?.taskClassPriors) || !candidate.taskClassPriors.length) reasons.push(`task-class-priors-required:${id || 'unknown'}`);
    if (!Array.isArray(candidate?.officialEvidenceRefs) || !candidate.officialEvidenceRefs.length || candidate.officialEvidenceRefs.some(ref => !String(ref).startsWith('https://'))) reasons.push(`official-evidence-required:${id || 'unknown'}`);
    if (candidate?.configured !== false) reasons.push(`catalog-candidate-must-not-self-claim-configured:${id || 'unknown'}`);
    reasons.push(...validateGatewayTransport(candidate, id));
    const gatewaySlug = text(candidate?.gatewayTransport?.transportModel, 240);
    if (gatewaySlug) {
      if (transportIdentities.has(gatewaySlug)) reasons.push(`unique-gateway-transport-model-required:${id || 'unknown'}`);
      transportIdentities.add(gatewaySlug);
    }
  }
  return {
    ok: reasons.length === 0,
    status: reasons.length ? 'FRONTIER_MODEL_CANDIDATE_REGISTRY_INVALID' : 'FRONTIER_MODEL_CANDIDATE_REGISTRY_VALID',
    reasonCodes: [...new Set(reasons)],
    candidateCount: registry?.candidates?.length || 0,
    gatewayTransportCandidateCount: (registry?.candidates || []).filter(candidate => candidate?.gatewayTransport?.transportProvider === 'ai-gateway').length,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects()
  };
}

export function frontierRoleCoverage(registry = {}) {
  const checked = validateFrontierModelCandidateRegistry(registry);
  if (!checked.ok) return checked;
  const coverage = {};
  for (const role of ROLES) {
    coverage[role] = registry.candidates.filter(candidate => candidate.rolePriors.includes(role)).map(candidate => candidate.id);
  }
  return {
    ok: true,
    status: 'FRONTIER_ROLE_PRIOR_COVERAGE_READY',
    coverage,
    gaps: ROLES.filter(role => coverage[role].length === 0),
    truthBoundary: 'ROLE PRIORS COME FROM PUBLIC CAPABILITY DESCRIPTIONS AND ARE SEARCH HINTS ONLY; OBSERVED UBERBOND BENCHMARKS CONTROL LIVE ROUTING.',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects()
  };
}

export function matchObservedProfilesToCandidates({ registry = {}, profiles = [] } = {}) {
  const checked = validateFrontierModelCandidateRegistry(registry);
  if (!checked.ok) return checked;
  const byIdentity = new Map(registry.candidates.map(candidate => [`${candidate.provider.toLowerCase()}\u0000${candidate.canonicalModel}`, candidate]));
  const matches = [];
  const unmatchedProfiles = [];
  for (const profile of Array.isArray(profiles) ? profiles : []) {
    const provider = text(profile?.provider, 120)?.toLowerCase();
    const model = text(profile?.model, 200);
    const candidate = byIdentity.get(`${provider}\u0000${model}`);
    if (!candidate) unmatchedProfiles.push(profile?.id || `${provider || 'unknown'}:${model || 'unknown'}`);
    else matches.push({
      candidateId: candidate.id,
      profileId: profile?.id || null,
      provider,
      model,
      revision: profile?.revision || null,
      transportProvider: profile?.transportProvider || null,
      transportModel: profile?.transportModel || null,
      gatewayTransportMatches: profile?.transportProvider === candidate.gatewayTransport.transportProvider && profile?.transportModel === candidate.gatewayTransport.transportModel,
      enabled: profile?.enabled !== false
    });
  }
  return {
    ok: true,
    status: 'FRONTIER_PROFILE_CANDIDATE_MATCH_COMPLETE',
    matches,
    unmatchedProfiles,
    configuredCandidateIds: [...new Set(matches.filter(item => item.enabled && item.gatewayTransportMatches).map(item => item.candidateId))],
    truthBoundary: 'A PROFILE MATCH IS IDENTITY AND DECLARED TRANSPORT ASSOCIATION ONLY. CALLABILITY, PRICING, BENCHMARK AND EXECUTION AUTHORITY REMAIN FRONTIER COGNITIVE FABRIC RESPONSIBILITIES.',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects()
  };
}

function stage(id, purpose, dependencies, role, taskClass, reasoningTier, parallelism, extra = {}) {
  if (!REASONING_TIERS.has(reasoningTier)) throw new Error(`invalid reasoning tier ${reasoningTier}`);
  return {
    id,
    purpose,
    dependencies,
    role,
    taskClass,
    reasoningTier,
    parallelism,
    modelSelection: 'RUNTIME_FRONTIER_COGNITIVE_FABRIC',
    authorityCeiling: 'LOCAL_PREPARATION',
    ...extra
  };
}

export function compileFrontierModelTeamMission({
  objective,
  featureGenomeDigest = null,
  cognitiveGraphDigest = null,
  complexity = 10,
  maxParallel = 6,
  dataClass = 'SOURCE_CODE'
} = {}) {
  const goal = text(objective, 12000);
  if (!goal) return fail(['objective-required'], 'FRONTIER_MODEL_TEAM_MISSION_INVALID');
  const level = integer(complexity, 10, 1, 10);
  const parallel = integer(maxParallel, 6, 2, 12);
  const councilSize = level >= 9 ? Math.min(5, parallel) : level >= 7 ? Math.min(4, parallel) : 3;
  const stages = [
    stage('unknown_unknown_scouts', 'Independently search for missing assumptions, graph holes, external shifts, contradictions and unseen opportunity mechanisms before solution convergence.', [], 'researcher', 'unknown-unknown-discovery', level >= 8 ? 'FRONTIER_MAX' : 'DEEP', Math.min(3, parallel), { independenceRequired: true }),
    stage('mechanism_recombination', 'Recombine distant Business Genome, GENESIS, Capability Genome and Feature Genome mechanisms into bounded opportunity and architecture candidates.', ['unknown_unknown_scouts'], 'planner', 'mechanism-recombination', 'FRONTIER_MAX', Math.min(3, parallel), { diversityRequired: true }),
    stage('economic_reality_attack', 'Attack each candidate on causal evidence, founder minutes, cost, reversibility, demand assumptions, hidden dependencies and kill conditions.', ['mechanism_recombination'], 'critic', 'economic-falsification', 'FRONTIER_MAX', Math.min(3, parallel), { majorityIsNotProof: true }),
    stage('max_council', 'Run sealed independent frontier responses, delayed cross-critique and independent adjudication over the surviving candidates.', ['economic_reality_attack'], 'adjudicator', 'uberbond-council', 'COUNCIL_MAX', councilSize, { minCouncilSize: Math.max(2, Math.min(3, councilSize)), maxCouncilSize: councilSize, providerDiversityPreferred: true }),
    stage('bounded_builder', 'Translate the adjudicated recommendation into the smallest dependency-satisfied implementation or experiment artifact that can be independently verified.', ['max_council'], 'builder', 'implementation', 'FRONTIER_MAX', Math.min(2, parallel), { noDirectMergeDeployOrBusinessEffects: true }),
    stage('independent_verification', 'Verify behavior, provenance, regression safety, authority ceilings, hostile cases and causal claims independently of the builder.', ['bounded_builder'], 'verifier', 'verification', 'FRONTIER_MAX', Math.min(2, parallel), { builderSelfVerificationInsufficient: true }),
    stage('economic_memory_update', 'Convert verified technical and external outcome evidence into routing, capability, opportunity and model-performance learning without laundering hypotheses into truth.', ['independent_verification'], 'adjudicator', 'economic-learning', level >= 8 ? 'COUNCIL_MAX' : 'FRONTIER_MAX', Math.min(3, parallel), { externalTruthRequiresExternalEvidence: true })
  ];
  const mission = {
    schemaVersion: 'uberbond.frontier-model-team-mission.v1',
    objective: goal,
    dataClass,
    complexity: level,
    maxParallel: parallel,
    featureGenomeDigest: featureGenomeDigest || null,
    cognitiveGraphDigest: cognitiveGraphDigest || null,
    stages,
    invariants: [
      'No model receives repository-write, merge, deployment, customer, payment, DNS, credential, spend or production authority merely by selection.',
      'Unknown-unknown search happens before convergence.',
      'Independent first passes remain sealed until critique.',
      'Provider/model diversity is preferred for frontier council work when evidence supports multiple callable candidates.',
      'Builder output requires independent verification.',
      'Commercial claims require external evidence; model agreement cannot create demand, revenue, payment, acceptance or retention truth.',
      'Observed task-specific outcomes update routing priors and may degrade, replace or revoke a previously favored model.'
    ],
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE'
  };
  return {
    ok: true,
    policyVersion: FRONTIER_MODEL_TEAM_POLICY_VERSION,
    status: 'FRONTIER_MODEL_TEAM_MISSION_READY',
    mission,
    missionDigest: digest(mission),
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects()
  };
}

export const FRONTIER_MODEL_TEAM_ROLES = ROLES;
