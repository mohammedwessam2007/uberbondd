import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const OMEGA_STRUCTURAL_TRANSFER_CANARY_VERSION = 'uberbond.omega-structural-transfer-canary.v1';

const envelope = extra => ({ businessEffectAuthority: 'NONE', externalEffectAuthority: 'NONE', externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS), ...extra });
const fail = reasons => envelope({ ok: false, status: 'OMEGA_STRUCTURAL_TRANSFER_REFUSED', version: OMEGA_STRUCTURAL_TRANSFER_CANARY_VERSION, reasonCodes: [...new Set(reasons.filter(Boolean))] });
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const text = (value, max = 160) => { const out = String(value ?? '').trim(); return out && out.length <= max ? out : null; };

function normalizeProblem(raw = {}) {
  const id = text(raw.id);
  const domain = text(raw.domain);
  const labels = Array.isArray(raw.labels) ? [...new Set(raw.labels.map(String))] : [];
  const variables = Array.isArray(raw.variables) ? [...new Set(raw.variables.map(String))] : [];
  const conflicts = Array.isArray(raw.conflicts) ? raw.conflicts.map(pair => Array.isArray(pair) ? pair.map(String) : null) : [];
  if (!id || !domain || labels.length < 2 || !variables.length || variables.length > 12) return null;
  const variableSet = new Set(variables);
  const normalizedConflicts = [];
  const seen = new Set();
  for (const pair of conflicts) {
    if (!pair || pair.length !== 2 || pair[0] === pair[1] || pair.some(v => !variableSet.has(v))) return null;
    const edge = [...pair].sort();
    const key = edge.join('\u0000');
    if (!seen.has(key)) { seen.add(key); normalizedConflicts.push(edge); }
  }
  const givens = {};
  for (const [key, value] of Object.entries(raw.givens || {})) {
    if (!variableSet.has(key) || !labels.includes(String(value))) return null;
    givens[key] = String(value);
  }
  normalizedConflicts.sort((a, b) => a.join('|').localeCompare(b.join('|')));
  variables.sort();
  labels.sort();
  return { id, domain, variables, labels, conflicts: normalizedConflicts, givens };
}

function adjacency(problem) {
  const out = new Map(problem.variables.map(v => [v, new Set()]));
  for (const [a, b] of problem.conflicts) { out.get(a).add(b); out.get(b).add(a); }
  return out;
}

function structuralSignature(problem, variable) {
  const adj = adjacency(problem);
  const neighbors = [...adj.get(variable)];
  const degree = neighbors.length;
  const neighborDegrees = neighbors.map(v => adj.get(v).size).sort((a, b) => a - b);
  return `${degree}:${neighborDegrees.join(',')}`;
}

function roleMap(problem) {
  const groups = new Map();
  for (const variable of problem.variables) {
    const sig = structuralSignature(problem, variable);
    if (!groups.has(sig)) groups.set(sig, []);
    groups.get(sig).push(variable);
  }
  for (const values of groups.values()) values.sort();
  const out = new Map();
  for (const [sig, values] of groups) values.forEach((variable, index) => out.set(variable, `${sig}#${index}`));
  return out;
}

function validPartial(problem, assignment, candidateVar = null) {
  for (const [a, b] of problem.conflicts) {
    if ((candidateVar == null || a === candidateVar || b === candidateVar) && assignment[a] !== undefined && assignment[b] !== undefined && assignment[a] === assignment[b]) return false;
  }
  return true;
}

export function verifyConflictAssignment({ problem: rawProblem, assignment } = {}) {
  const problem = normalizeProblem(rawProblem);
  if (!problem || !assignment || typeof assignment !== 'object' || Array.isArray(assignment)) return fail(['problem-and-assignment-required']);
  const expected = new Set(problem.variables);
  const keys = Object.keys(assignment);
  const exactKeys = keys.length === problem.variables.length && keys.every(key => expected.has(key));
  const labelsValid = exactKeys && problem.variables.every(v => problem.labels.includes(String(assignment[v])));
  const givensValid = Object.entries(problem.givens).every(([v, label]) => String(assignment[v]) === label);
  const conflictsValid = exactKeys && problem.conflicts.every(([a, b]) => String(assignment[a]) !== String(assignment[b]));
  return envelope({ ok: true, status: 'OMEGA_CONFLICT_ASSIGNMENT_VERIFIED', version: OMEGA_STRUCTURAL_TRANSFER_CANARY_VERSION, valid: Boolean(exactKeys && labelsValid && givensValid && conflictsValid), checks: { exactKeys, labelsValid, givensValid, conflictsValid } });
}

function solve(problem, orderPolicy) {
  const adj = adjacency(problem);
  const assignment = { ...problem.givens };
  const metrics = { branches: 0, candidateAssignments: 0 };
  const unassigned = () => problem.variables.filter(v => assignment[v] === undefined);
  const choose = vars => {
    if (orderPolicy === 'HIGH_DEGREE_FIRST') return [...vars].sort((a, b) => adj.get(b).size - adj.get(a).size || a.localeCompare(b))[0];
    if (orderPolicy === 'LOW_DEGREE_FIRST') return [...vars].sort((a, b) => adj.get(a).size - adj.get(b).size || a.localeCompare(b))[0];
    return [...vars].sort()[0];
  };
  const visit = () => {
    metrics.branches += 1;
    const remaining = unassigned();
    if (!remaining.length) return verifyConflictAssignment({ problem, assignment }).valid ? { ...assignment } : null;
    const variable = choose(remaining);
    for (const label of problem.labels) {
      metrics.candidateAssignments += 1;
      assignment[variable] = label;
      if (validPartial(problem, assignment, variable)) {
        const found = visit();
        if (found) return found;
      }
      delete assignment[variable];
    }
    return null;
  };
  const result = visit();
  return { assignment: result, metrics, verified: result ? verifyConflictAssignment({ problem, assignment: result }).valid : false };
}

export function learnStructuralOrderingCrystal({ sourceProblems = [] } = {}) {
  if (!Array.isArray(sourceProblems) || sourceProblems.length < 2 || sourceProblems.length > 64) return fail(['two-or-more-source-problems-required']);
  const problems = sourceProblems.map(normalizeProblem);
  if (problems.some(p => !p)) return fail(['invalid-source-problem']);
  const policies = ['LEXICAL', 'HIGH_DEGREE_FIRST', 'LOW_DEGREE_FIRST'];
  const totals = Object.fromEntries(policies.map(policy => [policy, 0]));
  for (const problem of problems) {
    for (const policy of policies) {
      const run = solve(problem, policy);
      if (!run.verified) return fail(['source-problem-unsolved']);
      totals[policy] += run.metrics.branches + run.metrics.candidateAssignments;
    }
  }
  const selectedPolicy = [...policies].sort((a, b) => totals[a] - totals[b] || a.localeCompare(b))[0];
  const sourceDomains = [...new Set(problems.map(p => p.domain))].sort();
  const trainingProblemHashes = problems.map(problem => digest({ variables: problem.variables, labels: problem.labels, conflicts: problem.conflicts, givens: problem.givens })).sort();
  const core = { mechanismClass: 'CONFLICT_GRAPH_VARIABLE_ORDERING', selectedPolicy, sourceDomains, trainingProblemHashes };
  return envelope({
    ok: true,
    status: 'OMEGA_STRUCTURAL_ORDERING_CRYSTALLIZED',
    version: OMEGA_STRUCTURAL_TRANSFER_CANARY_VERSION,
    crystal: { ...core, crystalHash: digest(core), containsTargetProblems: false, containsAnswers: false, promotionAuthority: 'NONE' },
    sourceEvidence: { totals },
    truthBoundary: 'This canary learns only among three declared variable-order policies on bounded conflict CSPs. It does not establish general semantic transfer.'
  });
}

export function evaluateStructuralTransfer({ crystal, targetProblems = [] } = {}) {
  if (!crystal?.crystalHash || crystal.mechanismClass !== 'CONFLICT_GRAPH_VARIABLE_ORDERING') return fail(['structural-crystal-required']);
  if (!Array.isArray(targetProblems) || !targetProblems.length || targetProblems.length > 128) return fail(['target-problems-required']);
  const problems = targetProblems.map(normalizeProblem);
  if (problems.some(p => !p)) return fail(['invalid-target-problem']);
  const targetHash = digest(problems.map(p => ({ domain: p.domain, variables: p.variables, labels: p.labels, conflicts: p.conflicts, givens: p.givens })));
  if (crystal.trainingProblemHashes?.includes(targetHash)) return fail(['target-leakage-detected']);
  const rows = [];
  for (const problem of problems) {
    const cold = solve(problem, 'LEXICAL');
    const transferred = solve(problem, crystal.selectedPolicy);
    if (!cold.verified || !transferred.verified) return fail(['target-solve-or-verification-failed']);
    const coldWork = cold.metrics.branches + cold.metrics.candidateAssignments;
    const transferredWork = transferred.metrics.branches + transferred.metrics.candidateAssignments;
    rows.push({ problemId: problem.id, domain: problem.domain, coldWork, transferredWork, reduction: coldWork - transferredWork, reductionFraction: coldWork > 0 ? (coldWork - transferredWork) / coldWork : 0 });
  }
  const coldWork = rows.reduce((sum, row) => sum + row.coldWork, 0);
  const transferredWork = rows.reduce((sum, row) => sum + row.transferredWork, 0);
  const sourceDomains = new Set(crystal.sourceDomains || []);
  const targetDomains = [...new Set(problems.map(p => p.domain))];
  const domainNovel = targetDomains.every(domain => !sourceDomains.has(domain));
  return envelope({
    ok: true,
    status: 'OMEGA_STRUCTURAL_TRANSFER_EVALUATED',
    version: OMEGA_STRUCTURAL_TRANSFER_CANARY_VERSION,
    receipt: {
      crystalHash: crystal.crystalHash,
      targetHoldoutHash: targetHash,
      targetDomains,
      domainNovel,
      selectedPolicy: crystal.selectedPolicy,
      rows,
      coldWork,
      transferredWork,
      verifiedWorkReduction: coldWork - transferredWork,
      verifiedReductionFraction: coldWork > 0 ? (coldWork - transferredWork) / coldWork : 0,
      passedNarrowTransferCanary: domainNovel && transferredWork < coldWork
    },
    truthBoundary: 'A pass is evidence only for structural policy transport across differently named domains sharing the same conflict-CSP algebra. It is not broad cross-domain intelligence, natural-language semantic transfer, ASI, or singularity evidence.'
  });
}

export function describeStructuralRoles({ problem: rawProblem } = {}) {
  const problem = normalizeProblem(rawProblem);
  if (!problem) return fail(['invalid-problem']);
  const roles = roleMap(problem);
  return envelope({ ok: true, status: 'OMEGA_STRUCTURAL_ROLES_DESCRIBED', version: OMEGA_STRUCTURAL_TRANSFER_CANARY_VERSION, roles: Object.fromEntries([...roles.entries()].sort()), roleHash: digest([...roles.entries()].sort()) });
}
