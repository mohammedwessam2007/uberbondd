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
  const out = compileLocalAutonomyState({ paused: true, baseRevision: SHA, directive: directive(), workerConfigured: true });
  assert.equal(out.ok, true);
  assert.equal(out.status, 'FOUNDER_PAUSED');
  assert.equal(out.taskRequired, false);
  assert.equal(out.businessEffectAuthority, 'NONE');
});

test('finite closure does not manufacture runtime or external authority', () => {
  const out = compileLocalAutonomyState({ baseRevision: SHA, directive: directive({ taskRequired: false }), workerConfigured: true });
  assert.equal(out.status, 'FINITE_ENGINEERING_ALREADY_CLOSED');
  assert.equal(out.businessEffectAuthority, 'NONE');
  assert.equal(out.externalEffectAuthority, 'NONE');
  assert.match(out.truthBoundary, /runtime, commercial, personal and ASI evidence remain separate/i);
});

test('missing local worker leaves a durable task instead of silently falling back to a provider', () => {
  const out = compileLocalAutonomyState({ baseRevision: SHA, directive: directive(), workerConfigured: false });
  assert.equal(out.status, 'TASK_READY_NO_LOCAL_WORKER');
  assert.equal(out.taskRequired, true);
});

test('configured worker gains task-dispatch readiness but no merge deploy or business authority', () => {
  const out = compileLocalAutonomyState({ baseRevision: SHA, directive: directive({ targetRequirementId: 'req-1' }), workerConfigured: true });
  assert.equal(out.status, 'LOCAL_WORKER_DISPATCH_READY');
  assert.equal(out.targetRequirementId, 'req-1');
  assert.equal(out.businessEffectAuthority, 'NONE');
  assert.equal(out.externalEffectAuthority, 'NONE');
  assert.match(out.truthBoundary, /may not merge, sign, deploy/i);
});

test('local authoring scripts preserve proposer verifier promotion separation', () => {
  const pulse = readFileSync(new URL('../scripts/sovereign-autonomy-pulse.mjs', import.meta.url), 'utf8');
  const verify = readFileSync(new URL('../scripts/sovereign-autonomy-verify.mjs', import.meta.url), 'utf8');
  assert.match(pulse, /terminal-realization\.mjs/);
  assert.match(pulse, /compileFiniteCompletionDirective/);
  assert.match(pulse, /worker-must-return-task-bound-agent-code-change-set/);
  assert.doesNotMatch(pulse, /git\s+merge|git\s+push|docker\s+compose|paypal|stripe/i);
  assert.match(verify, /createLinuxSelfMaintainerSandboxHost/);
  assert.match(verify, /runUberBondSelfMaintenance/);
  assert.match(verify, /promotionAdapter:\s*null/);
  assert.match(verify, /VERIFIED_CHANGESET_READY_FOR_SEPARATE_PROMOTION_AUTHORITY/);
});
