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

test('local Sandwich task uses the existing isolated worker continuation conveyor', () => {
  const sandwichCompilation = pulse.indexOf('compileSandwichAutocatalyticTask');
  const attempt = pulse.indexOf('localAttemptId(head, task)');
  const continuation = pulse.indexOf('waitingReceipt({ baseRevision: head, task, attemptId })');
  const handoff = pulse.indexOf('atomicJson(workerTaskPath, task, 0o640)');
  assert.ok(sandwichCompilation >= 0 && attempt > sandwichCompilation && continuation > attempt && handoff > continuation);
  assert.match(pulse, /TASK_DISPATCHED_TO_ISOLATED_WORKER/);
});

test('descendant genesis cannot bypass the one-attempt continuation gate', () => {
  const gate = pulse.indexOf('gateSelfMaintainerPulse');
  const truth = pulse.indexOf('regenerateTerminalInEphemeralClone');
  const sandwich = pulse.lastIndexOf('compileSandwichAutocatalyticDirective');
  assert.ok(gate >= 0 && truth > gate && sandwich > truth);
  assert.match(pulse, /WAIT_FOR_EXISTING_ATTEMPT/);
  assert.match(pulse, /SAME_BASE_REENTRY_BLOCKED_BY_CONTINUATION_POLICY/);
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
