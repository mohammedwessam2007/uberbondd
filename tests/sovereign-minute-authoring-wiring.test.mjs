import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = relative => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');

test('sovereign authoring heartbeat runs every minute after each completed pulse', () => {
  const timer = read('ops/sovereign/uberbond-authoring.timer');
  assert.match(timer, /OnBootSec=10s/);
  assert.match(timer, /OnUnitInactiveSec=60s/);
  assert.match(timer, /AccuracySec=1s/);
  assert.match(timer, /RandomizedDelaySec=0/);
  assert.match(timer, /Persistent=true/);
  assert.doesNotMatch(timer, /15min|1h|hour/i);
  assert.doesNotMatch(timer, /OnUnitActiveSec=/);
});

test('authorctl routes every timer and manual wake through the Sandwich-aware sovereign pulse', () => {
  const control = read('ops/sovereign/uberbond-authorctl');
  assert.match(control, /scripts\/sovereign-continuous-authoring-pulse\.mjs/);
  assert.doesNotMatch(control, /"\$NODE" scripts\/sovereign-autonomy-pulse\.mjs/);
});

test('verified local promotion still wakes authoring immediately instead of waiting one minute', () => {
  const pathUnit = read('ops/sovereign/uberbond-authoring-after-promotion.path');
  assert.match(pathUnit, /PathChanged=\/var\/lib\/uberbond-promotion\/promotion-receipt\.json/);
  assert.match(pathUnit, /Unit=uberbond-authoring\.service/);
});

test('founder intent still has an event-driven immediate wake path', () => {
  const pathUnit = read('ops/sovereign/uberbond-founder-intent-wake.path');
  assert.match(pathUnit, /Unit=uberbond-authoring\.service/);
});
