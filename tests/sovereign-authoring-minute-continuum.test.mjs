import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = relative => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');
const exists = relative => existsSync(new URL(`../${relative}`, import.meta.url));

test('resident sovereign continuum leaves at most one minute idle after a completed pulse', () => {
  const runner = read('ops/sovereign/uberbond-authoring-continuum');
  const service = read('ops/sovereign/uberbond-authoring-continuum.service');
  assert.match(runner, /UBERBOND_AUTHORING_INTERVAL_SEC:-60/);
  assert.match(runner, /INTERVAL_SEC >= 60 && INTERVAL_SEC <= 3600/);
  assert.match(runner, /"\$AUTHORCTL" wake/);
  assert.match(runner, /sleep 1/);
  assert.match(service, /^Environment=UBERBOND_AUTHORING_INTERVAL_SEC=60$/m);
  assert.match(service, /^Restart=always$/m);
  assert.match(service, /^RestartSec=5$/m);
});

test('continuum is a resident owner-controlled process, not a hosted or timer scheduler', () => {
  const runner = read('ops/sovereign/uberbond-authoring-continuum');
  const service = read('ops/sovereign/uberbond-authoring-continuum.service');
  const installer = read('ops/sovereign/install-authoring-node.sh');
  assert.match(service, /^Type=simple$/m);
  assert.match(service, /^User=uberbond-author$/m);
  assert.match(service, /^PrivateNetwork=true$/m);
  assert.match(service, /^RestrictAddressFamilies=AF_UNIX$/m);
  assert.match(installer, /systemctl enable --now uberbond-authoring-continuum\.service/);
  assert.match(installer, /systemctl disable --now uberbond-authoring\.timer/);
  assert.equal(exists('ops/sovereign/uberbond-authoring.timer'), false);
  assert.doesNotMatch(`${runner}\n${service}`, /vercel|github actions|workflow_dispatch|OnCalendar|\.timer\b/i);
});

test('all direct and resident wakes serialize through the same local single-writer lock', () => {
  const authorctl = read('ops/sovereign/uberbond-authorctl');
  const service = read('ops/sovereign/uberbond-authoring.service');
  assert.match(authorctl, /WAKE_LOCK=.*authoring-pulse\.lock/);
  assert.match(authorctl, /flock -n 9/);
  assert.match(authorctl, /AUTHORING_PULSE_ALREADY_ACTIVE/);
  assert.match(service, /^ExecStart=\/opt\/uberbond\/control\/uberbond-authorctl wake$/m);
});

test('founder console depends on resident continuum rather than legacy timer', () => {
  const founder = read('ops/sovereign/uberbond-founder-console.service');
  assert.match(founder, /^Wants=uberbond-authoring-continuum\.service$/m);
  assert.match(founder, /^After=local-fs\.target uberbond-authoring-continuum\.service$/m);
  assert.doesNotMatch(founder, /uberbond-authoring\.timer/);
});

test('fresh install copies continuum and actively removes a legacy timer unit', () => {
  const installer = read('ops/sovereign/install-authoring-node.sh');
  assert.match(installer, /uberbond-authorctl uberbond-authoring-continuum uberbond-founder-console/);
  assert.match(installer, /uberbond-authoring\.service uberbond-authoring-continuum\.service/);
  assert.match(installer, /rm -f \/etc\/systemd\/system\/uberbond-authoring\.timer/);
  assert.match(installer, /flock sleep/);
});
