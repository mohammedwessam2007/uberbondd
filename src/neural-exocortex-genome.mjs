import crypto from 'node:crypto';
import {
  NEURAL_ACTIVE_CORTEX_MAX,
  NEURAL_FINAL_CAPABILITY_TARGET,
  NEURAL_FAMILY_WEIGHTS,
  scoreNeuralRepository
} from './neural-repository-atlas.mjs';

export const NEURAL_EXOCORTEX_GENOME_VERSION = 'uberbond.neural-exocortex-genome.v1';
export const NEURAL_EXOCORTEX_SCHEMA = 'uberbond.neural-exocortex-capability.v1';
export const FINAL_NEURAL_CAPABILITY_TARGET = NEURAL_FINAL_CAPABILITY_TARGET;
export const ACTIVE_NEURAL_CORTEX_MAX = NEURAL_ACTIVE_CORTEX_MAX;

const stable = value => {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
};
const digest = value => crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
const unique = values => [...new Set((values || []).filter(Boolean))];
const clean = (value, max = 1000) => String(value ?? '').trim().slice(0, max);
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, Number(value) || 0));
const tokenSet = value => new Set(String(value ?? '').toLowerCase().match(/[a-z0-9][a-z0-9.+_-]{1,}/g) || []);

const FAMILY_ROLES = Object.freeze({
  reasoning: 'DELIBERATION', planning: 'PLANNING', memory: 'MEMORY', metacognition: 'SELF_MONITORING',
  verification: 'VERIFICATION', retrieval: 'RETRIEVAL', knowledge: 'KNOWLEDGE', causal: 'CAUSAL_REASONING',
  theorem: 'FORMAL_REASONING', math: 'MATHEMATICAL_REASONING', code: 'PROGRAM_SYNTHESIS', research: 'RESEARCH',
  agents: 'AGENCY', multiagent: 'COLLECTIVE_COGNITION', self_improvement: 'SELF_IMPROVEMENT', evaluation: 'EVALUATION',
  reliability: 'RELIABILITY', security: 'SECURITY', probabilistic: 'UNCERTAINTY', forecasting: 'FORECASTING',
  simulation: 'SIMULATION', optimization: 'OPTIMIZATION', models: 'MODEL_SUPPLY', inference: 'INFERENCE',
  efficiency: 'EFFICIENCY', compute: 'COMPUTE', personal: 'PERSONAL_EXOCORTEX', education: 'LEARNING',
  hci: 'HUMAN_INTERFACE', multimodal: 'MULTIMODAL_PERCEPTION', tools: 'TOOL_USE', protocols: 'INTEROPERABILITY',
  browser: 'WEB_ACTION', desktop: 'COMPUTER_USE', science: 'SCIENTIFIC_REASONING', graph: 'GRAPH_REASONING',
  provenance: 'PROVENANCE', calibration: 'CALIBRATION', bci: 'NEURAL_INTERFACE'
});

function repositoryIdentity(repository = {}) {
  const fullName = clean(repository.repositoryFullName ?? repository.full_name, 240);
  return /^[^/\s]+\/[^/\s]+$/.test(fullName) ? fullName.toLowerCase() : null;
}
function discoveryFamily(observation = {}) { return clean(observation.family ?? observation.discoveryFamily ?? observation.queryFamily, 120).toLowerCase() || null; }
function familySeed(observation = {}) { return clean(observation.seed ?? observation.discoverySeed, 300) || null; }
function familyLexicalFit(repository = {}, family = '') {
  const haystack = [repository.repositoryFullName, repository.full_name, repository.name, repository.description, ...(Array.isArray(repository.topics) ? repository.topics : [])].filter(Boolean).join(' ');
  const body = tokenSet(haystack);
  const familyTokens = tokenSet(String(family).replaceAll('_', ' '));
  if (!familyTokens.size || !body.size) return 0;
  let hits = 0;
  for (const token of familyTokens) if (body.has(token)) hits += 1;
  return hits / familyTokens.size;
}

export function neuralCapabilityPrior(record = {}, { now = new Date() } = {}) {
  const repositoryPrior = clamp(scoreNeuralRepository(record, { family: record.family, now }) / 100);
  const familyWeight = clamp(NEURAL_FAMILY_WEIGHTS[record.family] ?? record.familyWeight ?? 0.8);
  const lexicalFit = clamp(record.lexicalFit ?? familyLexicalFit(record, record.family));
  const sourceMultiplicity = clamp(Math.log2(1 + Math.max(1, Number(record.discoveryEvidenceCount || 1))) / 5);
  const exocortexCore = ['reasoning','planning','memory','metacognition','verification','retrieval','knowledge','causal','theorem','code','research','personal','calibration','provenance'].includes(record.family) ? 1 : 0.6;
  const score = clamp(repositoryPrior * 0.42 + familyWeight * 0.20 + lexicalFit * 0.12 + sourceMultiplicity * 0.08 + exocortexCore * 0.18);
  return { score: Number(score.toFixed(6)), repositoryPrior: Number(repositoryPrior.toFixed(6)), familyWeight: Number(familyWeight.toFixed(6)), lexicalFit: Number(lexicalFit.toFixed(6)), sourceMultiplicity: Number(sourceMultiplicity.toFixed(6)), exocortexCore: Number(exocortexCore.toFixed(6)), evidenceClass: 'DISCOVERY_PRIOR_NOT_BENCHMARK_NOT_ASI_PROOF' };
}

export function normalizeNeuralCapabilityObservation(observation = {}, { observedAt = new Date() } = {}) {
  const repository = observation.repository && typeof observation.repository === 'object' ? observation.repository : observation;
  const repoIdentity = repositoryIdentity(repository);
  const family = discoveryFamily(observation) || discoveryFamily(repository);
  if (!repoIdentity || !family) return { ok: false, status: 'NEURAL_CAPABILITY_OBSERVATION_REJECTED', reasonCodes: unique([!repoIdentity && 'public-repository-identity-required', !family && 'neural-family-required']) };
  const sourceUrl = clean(repository.sourceUrl ?? repository.html_url ?? `https://github.com/${repoIdentity}`, 500);
  if (!/^https:\/\/github\.com\//i.test(sourceUrl)) return { ok: false, status: 'NEURAL_CAPABILITY_OBSERVATION_REJECTED', reasonCodes: ['public-github-source-required'] };
  if (repository.private === true || String(repository.visibility || '').toLowerCase() === 'private') return { ok: false, status: 'NEURAL_CAPABILITY_OBSERVATION_REJECTED', reasonCodes: ['private-repository-not-eligible'] };
  const seed = familySeed(observation) || clean(repository.discoverySeed, 300) || null;
  const query = clean(observation.query ?? observation.discoveryQuery ?? repository.discoveryQuery, 600) || null;
  const observed = new Date(observation.observedAt ?? repository.observedAt ?? observedAt);
  if (!Number.isFinite(observed.getTime())) return { ok: false, status: 'NEURAL_CAPABILITY_OBSERVATION_REJECTED', reasonCodes: ['valid-observed-at-required'] };
  const capabilityId = `neural:${repoIdentity}#${family}`;
  const record = {
    schemaVersion: NEURAL_EXOCORTEX_SCHEMA, id: capabilityId, canonicalIdentity: capabilityId,
    repositoryFullName: clean(repository.repositoryFullName ?? repository.full_name, 240), sourceUrl, family,
    role: FAMILY_ROLES[family] || 'COGNITIVE_SUPPORT', familyWeight: NEURAL_FAMILY_WEIGHTS[family] ?? 0.8,
    description: clean(repository.description, 1200) || null,
    topics: unique(Array.isArray(repository.topics) ? repository.topics.map(item => clean(item, 120)) : []).slice(0, 32),
    language: clean(repository.language, 80) || null,
    stars: Math.max(0, Number(repository.stargazers_count ?? repository.stargazersCount ?? repository.stars ?? 0) || 0),
    forks: Math.max(0, Number(repository.forks_count ?? repository.forksCount ?? repository.forks ?? 0) || 0),
    licenseSpdx: clean(repository.license?.spdx_id ?? repository.licenseSpdx, 80) || null,
    archived: repository.archived === true, fork: repository.fork === true,
    pushedAt: clean(repository.pushed_at ?? repository.pushedAt, 80) || null,
    defaultBranch: clean(repository.default_branch ?? repository.defaultBranch, 120) || null,
    discoverySeeds: unique([seed]), discoveryQueries: unique([query]), discoveryEvidenceCount: 1,
    observedFirstAt: observed.toISOString(), observedLastAt: observed.toISOString(),
    evidenceClass: 'MEASURED_PUBLIC_GITHUB_DISCOVERY_CLAIM', truthClass: 'RESEARCH_ASSET', trustState: 'UNTRUSTED_DISCOVERY_CAPABILITY_CLAIM',
    promotionState: 'DISCOVERED', securityState: 'UNREVIEWED', benchmarkState: 'UNBENCHMARKED', revocationState: { revoked: false },
    executionAuthority: 'NONE', consequenceAuthority: 'NONE', spendAuthority: 'NONE', messagingAuthority: 'NONE', deploymentAuthority: 'NONE', moneyMovementAuthority: 'NONE'
  };
  record.lexicalFit = familyLexicalFit(record, family);
  record.neuralPrior = neuralCapabilityPrior(record, { now: observed });
  record.recordDigest = digest(record);
  return { ok: true, status: 'NEURAL_CAPABILITY_DISCOVERY_RECORD_NORMALIZED', capability: record };
}

export function mergeNeuralCapabilityRecords(a, b) {
  if (!a || !b || a.id !== b.id) return null;
  const latest = String(a.observedLastAt) >= String(b.observedLastAt) ? a : b;
  const earliest = String(a.observedFirstAt) <= String(b.observedFirstAt) ? a : b;
  const merged = { ...latest, discoverySeeds: unique([...(a.discoverySeeds || []), ...(b.discoverySeeds || [])]), discoveryQueries: unique([...(a.discoveryQueries || []), ...(b.discoveryQueries || [])]).slice(0, 64), discoveryEvidenceCount: Number(a.discoveryEvidenceCount || 1) + Number(b.discoveryEvidenceCount || 1), observedFirstAt: earliest.observedFirstAt, observedLastAt: latest.observedLastAt, stars: Math.max(Number(a.stars || 0), Number(b.stars || 0)), forks: Math.max(Number(a.forks || 0), Number(b.forks || 0)), topics: unique([...(a.topics || []), ...(b.topics || [])]).slice(0, 32) };
  merged.neuralPrior = neuralCapabilityPrior(merged, { now: new Date(merged.observedLastAt) });
  merged.recordDigest = digest({ ...merged, recordDigest: undefined });
  return merged;
}

function balancedTopMillion(records, target) {
  if (records.length <= target) return records.slice().sort((a, b) => b.neuralPrior.score - a.neuralPrior.score || a.id.localeCompare(b.id));
  const groups = new Map();
  for (const record of records) { if (!groups.has(record.family)) groups.set(record.family, []); groups.get(record.family).push(record); }
  for (const group of groups.values()) group.sort((a, b) => b.neuralPrior.score - a.neuralPrior.score || a.id.localeCompare(b.id));
  const familyCount = Math.max(1, groups.size);
  const protectedBudget = Math.floor(target * 0.35);
  const floorPerFamily = Math.max(1, Math.floor(protectedBudget / familyCount));
  const selected = [], selectedIds = new Set();
  for (const family of [...groups.keys()].sort()) for (const record of groups.get(family).slice(0, floorPerFamily)) { selected.push(record); selectedIds.add(record.id); if (selected.length >= target) return selected; }
  const remainder = records.filter(record => !selectedIds.has(record.id)).sort((a, b) => b.neuralPrior.score - a.neuralPrior.score || a.id.localeCompare(b.id));
  for (const record of remainder) { if (selected.length >= target) break; selected.push(record); }
  return selected;
}

export function buildNeuralExocortexCorpus({ observations = [], capabilityRecords = [], target = FINAL_NEURAL_CAPABILITY_TARGET } = {}) {
  const byId = new Map(); let rejectedObservations = 0;
  for (const raw of observations) { const normalized = normalizeNeuralCapabilityObservation(raw); if (!normalized.ok) { rejectedObservations += 1; continue; } const record = normalized.capability; const previous = byId.get(record.id); byId.set(record.id, previous ? mergeNeuralCapabilityRecords(previous, record) : record); }
  for (const record of capabilityRecords) { if (!record?.id || !record?.family || !record?.neuralPrior) continue; const previous = byId.get(record.id); byId.set(record.id, previous ? mergeNeuralCapabilityRecords(previous, record) : structuredClone(record)); }
  const deduped = [...byId.values()];
  const requestedTarget = Math.max(1, Math.min(FINAL_NEURAL_CAPABILITY_TARGET, Number(target) || FINAL_NEURAL_CAPABILITY_TARGET));
  const selected = balancedTopMillion(deduped, requestedTarget);
  const familyCounts = {}; for (const record of selected) familyCounts[record.family] = (familyCounts[record.family] || 0) + 1;
  const targetSatisfied = selected.length >= requestedTarget;
  const manifestCore = { schemaVersion: 'uberbond.neural-exocortex-corpus.v1', version: NEURAL_EXOCORTEX_GENOME_VERSION, requestedFinalCapabilityTarget: requestedTarget, immutableProgramTarget: FINAL_NEURAL_CAPABILITY_TARGET, observedClaims: observations.length + capabilityRecords.length, rejectedObservations, distinctCapabilityRecords: deduped.length, retainedCapabilityRecords: selected.length, targetSatisfied, familyCounts, activeCortexMaximum: ACTIVE_NEURAL_CORTEX_MAX, truthBoundary: 'THE_FINAL_ONE_MILLION_IS_A_DEDUPED_REFERENCE_EXOCORTEX_LIBRARY__DISCOVERY_RECORDS_ARE_NOT_EXECUTABLE__ONLY_SEPARATELY_SECURITY_REVIEWED_BENCHMARKED_APPROVED_RECORDS_MAY_ENTER_THE_ACTIVE_CORTEX' };
  return { ok: true, status: targetSatisfied ? 'NEURAL_EXOCORTEX_ONE_MILLION_FINAL_LIBRARY_READY' : 'NEURAL_EXOCORTEX_FINAL_LIBRARY_ACCUMULATING', manifest: { ...manifestCore, corpusDigest: digest(selected.map(record => [record.id, record.recordDigest, record.neuralPrior.score])) }, capabilities: selected, businessEffectAuthority: 'NONE', consequenceAuthority: 'NONE' };
}

function overlap(a, b) { if (!a.size || !b.size) return 0; let hits = 0; for (const token of a) if (b.has(token)) hits += 1; return hits / new Set([...a, ...b]).size; }
function missionScore(mission, record) { const missionTokens = tokenSet(mission); const recordTokens = tokenSet([record.family, record.role, record.repositoryFullName, record.description, ...(record.topics || []), ...(record.discoverySeeds || [])].join(' ')); return clamp(overlap(missionTokens, recordTokens) * 0.55 + Number(record.neuralPrior?.score || 0) * 0.45); }

export function retrieveNeuralReferenceBundle({ mission, capabilities = [], limit = 32 } = {}) {
  if (!clean(mission, 4000)) return { ok: false, status: 'NEURAL_REFERENCE_RETRIEVAL_REJECTED', reasonCodes: ['mission-required'] };
  const cap = Math.max(1, Math.min(256, Number(limit) || 32));
  const ranked = capabilities.filter(record => record?.id && record?.family && record?.revocationState?.revoked !== true).map(record => ({ record, score: missionScore(mission, record) })).sort((a, b) => b.score - a.score || a.record.id.localeCompare(b.record.id));
  const familySeen = new Set(), selected = [];
  for (const item of ranked) { if (selected.length >= cap) break; if (familySeen.has(item.record.family) && selected.length < Math.min(cap, 8)) continue; selected.push({ id: item.record.id, family: item.record.family, repositoryFullName: item.record.repositoryFullName, sourceUrl: item.record.sourceUrl, score: Number(item.score.toFixed(6)), executionAuthority: 'NONE', trustState: item.record.trustState }); familySeen.add(item.record.family); }
  return { ok: true, status: 'NEURAL_REFERENCE_BUNDLE_RETRIEVED', mission, selected, retrievalDigest: digest(selected), executionAuthority: 'NONE', truthBoundary: 'REFERENCE_RETRIEVAL_IS_FOR_RESEARCH_AND_CAPABILITY_ACQUISITION_ONLY__IT_DOES_NOT_AUTHORIZE_EXECUTION' };
}

export function selectActiveNeuralCortex({ mission, capabilities = [], limit = ACTIVE_NEURAL_CORTEX_MAX } = {}) {
  if (!clean(mission, 4000)) return { ok: false, status: 'ACTIVE_NEURAL_CORTEX_REJECTED', reasonCodes: ['mission-required'] };
  const cap = Math.max(1, Math.min(ACTIVE_NEURAL_CORTEX_MAX, Number(limit) || ACTIVE_NEURAL_CORTEX_MAX));
  const eligible = capabilities.filter(record => ['APPROVED','ACTIVE'].includes(record?.promotionState) && record?.securityState === 'APPROVED' && record?.benchmarkState === 'ELIGIBLE' && record?.revocationState?.revoked !== true && record?.executionAuthority === 'BOUNDED_MISSION_ONLY');
  const ranked = eligible.map(record => ({ record, score: missionScore(mission, record) })).sort((a, b) => b.score - a.score || a.record.id.localeCompare(b.record.id)).slice(0, cap);
  return { ok: true, status: ranked.length ? 'ACTIVE_NEURAL_CORTEX_BUNDLE_SELECTED' : 'NO_APPROVED_NEURAL_CAPABILITY_ROUTE', mission, selected: ranked.map(item => ({ id: item.record.id, family: item.record.family, score: Number(item.score.toFixed(6)) })), candidateCount: eligible.length, activeLimit: cap, authorityLaw: 'ACTIVE_SELECTION_NEVER_WIDENS_THE_UNDERLYING_CAPABILITY_PERMISSION_OR_MISSION_AUTHORITY', selectionDigest: digest(ranked.map(item => [item.record.id, item.score])) };
}

export function neuralExocortexProgress(corpus) {
  const count = Number(corpus?.manifest?.retainedCapabilityRecords || 0), target = FINAL_NEURAL_CAPABILITY_TARGET;
  return { target, retained: count, remaining: Math.max(0, target - count), fraction: target ? Number((count / target).toFixed(8)) : 0, complete: count >= target, status: count >= target ? 'ONE_MILLION_FINAL_NEURAL_LIBRARY_COMPLETE' : 'ONE_MILLION_FINAL_NEURAL_LIBRARY_ACCUMULATING', activeCortexMaximum: ACTIVE_NEURAL_CORTEX_MAX };
}
