#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createModelExecutorFactory, describeProviderReadiness } from '../src/agent-model-executor-factory.mjs';
import { applyAgentCodeChangeSet } from '../src/agent-code-change-applier.mjs';
import { createLinuxSelfMaintainerSandboxHost } from '../src/linux-self-maintainer-sandbox.mjs';
import { runUberBondSelfMaintenance } from '../src/uberbond-self-maintainer.mjs';
import {
  buildLocalMergeAdmissionEnvelope,
  compilePendingForgeDecision,
  FORGE_STATE_SCHEMA,
  newPendingForgeState,
  selectSovereignForgeProvider
} from '../src/sovereign-autonomy-forge.mjs';
import { admitSelfMaintainerPullRequest } from '../.github/workflows/runtime/self-maintainer-merge-governor.mjs';
import { createSelfMaintainerContextSelector } from '../.github/workflows/runtime/self-maintainer-context-selector.mjs';
import { createSelfMaintainerProposalModelWrapper } from '../.github/workflows/runtime/self-maintainer-proposal-model-wrapper.mjs';
import { buildLocalSourceContext, buildLocalSourceInventory } from '../.github/workflows/runtime/self-maintainer-source-context.mjs';
import { compileFiniteCompletionDirective, compileFiniteCompletionTask } from './uberbond-finite-completion-seed.mjs';
import { ZERO_EXTERNAL_EFFECTS } from '../src/effect-ledgers.mjs';

export const SOVEREIGN_AUTONOMY_FORGE_RUNNER_VERSION = 'uberbond.sovereign-autonomy-forge-runner.v1';

const execFileAsync = promisify(execFile);
const EXACT_SHA = /^[a-f0-9]{40}$/i;
const zeroEffects = () => structuredClone(ZERO_EXTERNAL_EFFECTS);
const text = (value, max = 1000) => String(value ?? '').trim().slice(0, max);

function fail(reasonCodes, status = 'FORGE_CYCLE_REFUSED', extra = {}) {
  return {
    ok: false,
    policyVersion: SOVEREIGN_AUTONOMY_FORGE_RUNNER_VERSION,
    status,
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects(),
    ...extra
  };
}

function nowSequence(date = new Date()) {
  const iso = date.toISOString();
  return iso.slice(0, 19).replaceAll('-', '').replaceAll(':', '').replace('T', '');
}

function safeSlug(value, max = 60) {
  return text(value, 300).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max) || 'task';
}

async function run(executable, args, { cwd, env = process.env, timeoutMs = 120_000, maxBuffer = 8_000_000, allowFailure = false } = {}) {
  try {
    const out = await execFileAsync(executable, args, { cwd, env, timeout: timeoutMs, maxBuffer, encoding: 'utf8' });
    return { ok: true, exitCode: 0, stdout: String(out.stdout || ''), stderr: String(out.stderr || '') };
  } catch (error) {
    const result = {
      ok: false,
      exitCode: typeof error?.code === 'number' ? error.code : 1,
      stdout: String(error?.stdout || ''),
      stderr: String(error?.stderr || ''),
      detail: text(error?.message, 1000)
    };
    if (allowFailure) return result;
    const wrapped = new Error(`command-failed:${executable}`);
    wrapped.result = result;
    throw wrapped;
  }
}

async function git(repoRoot, args, options = {}) {
  return run('git', args, { cwd: repoRoot, ...options });
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function readJsonMaybe(file) {
  try { return await readJson(file); }
  catch (error) { if (error?.code === 'ENOENT') return null; throw error; }
}

async function writeJsonAtomic(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.tmp.${process.pid}`;
  await fs.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await fs.rename(tmp, file);
}

async function writeTextAtomic(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.tmp.${process.pid}`;
  await fs.writeFile(tmp, value, { encoding: 'utf8', mode: 0o600 });
  await fs.rename(tmp, file);
}

async function cleanDedicatedRepo(repoRoot) {
  const marker = path.join(repoRoot, '.uberbond-sovereign-forge');
  try {
    const stat = await fs.lstat(marker);
    if (!stat.isFile() || stat.isSymbolicLink()) return fail(['dedicated-forge-marker-invalid'], 'FORGE_REPO_BLOCKED');
  } catch {
    return fail(['dedicated-forge-marker-required'], 'FORGE_REPO_BLOCKED');
  }
  const branch = text((await git(repoRoot, ['branch', '--show-current'])).stdout, 100);
  if (branch !== 'main') return fail(['dedicated-forge-repo-must-be-on-main'], 'FORGE_REPO_BLOCKED', { branch });
  const dirty = String((await git(repoRoot, ['status', '--porcelain'])).stdout || '');
  if (dirty.trim()) return fail(['dedicated-forge-repo-must-be-clean'], 'FORGE_REPO_BLOCKED');
  const head = text((await git(repoRoot, ['rev-parse', 'HEAD'])).stdout, 80).toLowerCase();
  if (!EXACT_SHA.test(head)) return fail(['exact-forge-main-sha-required'], 'FORGE_REPO_BLOCKED');
  try {
    const modules = await fs.realpath(path.join(repoRoot, 'node_modules'));
    const stat = await fs.lstat(modules);
    if (!stat.isDirectory()) return fail(['prepared-node-modules-required'], 'FORGE_REPO_BLOCKED');
  } catch {
    return fail(['prepared-node-modules-required'], 'FORGE_REPO_BLOCKED');
  }
  return { ok: true, head };
}

async function parseRuntimeState(stateFile) {
  let raw;
  try { raw = await fs.readFile(stateFile, 'utf8'); }
  catch (error) { if (error?.code === 'ENOENT') return {}; throw error; }
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=([A-Za-z0-9._:/@+,-]*)$/.exec(line.trim());
    if (match) out[match[1]] = match[2];
  }
  return out;
}

async function removeWorktree(repoRoot, worktree, branchName = null) {
  await git(repoRoot, ['worktree', 'remove', '--force', worktree], { allowFailure: true });
  if (branchName) await git(repoRoot, ['branch', '-D', branchName], { allowFailure: true });
  await fs.rm(worktree, { recursive: true, force: true }).catch(() => {});
}

async function copyPreparedDependencies(repoRoot, targetRoot) {
  const target = path.join(targetRoot, 'node_modules');
  await fs.mkdir(target, { recursive: true });
  const source = `${path.join(repoRoot, 'node_modules')}${path.sep}.`;
  let copied = await run('cp', ['-a', '--reflink=auto', source, target], { allowFailure: true, timeoutMs: 600_000 });
  if (!copied.ok) copied = await run('cp', ['-a', source, target], { allowFailure: true, timeoutMs: 600_000 });
  if (!copied.ok) return fail(['prepared-dependency-copy-failed'], 'CANDIDATE_WORKTREE_BLOCKED');
  return { ok: true };
}

async function exactFiniteDirective({ repoRoot, stateDir, baseRevision }) {
  const truthRoot = await fs.mkdtemp(path.join(stateDir, 'truth-'));
  try {
    const add = await git(repoRoot, ['worktree', 'add', '--detach', truthRoot, baseRevision], { allowFailure: true, timeoutMs: 120_000 });
    if (!add.ok) return fail(['truth-worktree-create-failed'], 'FINITE_TRUTH_BLOCKED');
    await fs.symlink(path.join(repoRoot, 'node_modules'), path.join(truthRoot, 'node_modules'), 'dir').catch(() => {});
    await run(process.execPath, ['scripts/terminal-realization.mjs'], { cwd: truthRoot, allowFailure: true, timeoutMs: 900_000, maxBuffer: 16_000_000 });
    const terminal = await readJsonMaybe(path.join(truthRoot, 'artifacts/sovereign/terminal-realization.json'));
    const graph = await readJsonMaybe(path.join(truthRoot, 'artifacts/sovereign/canonical-execution-leaf-graph.json'));
    if (!terminal || !graph) return fail(['exact-terminal-or-graph-artifact-missing'], 'FINITE_TRUTH_BLOCKED');
    return compileFiniteCompletionDirective({ baseRevision, terminalRealization: terminal, executionGraph: graph });
  } finally {
    await git(repoRoot, ['worktree', 'remove', '--force', truthRoot], { allowFailure: true });
    await fs.rm(truthRoot, { recursive: true, force: true }).catch(() => {});
  }
}

function workerFor(provider, env) {
  if (provider === 'open-model') return { provider, model: text(env.OPEN_MODEL_MODEL, 400) };
  if (provider === 'openai') return { provider, model: text(env.OPENAI_MODEL, 400) || undefined };
  if (provider === 'anthropic') return { provider, model: text(env.ANTHROPIC_MODEL, 400) || undefined };
  if (provider === 'ai-gateway') return { provider, model: text(env.AI_GATEWAY_MODEL, 400) || undefined };
  return { provider };
}

async function proposeCandidate({ repoRoot, task, env }) {
  const preferred = text(env.UBERBOND_FORGE_MODEL_PROVIDER || 'open-model', 80).toLowerCase();
  const allowFallback = String(env.UBERBOND_FORGE_ALLOW_EXTERNAL_MODEL_FALLBACK || '').toLowerCase() === 'true';
  if (preferred === 'claude-code-sandbox') return fail(['sovereign-forge-proposal-stage-does-not-run-provider-inside-write-sandbox'], 'MODEL_PROVIDER_BLOCKED');
  const readiness = describeProviderReadiness({ env });
  const selected = selectSovereignForgeProvider(readiness, { preferred, allowExternalFallback: allowFallback });
  if (!selected.ok) return { ...selected, readiness };

  let executor;
  try { executor = createModelExecutorFactory({ env })(workerFor(selected.provider, env)); }
  catch (error) { return fail(['forge-model-executor-factory-refused'], 'MODEL_PROVIDER_BLOCKED', { detail: text(error?.message, 500), provider: selected.provider }); }

  const inventory = await buildLocalSourceInventory({ repoRoot, expectedSha: task.parentTask.slice(5) });
  if (!inventory?.ok) return fail(['forge-source-inventory-failed', ...(inventory?.reasonCodes || [])], 'SOURCE_CONTEXT_BLOCKED');
  const selector = createSelfMaintainerContextSelector({ modelExecutor: executor });
  const selection = await selector({
    task,
    sourceInventory: inventory.paths,
    model: workerFor(selected.provider, env).model,
    maxTokens: 6000,
    costCeilingCents: 0,
    idempotencyKey: `sovereign-forge-context:${task.taskId}`
  });
  if (!selection?.ok) return fail(['forge-context-selection-failed', ...(selection?.reasonCodes || [])], selection?.outcome === 'UNCERTAIN' ? 'MODEL_OUTCOME_UNCERTAIN' : 'SOURCE_CONTEXT_BLOCKED', { provider: selected.provider });

  const sourceContext = await buildLocalSourceContext({
    repoRoot,
    expectedSha: task.parentTask.slice(5),
    inventory,
    selectedPaths: selection.contextPaths
  });
  if (!sourceContext?.ok) return fail(['forge-source-context-failed', ...(sourceContext?.reasonCodes || [])], 'SOURCE_CONTEXT_BLOCKED');

  const proposal = await createSelfMaintainerProposalModelWrapper({ modelExecutor: executor })({
    task,
    sourceInventory: inventory,
    sourceContext,
    model: workerFor(selected.provider, env).model,
    maxTokens: Number(task?.budget?.maxTokens || 120_000),
    costCeilingCents: Number(task?.budget?.maxCostCents || 0),
    idempotencyKey: `sovereign-forge-proposal:${task.taskId}`
  });
  if (!proposal?.ok) return fail(['forge-proposal-failed', ...(proposal?.reasonCodes || [])], proposal?.outcome === 'UNCERTAIN' ? 'MODEL_OUTCOME_UNCERTAIN' : 'PROPOSAL_BLOCKED', { provider: selected.provider });
  if (String(proposal?.result?.decision || '').toUpperCase() === 'STOP' || !proposal?.result?.codeChangeSet) {
    return {
      ok: true,
      policyVersion: SOVEREIGN_AUTONOMY_FORGE_RUNNER_VERSION,
      status: 'NO_SAFE_SOURCE_CHANGE_PROPOSED',
      provider: selected.provider,
      sourceInventoryDigest: inventory.inventoryDigest,
      sourceContextDigest: sourceContext.sourceContextDigest,
      businessEffectAuthority: 'NONE',
      externalEffectAuthority: 'NONE',
      externalEffectLedger: zeroEffects()
    };
  }
  return {
    ok: true,
    policyVersion: SOVEREIGN_AUTONOMY_FORGE_RUNNER_VERSION,
    status: 'CANONICAL_CANDIDATE_PROPOSED',
    provider: selected.provider,
    candidate: proposal.result.codeChangeSet,
    sourceInventoryDigest: inventory.inventoryDigest,
    sourceContextDigest: sourceContext.sourceContextDigest,
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects()
  };
}

async function changedFilesForAdmission({ repoRoot, baseRevision, candidateRevision, changeSet }) {
  const out = [];
  for (const change of changeSet.changes || []) {
    const status = change.operation === 'CREATE' ? 'added' : change.operation === 'DELETE' ? 'removed' : 'modified';
    let patch = null;
    if (status !== 'removed') {
      patch = (await git(repoRoot, ['diff', '--no-ext-diff', '--unified=3', baseRevision, candidateRevision, '--', change.path])).stdout;
    }
    out.push({ filename: change.path, status, patch, additions: 0, deletions: 0 });
  }
  return out;
}

async function independentlyVerifyCandidate({ repoRoot, candidateRevision }) {
  const host = createLinuxSelfMaintainerSandboxHost({ repoRoot });
  const sandbox = await host.createSandbox({ baseRevision: candidateRevision });
  if (!sandbox?.ok) return fail(['independent-candidate-sandbox-unavailable', ...(sandbox?.reasonCodes || [])], 'INDEPENDENT_VERIFICATION_BLOCKED');
  try {
    const verification = await host.verifySandbox({
      sandboxRoot: sandbox.sandboxRoot,
      isolationReceipt: sandbox.isolationReceipt,
      commands: ['npm run check:syntax', 'npm run test:deterministic'],
      date: new Date()
    });
    if (!verification?.ok || verification.status !== 'PASS') {
      return fail(['independent-exact-head-verification-failed'], 'INDEPENDENT_VERIFICATION_FAILED', {
        verificationStatus: verification?.status || null,
        verificationReceiptId: verification?.verificationReceiptId || null
      });
    }
    return { ok: true, verification };
  } finally {
    await host.destroySandbox({ sandbox }).catch(() => {});
  }
}

async function stageReleasePointer({ runtimeInbox, releaseName }) {
  const pointer = path.join(runtimeInbox, 'NEXT_RELEASE');
  const existing = await fs.readFile(pointer, 'utf8').catch(error => error?.code === 'ENOENT' ? null : Promise.reject(error));
  if (existing != null) {
    const name = existing.trim();
    if (name !== releaseName) return fail(['another-runtime-release-is-already-pending'], 'RUNTIME_INBOX_BLOCKED', { pendingRelease: name });
    return { ok: true, status: 'RUNTIME_POINTER_ALREADY_PUBLISHED' };
  }
  await writeTextAtomic(pointer, `${releaseName}\n`);
  return { ok: true, status: 'RUNTIME_POINTER_PUBLISHED' };
}

async function reconcilePending({ repoRoot, stateDir, runtimeInbox, runtimeStateFile, pending }) {
  const admitted = await readJsonMaybe(path.join(runtimeInbox, `ADMITTED-${pending.releaseName}.receipt`));
  const rejected = await readJsonMaybe(path.join(runtimeInbox, `REJECTED-${pending.releaseName}.receipt`));
  const runtimeState = await parseRuntimeState(runtimeStateFile);
  const decision = compilePendingForgeDecision({
    pending,
    admittedReceipt: admitted,
    rejectedReceipt: rejected,
    runtimeSourceCommit: runtimeState.CURRENT_SOURCE_COMMIT || null
  });
  if (!decision.ok) return decision;

  const stateFile = path.join(stateDir, 'state.json');
  if (decision.status === 'WAIT_FOR_RUNTIME_ADMISSION_RECEIPT') {
    const releaseDir = path.join(runtimeInbox, pending.releaseName);
    try { const stat = await fs.lstat(releaseDir); if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('invalid'); }
    catch { return fail(['pending-runtime-release-directory-missing'], 'RUNTIME_INBOX_BLOCKED'); }
    const pointer = await stageReleasePointer({ runtimeInbox, releaseName: pending.releaseName });
    return { ...decision, pointerStatus: pointer.status || null };
  }

  const currentMain = text((await git(repoRoot, ['rev-parse', 'refs/heads/main'])).stdout, 80).toLowerCase();
  if (currentMain !== pending.baseRevision) return fail(['forge-main-moved-during-runtime-admission'], 'SOURCE_RECONCILIATION_BLOCKED', { currentMain });

  if (decision.status === 'ADVANCE_CANONICAL_SOURCE_AFTER_RUNTIME_ADMISSION') {
    const parent = text((await git(repoRoot, ['rev-parse', `${pending.candidateRevision}^`])).stdout, 80).toLowerCase();
    if (parent !== pending.baseRevision) return fail(['candidate-parent-no-longer-matches-base'], 'SOURCE_RECONCILIATION_BLOCKED');
    await git(repoRoot, ['merge', '--ff-only', pending.candidateRevision], { timeoutMs: 120_000 });
    await git(repoRoot, ['branch', '-D', pending.branchName], { allowFailure: true });
    await fs.rm(stateFile, { force: true });
    return {
      ...decision,
      status: 'SOVEREIGN_CANDIDATE_ADMITTED_DEPLOYED_AND_SOURCE_ADVANCED',
      sourceAdvanceEffects: 1,
      deploymentEvidence: `receipt:${path.join(runtimeInbox, `ADMITTED-${pending.releaseName}.receipt`)}`
    };
  }

  if (decision.status === 'ROLL_BACK_CANDIDATE_AND_MUTATE_STRATEGY') {
    await git(repoRoot, ['branch', '-D', pending.branchName], { allowFailure: true });
    await writeJsonAtomic(path.join(stateDir, 'last-runtime-rejection.json'), {
      schemaVersion: 'uberbond.sovereign-forge-rejection.v1',
      taskId: pending.taskId,
      baseRevision: pending.baseRevision,
      candidateRevision: pending.candidateRevision,
      changeSetId: pending.changeSetId,
      blockerFingerprint: decision.blockerFingerprint,
      runtimeReceipt: decision.runtimeReceipt,
      law: 'SAME BLOCKER + SAME STRATEGY + NO NEW EVIDENCE = STRATEGY MUTATION',
      recordedAt: new Date().toISOString(),
      businessEffectAuthority: 'NONE'
    });
    await fs.rm(stateFile, { force: true });
    return { ...decision, status: 'RUNTIME_REJECTED_CANDIDATE_STRATEGY_MUTATION_REQUIRED' };
  }
  return decision;
}

async function runCycle({ env = process.env } = {}) {
  const repoRoot = path.resolve(env.UBERBOND_FORGE_REPO || process.cwd());
  const stateDir = path.resolve(env.UBERBOND_FORGE_STATE_DIR || '/var/lib/uberbond-forge');
  const runtimeInbox = path.resolve(env.UBERBOND_RUNTIME_INBOX || '/var/lib/uberbond-control/inbox');
  const runtimeStateFile = path.resolve(env.UBERBOND_RUNTIME_STATE_FILE || '/var/lib/uberbond-control/state.env');
  const controlBin = path.resolve(env.UBERBOND_CONTROL_BIN || path.join(repoRoot, 'ops/sovereign/uberbondctl'));
  await fs.mkdir(stateDir, { recursive: true, mode: 0o700 });

  const repo = await cleanDedicatedRepo(repoRoot);
  if (!repo.ok) return repo;
  const stateFile = path.join(stateDir, 'state.json');
  const pending = await readJsonMaybe(stateFile);
  if (pending) {
    if (pending.schemaVersion !== FORGE_STATE_SCHEMA) return fail(['forge-state-schema-mismatch'], 'PENDING_STATE_REJECTED');
    return reconcilePending({ repoRoot, stateDir, runtimeInbox, runtimeStateFile, pending });
  }

  const directive = await exactFiniteDirective({ repoRoot, stateDir, baseRevision: repo.head });
  if (!directive?.ok) return directive;
  if (directive.taskRequired !== true) {
    return {
      ok: true,
      policyVersion: SOVEREIGN_AUTONOMY_FORGE_RUNNER_VERSION,
      status: 'DECLARED_FINITE_ENGINEERING_ALREADY_CLOSED',
      baseRevision: repo.head,
      businessEffectAuthority: 'NONE',
      externalEffectAuthority: 'NONE',
      externalEffectLedger: zeroEffects(),
      truthBoundary: 'FINITE SOURCE CLOSURE DOES NOT ESTABLISH CUSTOMER PAYMENT LIFE ASI OR UNOBSERVED RUNTIME OUTCOMES.'
    };
  }

  const task = compileFiniteCompletionTask({ directive, date: new Date() });
  if (!task?.taskId) return fail(['finite-completion-task-compilation-failed'], 'FINITE_TASK_BLOCKED');
  const priorRejection = await readJsonMaybe(path.join(stateDir, 'last-runtime-rejection.json'));
  if (priorRejection?.baseRevision === repo.head && priorRejection?.taskId === task.taskId) {
    task.objective = `${task.objective} Previous runtime evidence rejected candidate ${priorRejection.candidateRevision || 'unknown'} with blocker fingerprint ${priorRejection.blockerFingerprint || 'unknown'}. The same strategy without new evidence is forbidden; mutate the causal strategy rather than replaying the prior candidate.`;
    task.evidenceRefs = [...new Set([...(task.evidenceRefs || []), `receipt:runtime-rejection:${priorRejection.blockerFingerprint || 'unknown'}`])];
  }

  const proposal = await proposeCandidate({ repoRoot, task, env });
  if (!proposal.ok || proposal.status === 'NO_SAFE_SOURCE_CHANGE_PROPOSED') return proposal;

  const sandboxHost = createLinuxSelfMaintainerSandboxHost({ repoRoot });
  const maintenance = await runUberBondSelfMaintenance({
    task,
    candidateChangeSet: proposal.candidate,
    createSandbox: sandboxHost.createSandbox,
    destroySandbox: sandboxHost.destroySandbox,
    verifySandbox: sandboxHost.verifySandbox,
    repository: 'uberbond/sovereign-local',
    date: new Date()
  });
  if (!maintenance?.ok || maintenance.status !== 'VERIFIED_CHANGESET_READY_FOR_PROMOTION') {
    return fail(['forge-self-maintenance-verification-failed', ...(maintenance?.reasonCodes || [])], maintenance?.status || 'CANDIDATE_VERIFICATION_BLOCKED');
  }

  const observed = maintenance.observedChangeSet;
  const verifiedReceipt = maintenance.verifiedReceipt;
  const branchName = `uberbond/self-maintain/${safeSlug(task.taskId)}-${observed.changeSetId.slice(-12).toLowerCase()}`;
  const candidateRoot = await fs.mkdtemp(path.join(stateDir, 'candidate-'));
  let keepBranch = false;
  try {
    const add = await git(repoRoot, ['worktree', 'add', '-b', branchName, candidateRoot, repo.head], { allowFailure: true, timeoutMs: 120_000 });
    if (!add.ok) return fail(['candidate-worktree-create-failed'], 'CANDIDATE_WORKTREE_BLOCKED');
    const deps = await copyPreparedDependencies(repoRoot, candidateRoot);
    if (!deps.ok) return deps;
    const applied = await applyAgentCodeChangeSet({ sandboxRoot: candidateRoot, changeSet: observed, date: new Date() });
    if (!applied?.ok) return fail(['trusted-candidate-apply-failed', ...(applied?.reasonCodes || [])], 'CANDIDATE_APPLY_BLOCKED');
    await git(candidateRoot, ['add', '-A']);
    const commit = await run('git', [
      '-c', 'user.name=UberBond Sovereign Forge',
      '-c', 'user.email=forge@uberbond.local',
      'commit', '-m', `UberBond self-maintenance: ${task.taskId}`
    ], { cwd: candidateRoot, allowFailure: true, timeoutMs: 120_000 });
    if (!commit.ok) return fail(['candidate-commit-failed'], 'CANDIDATE_COMMIT_BLOCKED');
    const candidateRevision = text((await git(candidateRoot, ['rev-parse', 'HEAD'])).stdout, 80).toLowerCase();
    const parent = text((await git(candidateRoot, ['rev-parse', 'HEAD^'])).stdout, 80).toLowerCase();
    if (!EXACT_SHA.test(candidateRevision) || parent !== repo.head) return fail(['candidate-commit-parent-binding-failed'], 'LOCAL_ADMISSION_REFUSED');

    const changedFiles = await changedFilesForAdmission({ repoRoot, baseRevision: repo.head, candidateRevision, changeSet: observed });
    const envelope = buildLocalMergeAdmissionEnvelope({
      baseRevision: repo.head,
      candidateRevision,
      branchName,
      taskId: task.taskId,
      changeSetId: observed.changeSetId,
      receiptId: verifiedReceipt.selfMaintenanceReceiptId,
      changedFiles
    });
    if (!envelope.ok) return envelope;
    const admission = admitSelfMaintainerPullRequest({
      pullRequest: envelope.pullRequest,
      changedFiles: envelope.changedFiles,
      currentMainSha: repo.head,
      repository: envelope.repository,
      headParents: envelope.headParents
    });
    if (!admission?.ok) return fail(['local-merge-governor-refused', ...(admission?.reasonCodes || [])], 'LOCAL_ADMISSION_REFUSED');

    const independent = await independentlyVerifyCandidate({ repoRoot, candidateRevision });
    if (!independent.ok) return independent;

    const sequence = nowSequence(new Date());
    const releaseName = `sovereign-${candidateRevision}-${sequence}`;
    const releaseOut = path.join(stateDir, 'releases', releaseName);
    await fs.mkdir(path.dirname(releaseOut), { recursive: true, mode: 0o700 });
    const pack = await run('bash', [controlBin, 'pack', candidateRoot, releaseOut], {
      env: { ...env, UBERBOND_RELEASE_SEQUENCE: sequence },
      allowFailure: true,
      timeoutMs: 2_700_000,
      maxBuffer: 32_000_000
    });
    if (!pack.ok) return fail(['signed-offline-release-pack-failed'], 'RELEASE_PACK_BLOCKED', { exitCode: pack.exitCode });

    const runtimeRelease = path.join(runtimeInbox, releaseName);
    const stageTmp = `${runtimeRelease}.staging.${process.pid}`;
    await fs.mkdir(runtimeInbox, { recursive: true, mode: 0o700 });
    try { await fs.lstat(runtimeRelease); return fail(['runtime-release-name-collision'], 'RUNTIME_INBOX_BLOCKED'); }
    catch (error) { if (error?.code !== 'ENOENT') throw error; }
    await fs.cp(releaseOut, stageTmp, { recursive: true, errorOnExist: true, force: false });
    await fs.rename(stageTmp, runtimeRelease);

    const pendingCompiled = newPendingForgeState({
      baseRevision: repo.head,
      candidateRevision,
      branchName,
      taskId: task.taskId,
      changeSetId: observed.changeSetId,
      receiptId: verifiedReceipt.selfMaintenanceReceiptId,
      releaseName,
      releaseSequence: sequence,
      createdAt: new Date()
    });
    if (!pendingCompiled.ok) return pendingCompiled;
    await writeJsonAtomic(stateFile, pendingCompiled.state);
    const pointer = await stageReleasePointer({ runtimeInbox, releaseName });
    if (!pointer.ok) return pointer;
    keepBranch = true;
    return {
      ok: true,
      policyVersion: SOVEREIGN_AUTONOMY_FORGE_RUNNER_VERSION,
      status: 'SIGNED_SOVEREIGN_CANDIDATE_STAGED_AWAITING_RUNTIME_ADMISSION',
      baseRevision: repo.head,
      candidateRevision,
      branchName,
      taskId: task.taskId,
      changeSetId: observed.changeSetId,
      receiptId: verifiedReceipt.selfMaintenanceReceiptId,
      provider: proposal.provider,
      releaseName,
      releaseSequence: sequence,
      mergeGovernorStatus: admission.status,
      independentVerificationStatus: independent.verification.status,
      pointerStatus: pointer.status,
      businessEffectAuthority: 'NONE',
      externalEffectAuthority: 'NONE',
      externalEffectLedger: zeroEffects(),
      truthBoundary: 'SOURCE CANDIDATE IS VERIFIED AND SIGNED BUT CANONICAL SOURCE DOES NOT ADVANCE UNTIL THE RUNTIME EMITS AN EXACT ADMITTED RECEIPT AND ITS STATE CONFIRMS THE SAME COMMIT.'
    };
  } finally {
    await git(repoRoot, ['worktree', 'remove', '--force', candidateRoot], { allowFailure: true });
    await fs.rm(candidateRoot, { recursive: true, force: true }).catch(() => {});
    if (!keepBranch) await git(repoRoot, ['branch', '-D', branchName], { allowFailure: true });
  }
}

async function doctor({ env = process.env } = {}) {
  const repoRoot = path.resolve(env.UBERBOND_FORGE_REPO || process.cwd());
  const stateDir = path.resolve(env.UBERBOND_FORGE_STATE_DIR || '/var/lib/uberbond-forge');
  const runtimeInbox = path.resolve(env.UBERBOND_RUNTIME_INBOX || '/var/lib/uberbond-control/inbox');
  const signingKey = path.resolve(env.UBERBOND_RELEASE_SIGNING_KEY || path.join(os.homedir(), '.config/uberbond-release/release-private.pem'));
  const reasons = [];
  const repo = await cleanDedicatedRepo(repoRoot);
  if (!repo.ok) reasons.push(...(repo.reasonCodes || []));
  for (const command of ['git', 'node', 'npm', 'docker', 'cp', 'bash']) {
    const probe = await run('bash', ['-lc', `command -v ${command} >/dev/null 2>&1`], { allowFailure: true });
    if (!probe.ok) reasons.push(`host-command-missing:${command}`);
  }
  try { const stat = await fs.lstat(signingKey); if (!stat.isFile() || stat.isSymbolicLink()) reasons.push('release-signing-private-key-invalid'); }
  catch { reasons.push('release-signing-private-key-absent'); }
  try { const stat = await fs.lstat(runtimeInbox); if (!stat.isDirectory() || stat.isSymbolicLink()) reasons.push('runtime-inbox-directory-invalid'); }
  catch { reasons.push('runtime-inbox-directory-absent'); }
  const readiness = describeProviderReadiness({ env });
  const selected = selectSovereignForgeProvider(readiness, {
    preferred: env.UBERBOND_FORGE_MODEL_PROVIDER || 'open-model',
    allowExternalFallback: String(env.UBERBOND_FORGE_ALLOW_EXTERNAL_MODEL_FALLBACK || '').toLowerCase() === 'true'
  });
  if (!selected.ok) reasons.push(...selected.reasonCodes);
  await fs.mkdir(stateDir, { recursive: true, mode: 0o700 }).catch(() => {});
  return {
    ok: reasons.length === 0,
    policyVersion: SOVEREIGN_AUTONOMY_FORGE_RUNNER_VERSION,
    status: reasons.length ? 'SOVEREIGN_FORGE_NOT_READY' : 'SOVEREIGN_FORGE_SOURCE_AND_HOST_READY_FOR_BOUNDED_CYCLES',
    reasonCodes: [...new Set(reasons)],
    repoRoot,
    sourceCommit: repo.head || null,
    modelProvider: selected.ok ? selected.provider : null,
    runtimeInbox,
    signingKeyPresent: !reasons.includes('release-signing-private-key-absent'),
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects(),
    proofBoundary: 'A READY DOCTOR DOES NOT CLAIM A SELF-COMPLETION CYCLE OCCURRED. OBSERVED CANDIDATE, INDEPENDENT VERIFICATION, SIGNED RELEASE, RUNTIME ADMISSION, SOURCE ADVANCE AND REPEATED CYCLES REMAIN SEPARATE EVIDENCE.'
  };
}

async function main() {
  const command = text(process.argv[2] || 'doctor', 40).toLowerCase();
  let result;
  try {
    if (command === 'cycle') result = await runCycle();
    else if (command === 'doctor') result = await doctor();
    else result = fail(['usage: sovereign-autonomy-forge.mjs {doctor|cycle}'], 'USAGE_REFUSED');
  } catch (error) {
    result = fail(['sovereign-forge-runner-threw'], 'FORGE_RUNTIME_REFUSED', { detail: text(error?.message, 1000) });
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result?.ok) process.exitCode = 2;
}

const direct = process.argv[1] && import.meta.url === `file://${path.resolve(process.argv[1])}`;
if (direct) await main();

export { doctor as inspectSovereignForge, runCycle as runSovereignForgeCycle };
