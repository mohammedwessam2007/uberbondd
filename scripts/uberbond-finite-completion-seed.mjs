#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { compileAgentTask } from '../src/agent-relay.mjs';
import { TASK_LABEL, buildTaskIssueBody, parseTaskIssueBody } from '../src/github-relay.mjs';
import { ZERO_EXTERNAL_EFFECTS } from '../src/effect-ledgers.mjs';

export const UBERBOND_FINITE_COMPLETION_SEED_VERSION = 'uberbond.finite-completion-seed.v1';

const TERMINAL_PATH = 'artifacts/sovereign/terminal-realization.json';
const GRAPH_PATH = 'artifacts/sovereign/canonical-execution-leaf-graph.json';
const CANONICAL_GRAPH_STATUS = 'ZERO_ORPHAN_CANONICAL_EXECUTION_LEAF_GRAPH_COMPILED';
const CANONICAL_TRIBUNAL_STATUS = 'FINITE_REALIZATION_TRIBUNAL_PASSED_WITH_SEPARATE_REALITY_BOUNDARIES';
const CANONICAL_FINITE_CLOSED = '100_PERCENT_OF_DECLARED_FINITE_ENGINEERING_SCOPE';
const MAX_FILE_BYTES = 2_000_000;
const MAX_GITHUB_BYTES = 2_000_000;
const EXACT_SHA = /^[a-f0-9]{40}$/i;

const zeroEffects = () => structuredClone(ZERO_EXTERNAL_EFFECTS);
const text = (value, max = 1000) => String(value ?? '').trim().slice(0, max);
const uniq = values => [...new Set((Array.isArray(values) ? values : []).map(value => text(value, 500)).filter(Boolean))].sort();

function fail(reasonCodes, status = 'FINITE_COMPLETION_SEED_REFUSED', extra = {}) {
  return {
    ok: false,
    policyVersion: UBERBOND_FINITE_COMPLETION_SEED_VERSION,
    status,
    reasonCodes: uniq(reasonCodes),
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects(),
    ...extra
  };
}
function exactSha(value) {
  const candidate = text(value, 80).toLowerCase();
  return EXACT_SHA.test(candidate) ? candidate : null;
}
function parseRepository(value) {
  const match = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(text(value, 300));
  return match ? { owner: match[1], repo: match[2], fullName: `${match[1]}/${match[2]}` } : null;
}
function safePath(root, relativePath) {
  const base = path.resolve(root);
  const resolved = path.resolve(base, relativePath);
  if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) throw new Error('finite-completion-path-escaped-root');
  return resolved;
}
async function readJson(root, relativePath) {
  try {
    const raw = await fs.readFile(safePath(root, relativePath), 'utf8');
    if (Buffer.byteLength(raw, 'utf8') > MAX_FILE_BYTES) return { state: 'TOO_LARGE', data: null };
    const data = JSON.parse(raw);
    return data && typeof data === 'object' && !Array.isArray(data)
      ? { state: 'AVAILABLE', data }
      : { state: 'INVALID', data: null };
  } catch (error) {
    return { state: error?.code === 'ENOENT' ? 'UNAVAILABLE' : 'INVALID', data: null };
  }
}
function graphCleanForBase(graph, baseRevision) {
  const counts = graph?.counts && typeof graph.counts === 'object' && !Array.isArray(graph.counts) ? graph.counts : {};
  return graph?.ok === true
    && graph?.status === CANONICAL_GRAPH_STATUS
    && String(graph?.sourceCommit || '').toLowerCase() === baseRevision
    && Number(counts.orphanRequirements) === 0
    && Number(counts.floatingLeaves) === 0
    && Number(counts.dependencyCycles) === 0
    && Number(counts.leaves) > 0;
}

export function compileFiniteCompletionDirective({ baseRevision, terminalRealization = null, executionGraph = null } = {}) {
  const base = exactSha(baseRevision);
  if (!base) return fail(['exact-main-base-revision-required'], 'FINITE_COMPLETION_DIRECTIVE_REFUSED');

  const terminal = terminalRealization && typeof terminalRealization === 'object' && !Array.isArray(terminalRealization)
    ? terminalRealization
    : null;
  const graph = executionGraph && typeof executionGraph === 'object' && !Array.isArray(executionGraph)
    ? executionGraph
    : null;
  const terminalSource = String(terminal?.sourceCommit || terminal?.headSha || '').toLowerCase();
  const openRequirements = uniq(terminal?.finiteOpenRequirements);
  const separated = terminal?.separatedStatus && typeof terminal.separatedStatus === 'object' && !Array.isArray(terminal.separatedStatus)
    ? terminal.separatedStatus
    : {};

  const finiteClosed = terminal?.ok === true
    && terminal?.status === CANONICAL_TRIBUNAL_STATUS
    && terminalSource === base
    && separated.FINITE_ENGINEERING_CLOSURE === CANONICAL_FINITE_CLOSED
    && openRequirements.length === 0
    && graphCleanForBase(graph, base);

  if (finiteClosed) {
    return {
      ok: true,
      policyVersion: UBERBOND_FINITE_COMPLETION_SEED_VERSION,
      status: 'FINITE_ENGINEERING_ALREADY_CLOSED',
      baseRevision: base,
      targetRequirementId: null,
      taskRequired: false,
      finiteOpenRequirementCount: 0,
      businessEffectAuthority: 'NONE',
      externalEffectAuthority: 'NONE',
      externalEffectLedger: zeroEffects(),
      truthBoundary: 'DECLARED FINITE ENGINEERING IS CLOSED ONLY BECAUSE THE EXACT-BASE TERMINAL TRIBUNAL AND ZERO-ORPHAN GRAPH SAY SO. RUNTIME COMMERCIAL PERSONAL AND ASI EVIDENCE REMAIN SEPARATE.'
    };
  }

  if (terminalSource === base && openRequirements.length > 0) {
    return {
      ok: true,
      policyVersion: UBERBOND_FINITE_COMPLETION_SEED_VERSION,
      status: 'FINITE_REQUIREMENT_TARGET_READY',
      baseRevision: base,
      targetRequirementId: openRequirements[0],
      finiteOpenRequirementCount: openRequirements.length,
      taskRequired: true,
      repairMode: 'FINITE_REQUIREMENT',
      terminalReasonCodes: uniq(terminal?.reasonCodes).slice(0, 24),
      businessEffectAuthority: 'NONE',
      externalEffectAuthority: 'NONE',
      externalEffectLedger: zeroEffects()
    };
  }

  const reasonCodes = uniq(terminal?.reasonCodes).slice(0, 24);
  return {
    ok: true,
    policyVersion: UBERBOND_FINITE_COMPLETION_SEED_VERSION,
    status: 'EXACT_CURRENT_TERMINAL_REPAIR_REQUIRED',
    baseRevision: base,
    targetRequirementId: null,
    finiteOpenRequirementCount: openRequirements.length,
    taskRequired: true,
    repairMode: 'TERMINAL_TRUTH_REGENERATION',
    terminalReasonCodes: reasonCodes,
    graphCurrentAndClean: graphCleanForBase(graph, base),
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects(),
    truthBoundary: 'WHEN EXACT-BASE TERMINAL CLOSURE IS NOT PROVEN, THE NEXT TASK REPAIRS THE TRUTH OR CLOSURE PIPELINE BEFORE ANY UNRELATED IMPROVEMENT IS ADMITTED.'
  };
}

export function compileFiniteCompletionTask({ directive, date = new Date() } = {}) {
  if (!directive?.ok || directive?.taskRequired !== true || !exactSha(directive?.baseRevision)) {
    return fail(['task-requires-open-finite-completion-directive'], 'FINITE_COMPLETION_TASK_REFUSED');
  }
  const base = directive.baseRevision;
  const taskId = `uberbond_self_maintain_${base.slice(0, 24)}`;
  const target = text(directive.targetRequirementId, 240);
  const reasonSummary = uniq(directive.terminalReasonCodes).slice(0, 12).join(', ') || 'none-observed';
  const objective = directive.repairMode === 'FINITE_REQUIREMENT'
    ? `On exact UberBond main ${base}, close the single canonical finite engineering requirement ${target}. This is FINITE COMPLETION MODE, not general improvement. Find the smallest source/proof change that makes this exact requirement VERIFIED_CURRENT or ENFORCED_BY_CODE under the canonical semantic and terminal tribunals. Do not optimize unrelated organs, invent features, broaden scope, or work on external/runtime/elapsed/open-ended requirements. Return one bounded canonical AgentCodeChangeSet in result.codeChangeSet. If the requirement is already closed on this exact base, prove that and return STOP rather than manufacturing work.`
    : `On exact UberBond main ${base}, repair the smallest internally-solvable source/proof blocker preventing the exact-current terminal realization tribunal from producing a truthful finite-engineering verdict. This is FINITE COMPLETION MODE, not general improvement. Current terminal reason codes: ${reasonSummary}. Prefer repairing exact-current truth regeneration, semantic classification, graph integrity, reachability, evidence binding, or tribunal composition over unrelated product work. Return one bounded canonical AgentCodeChangeSet in result.codeChangeSet. If no safe source change is justified, return STOP.`;

  const compiled = compileAgentTask({
    taskId,
    objective,
    originAgent: 'uberbond-finite-completion-controller',
    targetAgent: 'claude-code',
    parentTask: `main:${base}`,
    contextRefs: [
      `main:${base}`,
      `completion-mode:${directive.repairMode}`,
      ...(target ? [`finite-requirement:${target}`] : []),
      'artifact:terminal-realization',
      'artifact:canonical-execution-leaf-graph'
    ],
    evidenceRefs: [
      `evidence:exact-main-${base}`,
      'audit:terminal-realization',
      'audit:canonical-execution-leaf-graph',
      'doc:UBERBOND_TOTAL_BRAIN'
    ],
    constraints: [
      `exact-base-revision:${base}`,
      'finite-completion-mode',
      `finite-completion-target:${target || 'terminal-truth-regeneration'}`,
      'one-bounded-change-set',
      'local-preparation-only',
      'business-effect-authority:none',
      'do-not-improve-unrelated-features',
      'do-not-convert-external-elapsed-or-open-frontier-work-into-finite-engineering',
      'preserve no-amputation law and all stronger current behavior'
    ],
    forbiddenActions: [
      'merge', 'deploy', 'send', 'spend', 'purchase', 'change-credentials', 'change-dns',
      'mutate-production', 'customer-contact', 'payment-action', 'weaken-tests', 'weaken-authority',
      'edit-sovereignty-paths', 'edit-build-protected-paths'
    ],
    requiredOutputs: [
      'outcome', 'changedArtifacts', 'testsActuallyRun', 'truthTable',
      'externalEffectLedger', 'decision', 'codeChangeSet', 'completionRequirementAddressed'
    ],
    acceptanceTests: ['npm run check:syntax', 'npm run test:deterministic'],
    budget: { maxTokens: 120_000, maxCostCents: 0 },
    economicObjective: 'close declared finite engineering scope with minimum founder attention while preserving truth and authority boundaries',
    consequenceClass: 'LOCAL_PREPARATION',
    date
  });
  if (!compiled?.ok) return fail(compiled?.reasonCodes || ['canonical-agent-task-compilation-failed'], 'FINITE_COMPLETION_TASK_REFUSED');
  return compiled.task || compiled;
}

async function boundedJson(response) {
  const raw = await response.text();
  if (Buffer.byteLength(raw, 'utf8') > MAX_GITHUB_BYTES) throw new Error('github-response-too-large');
  const payload = raw ? JSON.parse(raw) : null;
  if (!response.ok) throw new Error(`github-http-${response.status}`);
  return payload;
}
async function github(pathname, { token, method = 'GET', body, fetchImpl = globalThis.fetch } = {}) {
  const response = await fetchImpl(`https://api.github.com${pathname}`, {
    method,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
      'user-agent': 'UberBond-Finite-Completion-Seed',
      ...(body === undefined ? {} : { 'content-type': 'application/json' })
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30_000)
  });
  return boundedJson(response);
}
function completionMarker(task, directive) {
  return `finite-completion-target:${directive.targetRequirementId || 'terminal-truth-regeneration'}`;
}
function taskMatchesCompletion(issue, directive, baseRevision) {
  if (issue?.pull_request) return false;
  const task = parseTaskIssueBody(issue?.body);
  if (!task || task.taskId !== `uberbond_self_maintain_${baseRevision.slice(0, 24)}`) return false;
  return Array.isArray(task.constraints) && task.constraints.includes('finite-completion-mode') && task.constraints.includes(completionMarker(task, directive));
}
function writeOutput(name, value) {
  const target = process.env.GITHUB_OUTPUT;
  if (!target) return;
  return fs.appendFile(target, `${name}=${String(value).replaceAll('\n', ' ')}\n`, 'utf8');
}

export async function runFiniteCompletionSeed({ env = process.env, repoRoot = process.cwd(), fetchImpl = globalThis.fetch, date = new Date() } = {}) {
  const repository = parseRepository(env.GITHUB_REPOSITORY);
  const token = String(env.GITHUB_TOKEN || '');
  const baseRevision = exactSha(env.GITHUB_SHA);
  const reasons = [];
  if (String(env.GITHUB_ACTIONS || '').toLowerCase() !== 'true') reasons.push('github-actions-runtime-required');
  if (!repository) reasons.push('github-repository-required');
  if (!token) reasons.push('scoped-github-token-required');
  if (!baseRevision) reasons.push('exact-main-base-revision-required');
  if (typeof fetchImpl !== 'function') reasons.push('fetch-implementation-required');
  if (reasons.length) return fail(reasons, 'FINITE_COMPLETION_RUNTIME_REFUSED');

  const [terminalRead, graphRead] = await Promise.all([
    readJson(repoRoot, TERMINAL_PATH),
    readJson(repoRoot, GRAPH_PATH)
  ]);
  const directive = compileFiniteCompletionDirective({
    baseRevision,
    terminalRealization: terminalRead.data,
    executionGraph: graphRead.data
  });
  if (!directive.ok) return directive;

  if (!directive.taskRequired) {
    await writeOutput('closed', 'true');
    await writeOutput('issue_number', '');
    return {
      ...directive,
      terminalEvidenceState: terminalRead.state,
      graphEvidenceState: graphRead.state,
      repositoryIssueEffects: 0
    };
  }

  const task = compileFiniteCompletionTask({ directive, date });
  if (!task?.taskId) return task;
  const query = new URLSearchParams({ state: 'all', labels: TASK_LABEL, per_page: '50' });
  const issues = await github(`/repos/${repository.owner}/${repository.repo}/issues?${query}`, { token, fetchImpl });
  if (!Array.isArray(issues)) return fail(['github-issue-list-invalid'], 'FINITE_COMPLETION_RELAY_REFUSED');
  const existing = issues.filter(issue => taskMatchesCompletion(issue, directive, baseRevision)).sort((a, b) => Number(b.number || 0) - Number(a.number || 0))[0];
  if (existing) {
    await writeOutput('closed', 'false');
    await writeOutput('issue_number', Number(existing.number));
    return {
      ok: true,
      policyVersion: UBERBOND_FINITE_COMPLETION_SEED_VERSION,
      status: 'FINITE_COMPLETION_TASK_ALREADY_QUEUED',
      baseRevision,
      issueNumber: Number(existing.number),
      taskId: task.taskId,
      directive,
      repositoryIssueEffects: 0,
      businessEffectAuthority: 'NONE',
      externalEffectAuthority: 'NONE',
      externalEffectLedger: zeroEffects()
    };
  }

  const titleTarget = directive.targetRequirementId || 'exact-current-terminal-proof';
  const created = await github(`/repos/${repository.owner}/${repository.repo}/issues`, {
    token,
    method: 'POST',
    fetchImpl,
    body: {
      title: `UberBond finite completion: ${text(titleTarget, 120)}`,
      body: buildTaskIssueBody(task),
      labels: [TASK_LABEL]
    }
  });
  const issueNumber = Number(created?.number || 0);
  if (!Number.isSafeInteger(issueNumber) || issueNumber <= 0) return fail(['github-created-issue-number-required'], 'FINITE_COMPLETION_RELAY_REFUSED');
  await writeOutput('closed', 'false');
  await writeOutput('issue_number', issueNumber);
  return {
    ok: true,
    policyVersion: UBERBOND_FINITE_COMPLETION_SEED_VERSION,
    status: 'FINITE_COMPLETION_TASK_QUEUED',
    baseRevision,
    issueNumber,
    taskId: task.taskId,
    directive,
    repositoryIssueEffects: 1,
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects(),
    truthBoundary: 'CREATING A BOUNDED ENGINEERING TASK ISSUE IS NOT COMPLETION, MERGE, DEPLOYMENT, PAYMENT, CUSTOMER OUTCOME OR ASI EVIDENCE.'
  };
}

const direct = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (direct) {
  try {
    const result = await runFiniteCompletionSeed();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result?.ok) process.exitCode = 2;
  } catch (error) {
    process.stdout.write(`${JSON.stringify(fail(['finite-completion-seed-threw'], 'FINITE_COMPLETION_RUNTIME_REFUSED', { detail: text(error?.message, 500) }), null, 2)}\n`);
    process.exitCode = 2;
  }
}
