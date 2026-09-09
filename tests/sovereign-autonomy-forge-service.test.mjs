import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const service = readFileSync(new URL('../ops/sovereign/uberbond-forge.service', import.meta.url), 'utf8');
const timer = readFileSync(new URL('../ops/sovereign/uberbond-forge.timer', import.meta.url), 'utf8');
const runner = readFileSync(new URL('../ops/sovereign/uberbond-forge-runner', import.meta.url), 'utf8');
const installer = readFileSync(new URL('../ops/sovereign/install-forge-host.sh', import.meta.url), 'utf8');

test('forge heartbeat is bounded, non-overlapping systemd oneshot work', () => {
  assert.match(service, /Type=oneshot/);
  assert.match(service, /User=uberbond-forge/);
  assert.match(service, /ExecStartPre=.*uberbond-forge-runner doctor/);
  assert.match(service, /ExecStart=.*uberbond-forge-runner cycle/);
  assert.match(timer, /OnUnitActiveSec=15min/);
  assert.match(timer, /Persistent=true/);
  assert.match(timer, /Unit=uberbond-forge\.service/);
  assert.doesNotMatch(service, /Restart=always/);
});

test('forge runner requires runtime truth it cannot itself write', () => {
  assert.match(runner, /writable runtime submission\/receipt channel required/);
  assert.match(runner, /regular independent runtime-state evidence file required/);
  assert.match(runner, /Forge must not be able to write runtime-state evidence/);
  assert.match(runner, /\[\[ ! -w "\$UBERBOND_RUNTIME_STATE_FILE" \]\]/);
});

test('forge installer enables heartbeat only after doctor passes', () => {
  assert.match(installer, /uberbond-forge-runner" doctor/);
  assert.match(installer, /systemctl enable --now uberbond-forge\.timer/);
  assert.match(installer, /systemctl disable --now uberbond-forge\.timer/);
  assert.match(installer, /Forge installed but NOT enabled because the doctor refused/);
});

test('forge and runtime signing authority remain separated', () => {
  assert.match(installer, /UBERBOND_RELEASE_SIGNING_KEY=/);
  assert.match(installer, /release-private\.pem/);
  assert.match(installer, /REFUSED: the Forge signing key must not be installed in the runtime-host control directory/);
  assert.doesNotMatch(service, /ADMIN_TOKEN|PAYPAL|SMTP|OUTBOUND_ENABLED/);
});
