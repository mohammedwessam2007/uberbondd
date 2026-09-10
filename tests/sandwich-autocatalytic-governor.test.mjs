import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  compileSandwichAutocatalyticDirective,
  compileSandwichAutocatalyticTask
} from '../src/sandwich-autocatalytic-governor.mjs';

const HEAD = 'a'.repeat(40);
const closed = {
  ok: true,
  status: 'FINITE_ENGINEERING_ALREADY_CLOSED',
  baseRevision: HEAD,
  taskRequired: false
};

test('post-finite governor refuses to compete with unfinished finite engineering', () => {
  const result = compileSandwichAutocatalyticDirective({
    baseRevision: HEAD,
    finiteDirective: { ...closed, status: 'FINITE_REQUIREMENT_TARGET_READY', taskRequired: true }
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'FINITE_COMPLETION_RETAINS_PRIORITY');
});

test('exact-base finite closure opens exactly the descendant-genesis transition', () => {
  const result = compileSandwichAutocatalyticDirective({ baseRevision: HEAD, finiteDirective: closed });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'DESCENDANT_REQUIREMENT_GENESIS_READY');
  assert.equal(result.mode, 'ONE_NEW_FINITE_REQUIREMENT_ONLY');
  assert.equal(result.externalEffectAuthority, 'NONE');
  assert.equal(result.businessEffectAuthority, 'NONE');
});

test('stale finite closure cannot drive a new descendant fold', () => {
  const result = compileSandwichAutocatalyticDirective({
    baseRevision: HEAD,
    finiteDirective: { ...closed, baseRevision: 'b'.repeat(40) }
  });
  assert.equal(result.ok, false);
  assert.match(result.reasonCodes.join(' '), /exact-base-finite-engineering-closure-required/);
});

test('descendant task may admit one requirement but cannot implement it in the same cycle', () => {
  const directive = compileSandwichAutocatalyticDirective({ baseRevision: HEAD, finiteDirective: closed });
  const task = compileSandwichAutocatalyticTask({ directive, date: new Date('2026-09-10T20:00:00Z') });
  assert.equal(task.taskId, `uberbond_sandwich_descendant_${HEAD.slice(0,24)}`);
  assert.ok(task.constraints.includes('exactly-one-new-finite-requirement-maximum'));
  assert.ok(task.constraints.includes('requirement-genesis-only-do-not-implement-same-cycle'));
  assert.ok(task.constraints.includes('derive-only-from-existing-canonical-goals-and-invariants'));
  assert.ok(task.constraints.includes('stop-instead-of-manufacturing-work-when-no-novel-internal-gap-exists'));
  assert.ok(task.forbiddenActions.includes('implement-newly-admitted-requirement-in-same-cycle'));
  assert.ok(task.forbiddenActions.includes('invent-founder-goal'));
  assert.ok(task.forbiddenActions.includes('claim-asi'));
  assert.equal(task.consequenceClass, 'LOCAL_PREPARATION');
});

test('autocatalytic workflow fires after maintainer completion and keeps recovery clock', () => {
  const workflow = readFileSync(new URL('../.github/workflows/uberbond-sandwich-autocatalytic.yml', import.meta.url), 'utf8');
  assert.match(workflow, /workflow_run:\s*\n\s*workflows:\s*\n\s*- UberBond Self Maintainer\s*\n\s*types:\s*\n\s*- completed/);
  assert.match(workflow, /cron: '\*\/15 \* \* \* \*'/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /contents: read/);
  assert.doesNotMatch(workflow, /contents: write/);
});

test('workflow regenerates truth before descendant seeding and dispatch', () => {
  const workflow = readFileSync(new URL('../.github/workflows/uberbond-sandwich-autocatalytic.yml', import.meta.url), 'utf8');
  const truth = workflow.indexOf('Regenerate exact-current terminal truth');
  const seed = workflow.indexOf('Seed one post-finite descendant requirement task');
  const dispatch = workflow.indexOf('Dispatch the next Sandwich fold to the trusted self-maintainer');
  assert.ok(truth >= 0 && seed > truth && dispatch > seed);
  assert.match(workflow, /node scripts\/terminal-realization\.mjs/);
  assert.match(workflow, /node scripts\/sandwich-autocatalytic-seed\.mjs/);
});
