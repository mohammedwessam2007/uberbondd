import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = relative => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');

test('sovereign authoring continuum leaves at most one minute idle between completed pulses', () => {
  const timer = read('ops/sovereign/uberbond-authoring.timer');
  assert.match(timer, /^OnBootSec=10s$/m);
  assert.match(timer, /^OnUnitInactiveSec=60s$/m);
  assert.match(timer, /^AccuracySec=1s$/m);
  assert.match(timer, /^Persistent=true$/m);
  assert.match(timer, /^Unit=uberbond-authoring\.service$/m);
  assert.doesNotMatch(timer, /OnUnitActiveSec=15min|\b15min\b|\b1h\b|hourly/i);
});

test('minute continuum remains a local sovereign systemd path rather than a cloud scheduler', () => {
  const timer = read('ops/sovereign/uberbond-authoring.timer');
  const service = read('ops/sovereign/uberbond-authoring.service');
  const installer = read('ops/sovereign/install-authoring-node.sh');
  assert.match(service, /^ExecStart=\/opt\/uberbond\/control\/uberbond-authorctl wake$/m);
  assert.match(service, /^Type=oneshot$/m);
  assert.match(installer, /systemctl enable --now uberbond-authoring\.timer/);
  assert.doesNotMatch(`${timer}\n${service}`, /vercel|github actions|workflow_dispatch|schedule:/i);
});

test('oneshot plus OnUnitInactiveSec prevents overlapping authoring brains while preserving continuous work', () => {
  const timer = read('ops/sovereign/uberbond-authoring.timer');
  const service = read('ops/sovereign/uberbond-authoring.service');
  assert.match(service, /^Type=oneshot$/m);
  assert.match(timer, /^OnUnitInactiveSec=60s$/m);
  assert.doesNotMatch(timer, /OnCalendar=/);
});
