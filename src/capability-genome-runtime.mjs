import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { normalizeCapability } from './capability-genome-schema.mjs';
import { admitCapability } from './capability-genome-admission.mjs';

export const CAPABILITY_GENOME_RUNTIME_VERSION = 'capability-genome-runtime-1.0.3';

function clone(value) { return structuredClone(value); }
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function tokens(value) { return new Set(String(value ?? '').toLowerCase().match(/[a-z0-9][a-z0-9-]{1,}/g) || []); }
function overlap(a, b) {
  if (!a.size || !b.size) return 0;
  let hits = 0;
  for (const item of a) if (b.has(item)) hits += 1;
  return hits / new Set([...a, ...b]).size;
}
function finite(value, fallback = null) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function bounded(value, min = 0, max = 1) { const n = finite(value); return n == null ? null : Math.max(min, Math.min(max, n)); }
function fail(reasonCodes, extra = {}) {
  return { ok: false, policyVersion: CAPABILITY_GENOME_RUNTIME_VERSION, reasonCodes: [...new Set(reasonCodes.filter(Boolean))], businessEffectAuthority: 'NONE', externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS), ...extra };
}
function normalizeAll(capabilities) {
  if (!Array.isArray(capabilities)) return null;
  const output = [];
  for (const item of capabilities) {
    const result = normalizeCapability(item);
    if (!result.ok) return null;
    output.push(result.capability);
  }
  return output;
}

export function retrieveCapabilities({ mission, requiredAtomIds = [], capabilities = [], authorizedPermissions = [], securityEvidenceByCapability = {}, limit = 25 } = {}) {
  const normalized = normalizeAll(capabilities);
  if (!normalized || !String(mission || '').trim()) return fail(['mission-and-valid-capabilities-required']);
  const missionTokens = tokens(mission);
  const required = new Set(requiredAtomIds.map(String));
  const scored = [];
  for (const capability of normalized) {
    if (capability.promotionState === 'REVOKED' || capability.revocationState?.revoked) continue;
    if (!['APPROVED', 'ACTIVE'].includes(capability.promotionState)) continue;
    const admission = admitCapability(capability, { securityEvidence: securityEvidenceByCapability[capability.id] || [], requestedPermissions: capability.permissions, authorizedPermissions, intendedUse: 'EXTERNAL_INVOCATION' });
    if (!admission.ok || admission.decision !== 'ELIGIBLE') continue;
    const atomIds = new Set(capability.capabilityAtoms.map(atom => atom.id));
    const atomCoverage = required.size ? [...required].filter(atom => atomIds.has(atom)).length / required.size : 0;
    const fullBody = [capability.id, capability.canonicalIdentity, ...capability.aliases, ...capability.taskClasses, ...capability.capabilityAtoms.flatMap(atom => [atom.id, atom.verb, atom.noun, atom.description])].join(' ');
    const lexical = overlap(missionTokens, tokens(fullBody));
    const reliability = bounded(capability.reliability?.observedRate) ?? 0.5;
    const economic = bounded(capability.economicPrior?.confidence) ?? 0.25;
    const score = atomCoverage * 0.5 + lexical * 0.25 + reliability * 0.15 + economic * 0.1;
    scored.push({ capability, score, components: { atomCoverage, lexical, reliability, economic }, admission });
  }
  scored.sort((a, b) => b.score - a.score || a.capability.id.localeCompare(b.capability.id));
  const results = scored.slice(0, Math.max(1, Math.min(100, Number(limit) || 25)));
  return { ok: true, status: 'PROGRESSIVE_RETRIEVAL_COMPLETE', query: { mission, requiredAtomIds: [...required] }, candidateCount: scored.length, results, retrievalDigest: digest(results.map(item => ({ id: item.capability.id, score: item.score }))), businessEffectAuthority: 'NONE', externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS) };
}

function compatibility(capability, selectedIds) {
  const conflicts = new Set(capability.knownConflicts);
  const edges = capability.compatibilityEdges || [];
  for (const id of selectedIds) if (conflicts.has(id)) return { ok: false, reason: `conflicts:${id}` };
  for (const edge of edges) if (edge?.type === 'CONFLICTS_WITH' && selectedIds.has(edge.target)) return { ok: false, reason: `conflicts:${edge.target}` };
  return { ok: true };
}

function dependencyCycles(selected) {
  const byId = new Map(selected.map(item => [item.capability.id, item.capability]));
  const visiting = new Set();
  const visited = new Set();
  const stack = [];
  const cycleKeys = new Set();
  const cycles = [];

  function recordCycle(target) {
    const start = stack.lastIndexOf(target);
    const path = start >= 0 ? [...stack.slice(start), target] : [target, target];
    const members = [...new Set(path.slice(0, -1))].sort();
    const key = members.join('|');
    if (!cycleKeys.has(key)) {
      cycleKeys.add(key);
      cycles.push({ status: 'DEPENDENCY_CYCLE', members, path });
    }
  }

  function visit(id) {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      recordCycle(id);
      return;
    }
    visiting.add(id);
    stack.push(id);
    const capability = byId.get(id);
    for (const dependency of capability?.dependencies || []) {
      if (!byId.has(dependency)) continue;
      if (visiting.has(dependency)) recordCycle(dependency);
      else visit(dependency);
    }
    stack.pop();
    visiting.delete(id);
    visited.add(id);
  }

  for (const id of byId.keys()) visit(id);
  return cycles.sort((a, b) => a.members.join('|').localeCompare(b.members.join('|')));
}

export function selectMinimumCapabilityBundle({ requiredAtomIds = [], retrievalResults = [], maxBundleSize = 12 } = {}) {
  const uncovered = new Set(requiredAtomIds.map(String));
  const selected = [];
  const selectedIds = new Set();
  const reasons = [];
  while (uncovered.size && selected.length < Math.max(1, maxBundleSize)) {
    let winner = null;
    for (const result of retrievalResults) {
      const capability = result?.capability;
      if (!capability || selectedIds.has(capability.id)) continue;
      const compatible = compatibility(capability, selectedIds);
      if (!compatible.ok) { reasons.push({ id: capability.id, rejected: compatible.reason }); continue; }
      const covers = capability.capabilityAtoms.map(atom => atom.id).filter(id => uncovered.has(id));
      if (!covers.length) continue;
      const burden = 1 + capability.dependencies.length + (finite(capability.contextCost?.tokens, 0) / 10_000) + (finite(capability.monetaryCost?.cents, 0) / 1000);
      const utility = (covers.length * Math.max(0.001, finite(result.score, 0))) / burden;
      if (!winner || utility > winner.utility) winner = { capability, covers, utility, burden };
    }
    if (!winner) break;
    selected.push(winner);
    selectedIds.add(winner.capability.id);
    winner.covers.forEach(atom => uncovered.delete(atom));
  }
  // Dependencies are evaluated after bundle construction. Recording a gap while
  // greedily selecting caused a dependency chosen later in the same bundle to
  // remain falsely unresolved forever.
  const dependencyGaps = [];
  for (const item of selected) {
    for (const dependency of item.capability.dependencies) {
      if (!selectedIds.has(dependency)) dependencyGaps.push({ id: item.capability.id, dependency, status: 'DEPENDENCY_REQUIRED' });
    }
  }
  // A dependency graph is not executable merely because every referenced ID is
  // present. Self/circular dependency closures have no valid starting order and
  // must never be promoted to a runnable bundle.
  const cycles = dependencyCycles(selected);
  reasons.push(...dependencyGaps, ...cycles);
  const dependencyUnsafe = dependencyGaps.length > 0 || cycles.length > 0;
  return {
    ok: uncovered.size === 0 && !dependencyUnsafe,
    status: uncovered.size ? 'CAPABILITY_GAP_REMAINS' : dependencyGaps.length ? 'CAPABILITY_DEPENDENCY_GAP' : cycles.length ? 'CAPABILITY_DEPENDENCY_CYCLE' : 'MINIMUM_SUFFICIENT_BUNDLE_SELECTED',
    selected: selected.map(item => ({ id: item.capability.id, covers: item.covers, utility: item.utility, burden: item.burden })),
    uncoveredAtomIds: [...uncovered].sort(),
    reasons,
    bundleDigest: digest({ selected: selected.map(item => item.capability.id), uncovered: [...uncovered], dependencyGaps, cycles }),
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS)
  };
}

export function capabilityFitness({ expectedContributionProfitCents, taskSuccess, reliability, repeatability, founderMinuteReduction, strategicLeverage, portability, reversibility, securityDownside, failureProbability, monetaryCostCents, maintenanceBurden, contextBurden, dependencyBurden, providerLockIn, licenseRisk, blastRadius, evidenceConfidence = 0 } = {}) {
  const fields = { expectedContributionProfitCents, taskSuccess, reliability, repeatability, founderMinuteReduction, strategicLeverage, portability, reversibility, securityDownside, failureProbability, monetaryCostCents, maintenanceBurden, contextBurden, dependencyBurden, providerLockIn, licenseRisk, blastRadius, evidenceConfidence };
  const unknown = Object.entries(fields).filter(([, value]) => finite(value) == null).map(([key]) => key);
  if (unknown.length) return { ok: true, status: 'ECONOMIC_PRIOR_INCOMPLETE', score: null, unknownFields: unknown, evidenceClass: 'ESTIMATED_PRIOR_NOT_REVENUE' };
  const positive = Math.max(0, expectedContributionProfitCents) * Math.max(0, taskSuccess) * Math.max(0, reliability) * Math.max(0, repeatability) * Math.max(0.01, founderMinuteReduction) * Math.max(0.01, strategicLeverage) * Math.max(0.01, portability) * Math.max(0.01, reversibility);
  const downside = 1 + Math.max(0, securityDownside) * Math.max(0, failureProbability) + Math.max(0, monetaryCostCents) + Math.max(0, maintenanceBurden) + Math.max(0, contextBurden) + Math.max(0, dependencyBurden) + Math.max(0, providerLockIn) + Math.max(0, licenseRisk) + Math.max(0, blastRadius);
  const raw = positive / downside;
  return { ok: true, status: 'ECONOMIC_PRIOR_ESTIMATED', score: raw * Math.max(0, Math.min(1, evidenceConfidence)), rawScore: raw, evidenceConfidence, evidenceClass: 'ESTIMATED_PRIOR_NOT_REVENUE', components: clone(fields) };
}

export function evaluateBenchmark({ capabilityId, modelId, taskClass, baseline = {}, candidate = {}, holdoutId, leakChecks = [], securityPassed = false, benchmarkObservedAt, maxAgeDays = 90, now = new Date() } = {}) {
  const required = ['taskSuccess', 'quality', 'reliability', 'latencyMs', 'tokenCost', 'monetaryCostCents', 'founderInterventions'];
  const missing = required.filter(key => finite(baseline[key]) == null || finite(candidate[key]) == null);
  const leakFailure = leakChecks.some(check => check?.passed !== true);
  const reasons = [];
  if (!capabilityId || !modelId || !taskClass || !holdoutId) reasons.push('benchmark-identity-required');
  if (missing.length) reasons.push('complete-baseline-and-candidate-metrics-required');
  if (leakFailure) reasons.push('benchmark-leak-check-failed');
  if (!securityPassed) reasons.push('security-gate-dominates-benchmark');
  const observed = new Date(benchmarkObservedAt);
  const ageDays = Number.isFinite(observed.getTime()) ? (new Date(now).getTime() - observed.getTime()) / 86_400_000 : Number.POSITIVE_INFINITY;
  if (ageDays < 0 || ageDays > Math.max(1, Number(maxAgeDays) || 90)) reasons.push('benchmark-stale-or-undated');
  const nonRegressing = !missing.length && candidate.taskSuccess >= baseline.taskSuccess && candidate.quality >= baseline.quality && candidate.reliability >= baseline.reliability && candidate.founderInterventions <= baseline.founderInterventions;
  const record = { capabilityId, modelId, taskClass, holdoutId, benchmarkObservedAt: Number.isFinite(observed.getTime()) ? observed.toISOString() : null, maxAgeDays, baseline: clone(baseline), candidate: clone(candidate), leakChecks: clone(leakChecks), securityPassed, nonRegressing, reasonCodes: reasons, evidenceClass: 'BENCHMARK_NOT_COMMERCIAL_OUTCOME' };
  return { ok: true, status: reasons.length || !nonRegressing ? 'BENCHMARK_REJECTED' : 'BENCHMARK_ELIGIBLE', record, benchmarkDigest: digest(record), businessEffectAuthority: 'NONE', externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS) };
}

export function routeCapabilityModel({ taskClass, candidates = [], allowedCapabilityIds = null } = {}) {
  const allowed = allowedCapabilityIds == null ? null : new Set(allowedCapabilityIds.map(String));
  const eligible = candidates.filter(item => {
    const taskSuccess = finite(item?.taskSuccess);
    const reliability = item?.reliability == null ? 0.5 : finite(item.reliability);
    const quality = item?.quality == null ? 0.5 : finite(item.quality);
    const costCents = finite(item?.costCents);
    const latencyMs = item?.latencyMs == null ? 0 : finite(item.latencyMs);
    const metricsValid = taskSuccess != null && taskSuccess >= 0 && taskSuccess <= 1
      && reliability != null && reliability >= 0 && reliability <= 1
      && quality != null && quality >= 0 && quality <= 1
      && costCents != null && costCents >= 0
      && latencyMs != null && latencyMs >= 0;
    return item?.taskClass === taskClass
      && (allowed == null || allowed.has(String(item.capabilityId)))
      && item.configured === true
      && item.revoked !== true
      && item.available === true
      && item.securityPassed === true
      && item.providerIdentityObservable === true
      && String(item.capabilityId || '').trim()
      && String(item.modelId || '').trim()
      && String(item.providerId || '').trim()
      && metricsValid;
  });
  const ranked = eligible.map(item => {
    const taskSuccess = finite(item.taskSuccess);
    const reliability = item.reliability == null ? 0.5 : finite(item.reliability);
    const quality = item.quality == null ? 0.5 : finite(item.quality);
    const costCents = finite(item.costCents);
    const latencyMs = item.latencyMs == null ? 0 : finite(item.latencyMs);
    return { ...clone(item), routeScore: taskSuccess * reliability * quality / (1 + costCents + latencyMs / 1000) };
  }).sort((a, b) => b.routeScore - a.routeScore || String(a.capabilityId).localeCompare(String(b.capabilityId)));
  return { ok: ranked.length > 0, status: ranked.length ? 'MODEL_CAPABILITY_ROUTE_SELECTED' : 'NO_CONFIGURED_ELIGIBLE_ROUTE', selected: ranked[0] || null, alternatives: ranked.slice(1), routingDigest: digest(ranked.map(item => ({ capabilityId: item.capabilityId, modelId: item.modelId, providerId: item.providerId, score: item.routeScore }))), businessEffectAuthority: 'NONE', externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS) };
}

export function acquireCapability({ mission, requiredAtomIds = [], capabilities = [], authorizedPermissions = [], securityEvidenceByCapability = {}, modelCandidates = [] } = {}) {
  const retrieval = retrieveCapabilities({ mission, requiredAtomIds, capabilities, authorizedPermissions, securityEvidenceByCapability });
  if (!retrieval.ok) return retrieval;
  const bundle = selectMinimumCapabilityBundle({ requiredAtomIds, retrievalResults: retrieval.results });
  const gap = bundle.uncoveredAtomIds;
  const dependencyGap = ['CAPABILITY_DEPENDENCY_GAP', 'CAPABILITY_DEPENDENCY_CYCLE'].includes(bundle.status);
  const selectedIds = bundle.selected.map(item => item.id);
  // A model route is not a capability promotion mechanism. Only capabilities
  // that survived retrieval/admission and were actually selected into this
  // mission's minimum bundle may become executable routes.
  const route = gap.length || dependencyGap ? null : routeCapabilityModel({ taskClass: mission, candidates: modelCandidates, allowedCapabilityIds: selectedIds });
  const status = gap.length ? 'WORLD_SEARCH_REQUIRED' : dependencyGap ? 'DEPENDENCY_RESOLUTION_REQUIRED' : route?.ok ? 'ACQUISITION_READY_FOR_BOUNDED_MISSION' : 'CAPABILITY_PRESENT_ROUTE_UNAVAILABLE';
  return { ok: true, status, retrieval, bundle, route, next: gap.length ? { action: 'SEARCH_APPROVED_SOURCES_THEN_WORLD_CORPUS', missingAtomIds: gap } : dependencyGap ? { action: 'RESOLVE_PINNED_DEPENDENCIES_BEFORE_EXECUTION', dependencies: bundle.reasons.filter(item => ['DEPENDENCY_REQUIRED', 'DEPENDENCY_CYCLE'].includes(item.status)) } : route?.ok ? { action: 'EXECUTE_BOUNDED_MISSION_WITH_RECEIPT' } : { action: 'CONFIGURE_OR_SELECT_ELIGIBLE_ROUTE' }, acquisitionDigest: digest({ retrieval: retrieval.retrievalDigest, bundle: bundle.bundleDigest, route: route?.routingDigest || null }), businessEffectAuthority: 'NONE', externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS) };
}

export function capabilityExecutionReceipt({ missionId, capabilityId, capabilityRevision, modelId, providerId, permissionDecisionRef, inputClass, sideEffects = [], costCents = 0, durationMs = 0, resultRef, evidenceRefs = [], founderIntervention = false, economicOutcomeRef = null, now = new Date() } = {}) {
  const reasons = [];
  for (const [key, value] of Object.entries({ missionId, capabilityId, capabilityRevision, modelId, providerId, permissionDecisionRef, inputClass, resultRef })) if (!String(value || '').trim()) reasons.push(`${key}-required`);
  if (finite(costCents) == null || costCents < 0 || finite(durationMs) == null || durationMs < 0) reasons.push('non-negative-cost-and-duration-required');
  if (reasons.length) return fail(reasons);
  const receipt = { missionId, capabilityId, capabilityRevision, modelId, providerId, permissionDecisionRef, inputClass, sideEffects: [...new Set(sideEffects.map(String))], costCents, durationMs, resultRef, evidenceRefs: [...new Set(evidenceRefs.map(String))], founderIntervention: Boolean(founderIntervention), economicOutcomeRef, observedAt: new Date(now).toISOString(), truthBoundary: economicOutcomeRef ? 'ATTRIBUTION_LINK_ONLY_NOT_SOLE_CAUSAL_PROOF' : 'NO_ECONOMIC_OUTCOME_CLAIM' };
  return { ok: true, status: 'CAPABILITY_EXECUTION_RECORDED', receipt, receiptDigest: digest(receipt), businessEffectAuthority: 'NONE', externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS) };
}
