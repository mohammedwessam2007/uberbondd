import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');

test('server exposes Crown-independent zero-call JEV readiness and calibration surfaces',()=>{
  assert.match(source,/inspectJevShadowReadiness/);
  assert.match(source,/\/api\/admin\/infinite-opus\/jev-readiness/);
  assert.match(source,/crownAdmissionRequiredForReadiness:false/);
  assert.match(source,/paidInferenceTriggered:false/);
  assert.match(source,/\/api\/admin\/infinite-opus\/jev-calibration/);
  assert.match(source,/readJevCalibrationSummary/);
  assert.match(source,/jevShadowReady:jev\.ok/);
});

test('JEV readiness surface cannot claim Crown suppression authority',()=>{
  const start=source.indexOf("'/api/admin/infinite-opus/jev-readiness'");
  assert.ok(start>0);
  const window=source.slice(start,start+3000);
  assert.match(window,/does not authorize or execute a Jev provider call/);
  assert.match(window,/cannot suppress Crown/);
});
