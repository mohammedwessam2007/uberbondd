#!/usr/bin/env node
import { lstat, readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileSandwichMethod, buildSandwichFoldMission, buildCanonicalLeafHandoff } from '../src/sandwich-method.mjs';
import { compileEvidenceBoundSandwich } from '../src/sandwich-evidence-binding.mjs';
import { compileSandwichAgentTask } from '../src/sandwich-agent-task.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MAX_JSON_BYTES = 4_000_000;
const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const arg = process.argv[i];
  if (!arg.startsWith('--')) continue;
  const next = process.argv[i + 1];
  args.set(arg, next && !next.startsWith('--') ? process.argv[++i] : true);
}

function fail(reasonCodes, extra = {}) {
  return {
    ok: false,
    status: 'SANDWICH_METHOD_PLAN_REFUSED',
    reasonCodes: [...new Set(reasonCodes)],
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    ...extra
  };
}

function insideRoot(path) {
  const rel = relative(root, path);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

async function readBoundedJson(path) {
  try {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > MAX_JSON_BYTES) return null;
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

function exactHead() {
  try {
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim().toLowerCase();
    return /^[0-9a-f]{40}$/.test(sha) ? sha : null;
  } catch {
    return null;
  }
}

const targetArg = args.get('--target');
if (typeof targetArg !== 'string') {
  const out = fail(['target-json-path-required']);
  console.log(JSON.stringify(out, null, 2));
  process.exit(2);
}

const targetPath = resolve(root, targetArg);
const target = await readBoundedJson(targetPath);
const head = exactHead();
if (!target || typeof target !== 'object' || Array.isArray(target) || !head) {
  const out = fail([!target || typeof target !== 'object' || Array.isArray(target) ? 'bounded-regular-target-json-object-required' : null, !head ? 'exact-git-head-required' : null].filter(Boolean));
  console.log(JSON.stringify(out, null, 2));
  process.exit(2);
}

const privateTarget = target.authority === 'FOUNDER_AUTHORIZED_PRIVATE';
const authoritativeTarget = target.authority === 'CANONICAL_REPOSITORY' || privateTarget;
const outputArg = args.get('--output');
const outputPath = typeof outputArg === 'string' ? resolve(root, outputArg) : null;
if (privateTarget && insideRoot(targetPath)) {
  const out = fail(['founder-private-target-may-not-be-read-from-repository-path']);
  console.log(JSON.stringify(out, null, 2));
  process.exit(2);
}
if (privateTarget && (!outputPath || insideRoot(outputPath))) {
  const out = fail(['founder-private-plan-requires-explicit-output-outside-repository']);
  console.log(JSON.stringify(out, null, 2));
  process.exit(2);
}

const evidenceArg = args.get('--evidence');
if (authoritativeTarget && typeof evidenceArg !== 'string') {
  const out = fail(['authoritative-target-requires-independent-evidence-registry']);
  console.log(JSON.stringify(out, null, 2));
  process.exit(2);
}
let evidenceRegistry = null;
let evidencePath = null;
if (typeof evidenceArg === 'string') {
  evidencePath = resolve(root, evidenceArg);
  evidenceRegistry = await readBoundedJson(evidencePath);
  if (!Array.isArray(evidenceRegistry)) {
    const out = fail(['bounded-regular-evidence-registry-array-required']);
    console.log(JSON.stringify(out, null, 2));
    process.exit(2);
  }
  if (privateTarget && insideRoot(evidencePath)) {
    const out = fail(['founder-private-evidence-registry-may-not-be-read-from-repository-path']);
    console.log(JSON.stringify(out, null, 2));
    process.exit(2);
  }
}

const sandwich = compileSandwichMethod({ currentSourceCommit: head, target });
const evidenceBound = authoritativeTarget && sandwich.ok
  ? compileEvidenceBoundSandwich({ currentSourceCommit: head, target, evidenceRegistry })
  : null;
const executionSandwich = evidenceBound?.ok ? evidenceBound.sandwich : null;
const mission = executionSandwich?.status === 'SANDWICH_FOLD_READY' ? buildSandwichFoldMission({ sandwich: executionSandwich }) : null;
const agentTask = mission?.ok ? compileSandwichAgentTask({ evidenceBoundSandwich: evidenceBound, foldMission: mission }) : null;
let handoff = null;
const graphArg = args.get('--graph');
if (typeof graphArg === 'string' && mission?.ok) {
  const graph = await readBoundedJson(resolve(root, graphArg));
  handoff = graph && typeof graph === 'object' && !Array.isArray(graph)
    ? buildCanonicalLeafHandoff({ sandwich: executionSandwich, executionGraph: graph })
    : fail(['bounded-regular-execution-graph-required']);
}

const executionReady = !authoritativeTarget || evidenceBound?.ok === true;
const fullReport = {
  ok: sandwich.ok && executionReady && (!agentTask || agentTask.ok),
  status: !sandwich.ok ? sandwich.status
    : authoritativeTarget && !evidenceBound?.ok ? evidenceBound?.status || 'SANDWICH_EVIDENCE_BINDING_REFUSED'
      : sandwich.status,
  generatedAt: new Date().toISOString(),
  sourceCommit: head,
  sandwich,
  evidenceBinding: evidenceBound,
  mission,
  agentTask,
  canonicalLeafHandoff: handoff,
  businessEffectAuthority: 'NONE',
  externalEffectAuthority: 'NONE',
  truthBoundary: authoritativeTarget
    ? 'AUTHORITATIVE_FOLD_TASKS_REQUIRE_INDEPENDENT_EVIDENCE_BINDING__AGENT_TASK_IS_LOCAL_PREPARATION_ONLY__EXISTING_EXECUTION_CONTINUATION_VERIFIER_PROMOTION_AND_REALITY_GATES_RETAIN_AUTHORITY'
    : 'HYPOTHETICAL_TARGET_IS_SEARCH_SPACE_ONLY_AND_CANNOT_COMPILE_AN_AUTHORING_TASK'
};

if (outputPath) {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(fullReport, null, 2)}\n`, { encoding: 'utf8', mode: privateTarget ? 0o600 : 0o644 });
}

const stdoutReport = privateTarget ? {
  ok: fullReport.ok,
  status: fullReport.status,
  generatedAt: fullReport.generatedAt,
  sourceCommit: head,
  privateTarget: true,
  fullPlanWrittenToPrivatePath: true,
  evidenceBound: evidenceBound?.ok === true,
  nextFoldPresent: Boolean(executionSandwich?.nextFold),
  agentTaskReady: agentTask?.ok === true,
  canonicalLeafHandoffStatus: handoff?.status || null,
  businessEffectAuthority: 'NONE',
  externalEffectAuthority: 'NONE',
  privacyBoundary: 'FOUNDER_PRIVATE_TARGET_CONTENT_EVIDENCE_CONTENT_FOLD_LABELS_AND_AGENT_TASK_OBJECTIVE_ARE_NOT_EMITTED_TO_STDOUT'
} : fullReport;

console.log(JSON.stringify(stdoutReport, null, 2));
if (!fullReport.ok || (handoff && !handoff.ok)) process.exitCode = 2;
