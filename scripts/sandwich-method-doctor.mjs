#!/usr/bin/env node
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSandwichFoldMission } from '../src/sandwich-method.mjs';
import { compileEvidenceBoundSandwich } from '../src/sandwich-evidence-binding.mjs';
import { compileSandwichAgentTask } from '../src/sandwich-agent-task.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let head = null;
try {
  const candidate = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim().toLowerCase();
  if (/^[0-9a-f]{40}$/.test(candidate)) head = candidate;
} catch {}

const target = {
  targetId: 'synthetic-sandwich-doctor',
  targetRevision: 'r1',
  statement: 'Synthetic descendant target for deterministic Sandwich Method health checking only.',
  authority: 'CANONICAL_REPOSITORY',
  invariants: ['capability never creates authority', 'simulation is not external proof'],
  nodes: [
    { id: 'truth', label: 'Synthetic verified prerequisite', state: 'VERIFIED_CURRENT', foldClass: 'INTERNAL_SOURCE', requires: [], evidenceRefs: ['evidence:synthetic-doctor-truth'], executionRequirementIds: ['synthetic-truth'], leverage: 2, effort: 1, uncertainty: 0 },
    { id: 'memory', label: 'Synthetic reusable memory fold', state: 'MISSING', foldClass: 'INTERNAL_SOURCE', requires: ['truth'], evidenceRefs: [], executionRequirementIds: ['synthetic-memory'], leverage: 6, effort: 1, uncertainty: 0.2 },
    { id: 'physical', label: 'Synthetic physical proof', state: 'MISSING', foldClass: 'OWNED_PHYSICAL_HOST', requires: ['memory'], evidenceRefs: [], executionRequirementIds: ['synthetic-physical'], leverage: 10, effort: 4, uncertainty: 0.3 }
  ]
};
const evidenceRegistry = head ? [{
  id: 'evidence:synthetic-doctor-truth',
  kind: 'SOURCE_TEST',
  observedAt: '2026-09-10T00:00:00Z',
  evidenceDigest: crypto.createHash('sha256').update(`sandwich-doctor:${head}`).digest('hex'),
  sourceCommit: head,
  independentlyVerified: true,
  revoked: false
}] : [];

const evidenceBound = head ? compileEvidenceBoundSandwich({ currentSourceCommit: head, target, evidenceRegistry }) : null;
const sandwich = evidenceBound?.sandwich || null;
const mission = sandwich?.status === 'SANDWICH_FOLD_READY' ? buildSandwichFoldMission({ sandwich }) : null;
const agentTask = mission?.ok ? compileSandwichAgentTask({ evidenceBoundSandwich: evidenceBound, foldMission: mission, date: new Date('2026-09-10T00:00:00Z') }) : null;
const ok = Boolean(head && evidenceBound?.ok && sandwich?.ok && mission?.ok && agentTask?.ok && sandwich.nextFold?.id === 'memory'
  && sandwich.businessEffectAuthority === 'NONE' && sandwich.externalEffectAuthority === 'NONE');

const report = {
  ok,
  status: ok ? 'SANDWICH_METHOD_DOCTOR_HEALTHY' : 'SANDWICH_METHOD_DOCTOR_REFUSED',
  sourceCommit: head,
  evidenceBindingHealthy: evidenceBound?.ok === true,
  agentTaskBridgeHealthy: agentTask?.ok === true,
  selectedSyntheticFold: sandwich?.nextFold?.id || null,
  unresolvedSyntheticDependencies: sandwich?.filling?.unresolvedDependencies || [],
  progressLaw: sandwich?.progressLaw || null,
  foldingLaw: sandwich?.foldingLaw || null,
  businessEffectAuthority: 'NONE',
  externalEffectAuthority: 'NONE',
  truthBoundary: 'SYNTHETIC_DOCTOR_PROVES_EXACT_HEAD_SOURCE_COMPOSITION_EVIDENCE_BINDING_AND_LOCAL_TASK_COMPILATION_ONLY__NOT_GLOBAL_COMPLETENESS_RUNTIME_PHYSICAL_COMMERCIAL_LIFE_OUTCOME_OR_ASI_EVIDENCE'
};

console.log(JSON.stringify(report, null, 2));
if (!ok) process.exitCode = 2;
