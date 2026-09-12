import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pulse = readFileSync(new URL('../scripts/sovereign-autonomy-pulse.mjs', import.meta.url), 'utf8');
const continuum = readFileSync(new URL('../ops/sovereign/uberbond-authoring-continuum', import.meta.url), 'utf8');
const service = readFileSync(new URL('../ops/sovereign/uberbond-authoring-continuum.service', import.meta.url), 'utf8');

test('finite closure becomes local Sandwich descendant genesis rather than sleep', () => {
  assert.match(pulse, /compileSandwichAutocatalyticDirective/);
  assert.match(pulse, /compileSandwichAutocatalyticTask/);
  assert.match(pulse, /finiteDirective\.taskRequired === true/);
  assert.match(pulse, /SANDWICH_DESCENDANT_GENESIS/);
  assert.match(pulse, /observedFiniteEngineeringClosed/);
  assert.doesNotMatch(pulse, /if \(!directive\.taskRequired\).*return state/s);
});

test('local Sandwich task binds exact context before entering the isolated worker conveyor', () => {
  const sandwichCompilation = pulse.indexOf('compileSandwichAutocatalyticTask');
  const projectionRead = pulse.indexOf('const projection=await readJson(workerContextPath)');
  const binding = pulse.indexOf('compileTaskBoundContextProjection');
  const boundTask = pulse.indexOf('const boundTask={...task,contextBinding:bound.boundProjection}');
  const attempt = pulse.indexOf('localAttemptId(head,boundTask)');
  const continuation = pulse.indexOf('waitingReceipt({baseRevision:head,task:boundTask,attemptId})');
  const handoff = pulse.indexOf('atomicJson(workerTaskPath,boundTask,0o640)');
  assert.ok(sandwichCompilation >= 0 && projectionRead > sandwichCompilation && binding > projectionRead && boundTask > binding && attempt > boundTask && continuation > attempt && handoff > continuation);
  assert.match(pulse, /contextBindingId/);
  assert.match(pulse, /TASK_DISPATCHED_TO_ISOLATED_WORKER/);
});

test('descendant genesis cannot bypass the one-attempt or one-context continuation gates', () => {
  const gate = pulse.indexOf('gateSelfMaintainerPulse');
  const truth = pulse.indexOf('regenerateTerminalInEphemeralClone');
  const sandwich = pulse.lastIndexOf('compileSandwichAutocatalyticDirective');
  assert.ok(gate >= 0 && truth > gate && sandwich > truth);
  assert.match(pulse, /WAIT_FOR_EXISTING_ATTEMPT/);
  assert.match(pulse, /SAME_BASE_REENTRY_BLOCKED_BY_CONTINUATION_POLICY/);
  assert.match(pulse, /existingTask\.contextBinding\?\.bindingId/);
  assert.match(pulse, /workerTask\.contextBinding\?\.bindingId !== existingTask\.contextBinding\.bindingId/);
});

test('resident continuum calls only the local authorctl and has no cloud control-plane dependency', () => {
  assert.match(continuum, /"\$AUTHORCTL" wake/);
  assert.match(service, /^PrivateNetwork=true$/m);
  assert.match(service, /^RestrictAddressFamilies=AF_UNIX$/m);
  assert.doesNotMatch(`${continuum}\n${service}`, /github|vercel|workflow|cron|http:\/\/|https:\/\//i);
});

test('continuous pace never means overlapping authoring brains', () => {
  const authorctl = readFileSync(new URL('../ops/sovereign/uberbond-authorctl', import.meta.url), 'utf8');
  assert.match(authorctl, /flock -n 9/);
  assert.match(authorctl, /AUTHORING_PULSE_ALREADY_ACTIVE/);
  assert.match(continuum, /INTERVAL_SEC >= 60/);
});
