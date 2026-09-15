import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const OMEGA_LAWSPACE_CANARY_VERSION = 'uberbond.omega-lawspace-canary.v1';

const envelope = extra => ({
  businessEffectAuthority: 'NONE',
  externalEffectAuthority: 'NONE',
  externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS),
  ...extra
});

const fail = (status, reasonCodes, extra = {}) => envelope({
  ok: false,
  status,
  version: OMEGA_LAWSPACE_CANARY_VERSION,
  reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  ...extra
});

const stable = value => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  }
  return value;
};

const digest = value => crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
const primitive = value => typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value));
const idOk = value => /^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/.test(String(value || ''));
const symmetricConstraint = type => ['allDifferent', 'eq', 'neq', 'sumEq'].includes(type);

function normalizeVariables(raw) {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 128) return null;
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const id = String(item?.id || '');
    if (!idOk(id) || seen.has(id) || !Array.isArray(item?.domain) || item.domain.length === 0 || item.domain.length > 64) return null;
    const domain = [];
    const values = new Set();
    for (const value of item.domain) {
      if (!primitive(value)) return null;
      const key = JSON.stringify(value);
      if (!values.has(key)) { values.add(key); domain.push(value); }
    }
    if (!domain.length) return null;
    seen.add(id);
    out.push({ id, domain });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

function normalizeConstraints(raw, variables) {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 512) return null;
  const domainMap = new Map(variables.map(variable => [variable.id, variable.domain]));
  const ids = new Set(domainMap.keys());
  const out = [];
  for (const item of raw) {
    const type = String(item?.type || '');
    if (!['allDifferent', 'eq', 'neq', 'lt', 'sumEq'].includes(type)) return null;
    const rawVars = Array.isArray(item?.vars) ? item.vars.map(String) : [];
    if (!rawVars.length || new Set(rawVars).size !== rawVars.length || rawVars.some(id => !ids.has(id))) return null;
    if (['eq', 'neq', 'lt'].includes(type) && rawVars.length !== 2) return null;
    if (type === 'allDifferent' && rawVars.length < 2) return null;
    if (['lt', 'sumEq'].includes(type) && rawVars.some(id => domainMap.get(id).some(value => typeof value !== 'number' || !Number.isFinite(value)))) return null;
    const vars = symmetricConstraint(type) ? [...rawVars].sort() : [...rawVars];
    const normalized = { type, vars };
    if (type === 'sumEq') {
      const target = Number(item?.target);
      if (!Number.isFinite(target)) return null;
      normalized.target = target;
    }
    out.push(normalized);
  }
  out.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return out;
}

export function compileCognitiveLawFamily({ variables = [], constraints = [], name = 'anonymous-family' } = {}) {
  const normalizedVariables = normalizeVariables(variables);
  if (!normalizedVariables) return fail('COGNITIVE_LAW_FAMILY_REFUSED', ['invalid-variables']);
  const normalizedConstraints = normalizeConstraints(constraints, normalizedVariables);
  if (!normalizedConstraints) return fail('COGNITIVE_LAW_FAMILY_REFUSED', ['invalid-constraints']);
  const topology = { variables: normalizedVariables, constraints: normalizedConstraints };
  return envelope({
    ok: true,
    status: 'COGNITIVE_LAW_FAMILY_COMPILED',
    version: OMEGA_LAWSPACE_CANARY_VERSION,
    family: {
      name: String(name || 'anonymous-family').slice(0, 160),
      topologyHash: digest(topology),
      ...topology
    }
  });
}

export function instantiateCognitiveLaw({ family, givens = {}, instanceId = 'instance' } = {}) {
  if (!family?.topologyHash || !Array.isArray(family.variables) || !Array.isArray(family.constraints)) {
    return fail('COGNITIVE_LAW_INSTANCE_REFUSED', ['compiled-family-required']);
  }
  const known = new Map(family.variables.map(v => [v.id, v.domain]));
  const normalizedGivens = {};
  for (const [id, value] of Object.entries(givens || {})) {
    const domain = known.get(id);
    if (!domain || !domain.some(candidate => Object.is(candidate, value))) {
      return fail('COGNITIVE_LAW_INSTANCE_REFUSED', ['given-outside-family-domain'], { invalidGiven: id });
    }
    normalizedGivens[id] = value;
  }
  return envelope({
    ok: true,
    status: 'COGNITIVE_LAW_INSTANCE_READY',
    version: OMEGA_LAWSPACE_CANARY_VERSION,
    instance: {
      instanceId: String(instanceId || 'instance').slice(0, 160),
      familyHash: family.topologyHash,
      givens: normalizedGivens,
      family
    }
  });
}

export function crystallizeLawTopology({ family } = {}) {
  if (!family?.topologyHash || !Array.isArray(family.variables) || !Array.isArray(family.constraints)) {
    return fail('LAW_TOPOLOGY_CRYSTALLIZATION_REFUSED', ['compiled-family-required']);
  }
  const adjacency = Object.fromEntries(family.variables.map(v => [v.id, []]));
  family.constraints.forEach((constraint, index) => {
    for (const id of constraint.vars) adjacency[id].push(index);
  });
  for (const ids of Object.values(adjacency)) ids.sort((a, b) => a - b);
  const degreeOrder = family.variables.map(v => v.id).sort((a, b) => adjacency[b].length - adjacency[a].length || a.localeCompare(b));
  return envelope({
    ok: true,
    status: 'LAW_TOPOLOGY_CRYSTALLIZED',
    version: OMEGA_LAWSPACE_CANARY_VERSION,
    crystal: {
      familyHash: family.topologyHash,
      adjacency,
      degreeOrder,
      containsInstanceData: false,
      containsAnswers: false,
      crystalHash: digest({ familyHash: family.topologyHash, adjacency, degreeOrder })
    }
  });
}

function constraintSatisfied(constraint, assignment) {
  const values = constraint.vars.map(id => assignment[id]);
  if (values.some(value => value === undefined)) return false;
  if (constraint.type === 'allDifferent') return new Set(values.map(JSON.stringify)).size === values.length;
  if (constraint.type === 'eq') return Object.is(values[0], values[1]);
  if (constraint.type === 'neq') return !Object.is(values[0], values[1]);
  if (constraint.type === 'lt') return Number(values[0]) < Number(values[1]);
  if (constraint.type === 'sumEq') return values.reduce((sum, value) => sum + Number(value), 0) === constraint.target;
  return false;
}

export function verifyLawAssignment({ instance, assignment } = {}) {
  if (!instance?.family || !assignment || typeof assignment !== 'object' || Array.isArray(assignment)) {
    return fail('LAW_ASSIGNMENT_VERIFICATION_REFUSED', ['instance-and-assignment-required']);
  }
  const ids = instance.family.variables.map(v => v.id);
  const expected = new Set(ids);
  const actual = Object.keys(assignment);
  const exactKeys = actual.length === ids.length && actual.every(id => expected.has(id));
  const domainMap = new Map(instance.family.variables.map(v => [v.id, v.domain]));
  const complete = exactKeys && ids.every(id => Object.hasOwn(assignment, id));
  const domainValid = complete && ids.every(id => domainMap.get(id).some(value => Object.is(value, assignment[id])));
  const givensValid = Object.entries(instance.givens || {}).every(([id, value]) => Object.is(assignment[id], value));
  const constraintsValid = complete && domainValid && instance.family.constraints.every(constraint => constraintSatisfied(constraint, assignment));
  return envelope({
    ok: true,
    status: 'LAW_ASSIGNMENT_VERIFIED',
    version: OMEGA_LAWSPACE_CANARY_VERSION,
    valid: Boolean(complete && domainValid && givensValid && constraintsValid),
    checks: { complete, exactKeys, domainValid, givensValid, constraintsValid }
  });
}

function domainsFromInstance(instance) {
  const domains = new Map(instance.family.variables.map(v => [v.id, new Set(v.domain)]));
  for (const [id, value] of Object.entries(instance.givens || {})) domains.set(id, new Set([value]));
  return domains;
}

const cloneDomains = domains => new Map([...domains.entries()].map(([id, values]) => [id, new Set(values)]));
const singleton = set => set.size === 1 ? [...set][0] : undefined;

function possibleSum(domains, ids, skipId, fixedValue, target) {
  let sums = new Set([Number(fixedValue)]);
  for (const id of ids) {
    if (id === skipId) continue;
    const next = new Set();
    for (const prefix of sums) for (const value of domains.get(id)) next.add(prefix + Number(value));
    sums = next;
    if (!sums.size) return false;
  }
  return sums.has(Number(target));
}

function propagateConstraint(constraint, domains, metrics) {
  metrics.constraintEvaluations += 1;
  let changed = false;
  const remove = (id, value) => {
    const set = domains.get(id);
    if (set.has(value)) { set.delete(value); metrics.stateUpdates += 1; changed = true; }
  };
  if (constraint.type === 'allDifferent') {
    const fixed = new Map();
    for (const id of constraint.vars) {
      const value = singleton(domains.get(id));
      if (value !== undefined) {
        const key = JSON.stringify(value);
        if (fixed.has(key) && fixed.get(key) !== id) return { contradiction: true, changed };
        fixed.set(key, id);
      }
    }
    for (const id of constraint.vars) {
      if (domains.get(id).size === 1) continue;
      for (const key of fixed.keys()) remove(id, JSON.parse(key));
    }
  } else if (constraint.type === 'eq') {
    const [a, b] = constraint.vars;
    const da = domains.get(a), db = domains.get(b);
    for (const value of [...da]) if (![...db].some(v => Object.is(v, value))) remove(a, value);
    for (const value of [...db]) if (![...da].some(v => Object.is(v, value))) remove(b, value);
  } else if (constraint.type === 'neq') {
    const [a, b] = constraint.vars;
    const va = singleton(domains.get(a));
    const vb = singleton(domains.get(b));
    if (va !== undefined && vb !== undefined && Object.is(va, vb)) return { contradiction: true, changed };
    if (va !== undefined && domains.get(b).size > 1) remove(b, va);
    if (vb !== undefined && domains.get(a).size > 1) remove(a, vb);
  } else if (constraint.type === 'lt') {
    const [a, b] = constraint.vars;
    for (const value of [...domains.get(a)]) if (![...domains.get(b)].some(other => Number(value) < Number(other))) remove(a, value);
    for (const value of [...domains.get(b)]) if (![...domains.get(a)].some(other => Number(other) < Number(value))) remove(b, value);
  } else if (constraint.type === 'sumEq') {
    for (const id of constraint.vars) {
      for (const value of [...domains.get(id)]) if (!possibleSum(domains, constraint.vars, id, value, constraint.target)) remove(id, value);
    }
  }
  if (constraint.vars.some(id => domains.get(id).size === 0)) return { contradiction: true, changed };
  return { contradiction: false, changed };
}

function propagate(instance, crystal, domains, metrics) {
  const queue = instance.family.constraints.map((_, index) => index);
  const queued = new Set(queue);
  while (queue.length) {
    const index = queue.shift();
    queued.delete(index);
    const constraint = instance.family.constraints[index];
    const result = propagateConstraint(constraint, domains, metrics);
    if (result.contradiction) return false;
    if (!result.changed) continue;
    metrics.propagationRounds += 1;
    for (const id of constraint.vars) {
      for (const neighbor of crystal.adjacency[id]) {
        if (!queued.has(neighbor)) { queued.add(neighbor); queue.push(neighbor); }
      }
    }
  }
  return true;
}

function assignmentFromDomains(domains) {
  const assignment = {};
  for (const [id, values] of domains) {
    if (values.size !== 1) return null;
    assignment[id] = [...values][0];
  }
  return assignment;
}

function repellerMatches(repeller, domains) {
  if (!repeller?.pattern) return false;
  return Object.entries(repeller.pattern).every(([id, value]) => domains.get(id)?.size === 1 && Object.is(singleton(domains.get(id)), value));
}

export function solveWithCrystallizedDynamics({ instance, crystal, failureGeometry = [] } = {}) {
  if (!instance?.familyHash || !crystal?.familyHash) return fail('CRYSTALLIZED_DYNAMICS_REFUSED', ['instance-and-crystal-required']);
  if (instance.familyHash !== crystal.familyHash) return fail('CRYSTALLIZED_DYNAMICS_REFUSED', ['crystal-family-mismatch']);
  const metrics = { branches: 0, stateUpdates: 0, constraintEvaluations: 0, propagationRounds: 0, repellerPrunes: 0 };
  const rank = new Map(crystal.degreeOrder.map((id, index) => [id, index]));
  const search = domains => {
    metrics.branches += 1;
    if (!propagate(instance, crystal, domains, metrics)) return null;
    if (failureGeometry.some(repeller => repeller.familyHash === instance.familyHash && repellerMatches(repeller, domains))) {
      metrics.repellerPrunes += 1;
      return null;
    }
    const complete = assignmentFromDomains(domains);
    if (complete) return verifyLawAssignment({ instance, assignment: complete }).valid ? complete : null;
    const candidates = [...domains.entries()].filter(([, values]) => values.size > 1)
      .sort((a, b) => a[1].size - b[1].size || (rank.get(a[0]) ?? 9999) - (rank.get(b[0]) ?? 9999) || a[0].localeCompare(b[0]));
    const [id, values] = candidates[0];
    for (const value of values) {
      const child = cloneDomains(domains);
      child.set(id, new Set([value]));
      const solved = search(child);
      if (solved) return solved;
    }
    return null;
  };
  const assignment = search(domainsFromInstance(instance));
  return envelope({
    ok: Boolean(assignment),
    status: assignment ? 'CRYSTALLIZED_DYNAMICS_SOLVED' : 'CRYSTALLIZED_DYNAMICS_UNSOLVED',
    version: OMEGA_LAWSPACE_CANARY_VERSION,
    assignment,
    metrics,
    verifier: assignment ? verifyLawAssignment({ instance, assignment }) : null
  });
}

export function solveColdGenericDynamics({ instance, failureGeometry = [] } = {}) {
  if (!instance?.family) return fail('COLD_GENERIC_DYNAMICS_REFUSED', ['instance-required']);
  const crystallized = crystallizeLawTopology({ family: instance.family });
  if (!crystallized.ok) return crystallized;
  const solved = solveWithCrystallizedDynamics({ instance, crystal: crystallized.crystal, failureGeometry });
  return envelope({
    ok: solved.ok,
    status: solved.ok ? 'COLD_GENERIC_DYNAMICS_SOLVED' : 'COLD_GENERIC_DYNAMICS_UNSOLVED',
    version: OMEGA_LAWSPACE_CANARY_VERSION,
    assignment: solved.assignment,
    verifier: solved.verifier,
    metrics: { ...solved.metrics, topologyCompilations: 1 }
  });
}

export function solveColdEnumeration({ instance, maxCandidates = 2_000_000 } = {}) {
  if (!instance?.family) return fail('COLD_ENUMERATION_REFUSED', ['instance-required']);
  const variables = instance.family.variables;
  let candidatesEvaluated = 0;
  let assignment = null;
  const current = {};
  const visit = index => {
    if (assignment || candidatesEvaluated >= maxCandidates) return;
    if (index === variables.length) {
      candidatesEvaluated += 1;
      const verdict = verifyLawAssignment({ instance, assignment: current });
      if (verdict.valid) assignment = { ...current };
      return;
    }
    const variable = variables[index];
    const values = Object.hasOwn(instance.givens, variable.id) ? [instance.givens[variable.id]] : variable.domain;
    for (const value of values) {
      current[variable.id] = value;
      visit(index + 1);
      if (assignment || candidatesEvaluated >= maxCandidates) break;
    }
    delete current[variable.id];
  };
  visit(0);
  return envelope({
    ok: Boolean(assignment),
    status: assignment ? 'COLD_ENUMERATION_SOLVED' : 'COLD_ENUMERATION_UNSOLVED',
    version: OMEGA_LAWSPACE_CANARY_VERSION,
    assignment,
    metrics: { candidatesEvaluated, maxCandidatesReached: !assignment && candidatesEvaluated >= maxCandidates },
    verifier: assignment ? verifyLawAssignment({ instance, assignment }) : null
  });
}

export function compileExactFailureRepeller({ instance, failedAssignment, evidenceRef = 'local:test' } = {}) {
  if (!instance?.familyHash || !failedAssignment || typeof failedAssignment !== 'object' || Array.isArray(failedAssignment)) return fail('FAILURE_REPELLER_REFUSED', ['instance-and-failed-assignment-required']);
  const ids = instance.family.variables.map(v => v.id);
  const expected = new Set(ids);
  const actual = Object.keys(failedAssignment);
  if (actual.length !== ids.length || actual.some(id => !expected.has(id))) return fail('FAILURE_REPELLER_REFUSED', ['complete-failed-assignment-required']);
  const verdict = verifyLawAssignment({ instance, assignment: failedAssignment });
  if (verdict.valid) return fail('FAILURE_REPELLER_REFUSED', ['valid-solution-cannot-be-repeller']);
  const pattern = Object.fromEntries([...ids].sort().map(id => [id, failedAssignment[id]]));
  return envelope({
    ok: true,
    status: 'EXACT_FAILURE_REPELLER_COMPILED',
    version: OMEGA_LAWSPACE_CANARY_VERSION,
    repeller: {
      familyHash: instance.familyHash,
      scope: 'EXACT_ASSIGNMENT_ONLY',
      pattern,
      evidenceRef: String(evidenceRef || 'local:test').slice(0, 240),
      repellerHash: digest({ familyHash: instance.familyHash, pattern })
    }
  });
}

export function benchmarkStructuralCrystallization({ family, instances = [] } = {}) {
  const crystalReceipt = crystallizeLawTopology({ family });
  if (!crystalReceipt.ok) return crystalReceipt;
  if (!Array.isArray(instances) || !instances.length) return fail('STRUCTURAL_CRYSTALLIZATION_BENCHMARK_REFUSED', ['instances-required']);
  const rows = [];
  for (const instance of instances) {
    if (instance?.familyHash !== family.topologyHash) return fail('STRUCTURAL_CRYSTALLIZATION_BENCHMARK_REFUSED', ['instance-family-mismatch']);
    const enumeration = solveColdEnumeration({ instance });
    const freshDynamics = solveColdGenericDynamics({ instance });
    const reusedCrystal = solveWithCrystallizedDynamics({ instance, crystal: crystalReceipt.crystal });
    rows.push({
      instanceId: instance.instanceId,
      enumerationValid: Boolean(enumeration.verifier?.valid),
      freshDynamicsValid: Boolean(freshDynamics.verifier?.valid),
      reusedCrystalValid: Boolean(reusedCrystal.verifier?.valid),
      enumerationCandidates: enumeration.metrics?.candidatesEvaluated ?? null,
      freshDynamicsBranches: freshDynamics.metrics?.branches ?? null,
      reusedCrystalBranches: reusedCrystal.metrics?.branches ?? null,
      freshTopologyCompilations: freshDynamics.metrics?.topologyCompilations ?? null,
      reusedTopologyCompilations: 0,
      reusedConstraintEvaluations: reusedCrystal.metrics?.constraintEvaluations ?? null
    });
  }
  const comparable = rows.filter(row => row.enumerationValid && row.freshDynamicsValid && row.reusedCrystalValid && Number.isFinite(row.enumerationCandidates) && Number.isFinite(row.reusedCrystalBranches));
  const enumerationWork = comparable.reduce((sum, row) => sum + row.enumerationCandidates, 0);
  const reusedCrystalWork = comparable.reduce((sum, row) => sum + row.reusedCrystalBranches, 0);
  const freshTopologyCompilations = comparable.reduce((sum, row) => sum + row.freshTopologyCompilations, 0);
  return envelope({
    ok: comparable.length === rows.length,
    status: comparable.length === rows.length ? 'STRUCTURAL_CRYSTALLIZATION_BENCHMARK_READY' : 'STRUCTURAL_CRYSTALLIZATION_BENCHMARK_INCOMPLETE',
    version: OMEGA_LAWSPACE_CANARY_VERSION,
    rows,
    summary: {
      instances: rows.length,
      enumerationWork,
      reusedCrystalWork,
      branchReductionVsNaiveEnumeration: reusedCrystalWork > 0 ? enumerationWork / reusedCrystalWork : null,
      freshTopologyCompilations,
      reusedTopologyCompilations: 1,
      avoidedRepeatedTopologyCompilations: Math.max(0, freshTopologyCompilations - 1),
      learnedTransferClaim: false,
      truthBoundary: 'This bounded canary demonstrates semantic-preserving structural reuse and avoids repeated topology compilation. Naive enumeration is a validity/search reference, not a strong domain-solver baseline. Fresh generic dynamics and reused dynamics should have equivalent search behavior here. This does not prove learned transfer, general intelligence, physical speedup, or frontier-equivalent capability.'
    }
  });
}
