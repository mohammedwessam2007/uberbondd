import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const script=readFileSync(new URL('../ops/sovereign/sovereign-runtime-rehearsal.sh',import.meta.url),'utf8');

test('runtime rehearsal quiesces automatic release application before destructive recovery work',()=>{
  assert.match(script,/systemctl is-active --quiet uberbond-release-apply\.path/);
  assert.match(script,/systemctl stop uberbond-release-apply\.path/);
  assert.match(script,/release-apply-service-active-during-rehearsal-quiesce/);
  assert.match(script,/queued-release-must-be-cleared-before-rehearsal/);
  const stop=script.indexOf('systemctl stop uberbond-release-apply.path');
  const killPostgres=script.indexOf('docker kill uberbond-postgres');
  assert.ok(stop>=0&&killPostgres>stop,'release apply must be quiesced before destructive recovery');
});

test('runtime rehearsal restores automatic release application on success and failure',()=>{
  assert.match(script,/trap on_exit EXIT/);
  assert.match(script,/restore_release_path/);
  assert.match(script,/systemctl start uberbond-release-apply\.path/);
  assert.match(script,/release-apply-path-restore-failed/);
  assert.match(script,/release-apply-path-not-active-after-rehearsal/);
});

test('quiescing background release apply grants no outbound or commercial authority',()=>{
  assert.match(script,/AUTOPILOT_ENABLED false/);
  assert.match(script,/OUTBOUND_ENABLED false/);
  assert.match(script,/OUTBOUND_DRY_RUN true/);
  assert.doesNotMatch(script,/OUTBOUND_ENABLED true|PAYPAL_LIVE|release-private\.pem|curl|wget|git clone/i);
});
