import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileLocalAutonomyState } from '../scripts/sovereign-autonomy-pulse.mjs';

const SHA = 'a'.repeat(40);
const directive = (overrides = {}) => ({ ok: true, taskRequired: true, repairMode: 'TERMINAL_TRUTH_REGENERATION', targetRequirementId: null, ...overrides });

test('local autonomy refuses non-exact source identity', () => {
  const out = compileLocalAutonomyState({ baseRevision: 'main', directive: directive() });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('exact-source-commit-required'));
});

test('founder pause is a durable no-task state', () => {
  const out = compileLocalAutonomyState({ paused: true, baseRevision: SHA, directive: directive(), isolatedWorkerEnabled: true });
  assert.equal(out.ok, true);
  assert.equal(out.status, 'FOUNDER_PAUSED');
  assert.equal(out.taskRequired, false);
  assert.equal(out.businessEffectAuthority, 'NONE');
});

test('finite closure does not manufacture runtime or external authority', () => {
  const out = compileLocalAutonomyState({ baseRevision: SHA, directive: directive({ taskRequired: false }), isolatedWorkerEnabled: true });
  assert.equal(out.status, 'FINITE_ENGINEERING_ALREADY_CLOSED');
  assert.equal(out.businessEffectAuthority, 'NONE');
  assert.equal(out.externalEffectAuthority, 'NONE');
  assert.match(out.truthBoundary, /runtime, commercial, personal and ASI evidence remain separate/i);
});

test('disabled isolated worker leaves a durable task instead of silently falling back to a provider', () => {
  const out = compileLocalAutonomyState({ baseRevision: SHA, directive: directive(), isolatedWorkerEnabled: false });
  assert.equal(out.status, 'TASK_READY_NO_LOCAL_WORKER');
  assert.equal(out.taskRequired, true);
});

test('enabled isolated worker gains task readiness but no merge deploy or business authority', () => {
  const out = compileLocalAutonomyState({ baseRevision: SHA, directive: directive({ targetRequirementId: 'req-1' }), isolatedWorkerEnabled: true });
  assert.equal(out.status, 'TASK_READY_FOR_ISOLATED_WORKER');
  assert.equal(out.targetRequirementId, 'req-1');
  assert.equal(out.businessEffectAuthority, 'NONE');
  assert.equal(out.externalEffectAuthority, 'NONE');
  assert.match(out.truthBoundary, /separate OS identity/i);
});

test('author worker verifier are separate kernel identities and worker network is private', () => {
  const author = readFileSync(new URL('../ops/sovereign/uberbond-authoring.service', import.meta.url), 'utf8');
  const worker = readFileSync(new URL('../ops/sovereign/uberbond-local-worker.service', import.meta.url), 'utf8');
  const verifier = readFileSync(new URL('../ops/sovereign/uberbond-autonomy-verify.service', import.meta.url), 'utf8');
  assert.match(author, /^User=uberbond-author$/m);
  assert.match(worker, /^User=uberbond-worker$/m);
  assert.match(verifier, /^User=uberbond-author$/m);
  assert.match(worker, /^PrivateNetwork=true$/m);
  assert.match(worker, /^ReadOnlyPaths=.*\/opt\/uberbond\/source.*\/var\/lib\/uberbond-worker\/inbox$/m);
  assert.match(worker, /^ReadWritePaths=\/var\/lib\/uberbond-worker\/outbox \/tmp$/m);
  assert.doesNotMatch(worker, /var\/lib\/uberbond-control/);
  assert.match(verifier, /^ReadOnlyPaths=.*\/var\/lib\/uberbond-worker\/outbox$/m);
});

test('local authoring scripts preserve proposer verifier promotion separation', () => {
  const pulse = readFileSync(new URL('../scripts/sovereign-autonomy-pulse.mjs', import.meta.url), 'utf8');
  const worker = readFileSync(new URL('../scripts/sovereign-local-worker-runner.mjs', import.meta.url), 'utf8');
  const verify = readFileSync(new URL('../scripts/sovereign-autonomy-verify.mjs', import.meta.url), 'utf8');
  assert.match(pulse, /terminal-realization\.mjs/);
  assert.match(pulse, /compileFiniteCompletionDirective/);
  assert.doesNotMatch(pulse, /UBERBOND_LOCAL_WORKER_EXECUTABLE/);
  assert.doesNotMatch(pulse, /git\s+merge|git\s+push|docker\s+compose|paypal|stripe/i);
  assert.match(worker, /task-bound-agent-code-change-set-required/);
  assert.doesNotMatch(worker, /git\s+merge|git\s+push|docker\s+compose|paypal|stripe/i);
  assert.match(verify, /createLinuxSelfMaintainerSandboxHost/);
  assert.match(verify, /runUberBondSelfMaintenance/);
  assert.match(verify, /promotionAdapter:\s*null/);
  assert.match(verify, /VERIFIED_CHANGESET_READY_FOR_SEPARATE_PROMOTION_AUTHORITY/);
});

test('timer wake is continuation-gated and cannot duplicate the same local attempt', () => {
  const pulse = readFileSync(new URL('../scripts/sovereign-autonomy-pulse.mjs', import.meta.url), 'utf8');
  assert.match(pulse, /gateSelfMaintainerPulse/);
  assert.match(pulse, /continuation-receipt\.json/);
  assert.match(pulse, /WAIT_FOR_EXISTING_ATTEMPT/);
  assert.match(pulse, /resumeExistingAttemptOnly/);
  assert.match(pulse, /newWorkerDispatch:\s*false/);
  assert.match(pulse, /observedAttemptId/);
  assert.match(pulse, /localAttemptId/);
});

test('worker failures become durable verifier input instead of a permanent wait', () => {
  const worker = readFileSync(new URL('../scripts/sovereign-local-worker-runner.mjs', import.meta.url), 'utf8');
  const verify = readFileSync(new URL('../scripts/sovereign-autonomy-verify.mjs', import.meta.url), 'utf8');
  assert.match(worker, /emitFailure/);
  assert.match(worker, /atomicJson\(resultPath, receipt\)/);
  assert.match(verify, /decideSelfMaintainerContinuation/);
  assert.match(verify, /CANDIDATE_REJECTED/);
  assert.match(verify, /continuation-receipt\.json/);
  assert.match(verify, /STRATEGY_MUTATION|relayStatus:\s*'CANDIDATE_REJECTED'/);
});

test('verified candidate becomes review pending under canonical continuation policy', () => {
  const verify = readFileSync(new URL('../scripts/sovereign-autonomy-verify.mjs', import.meta.url), 'utf8');
  const policy = readFileSync(new URL('../src/self-maintainer-continuation-policy.mjs', import.meta.url), 'utf8');
  assert.match(verify, /relayStatus:\s*out\.status/);
  assert.match(policy, /VERIFIED_CHANGESET_READY_FOR_SEPARATE_PROMOTION_AUTHORITY/);
  assert.match(policy, /status:\s*'REVIEW_PENDING'/);
});

test('installer keeps author and worker configs private to their identities and release signing separate', () => {
  const installer = readFileSync(new URL('../ops/sovereign/install-authoring-node.sh', import.meta.url), 'utf8');
  assert.match(installer, /groupadd --system uberbond-autonomy/);
  assert.match(installer, /usermod -g "\$account" -a -G uberbond-autonomy/);
  assert.match(installer, /chown root:uberbond-author \/etc\/uberbond\/authoring\.env/);
  assert.match(installer, /chown root:uberbond-worker \/etc\/uberbond\/worker\.env/);
  assert.match(installer, /release signing authority must not live/i);
  assert.match(installer, /UBERBOND_ISOLATED_WORKER_ENABLED=false/);
});
