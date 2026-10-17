import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectWinnrTokenPermissions } from '../src/uberwarm2-winnr-token-permissions.mjs';
const DIGEST = 'sha256:'+'a'.repeat(64);
const wrapped = permissions => ({ok:true, receipt:{responseDigest:DIGEST}, data:{api_token:{permissions}}});
test('provider reports token write without creating signed transport or send authority',()=>{
  const result=inspectWinnrTokenPermissions(wrapped(['read','write']));
  assert.equal(result.scope,'WRITE_REPORTED');
  assert.equal(result.providerWritePermissionReported,true);
  assert.equal(result.scopeEvidenceDigest,DIGEST);
  assert.equal(result.independentlySignedTransportProof,false);
  assert.equal(result.authorizedToSend,false);
  assert.equal('token' in result,false);
});
test('read only and purchase scope never imply send capability',()=>{
  assert.equal(inspectWinnrTokenPermissions(wrapped(['read'])).scope,'READ_ONLY_REPORTED');
  assert.equal(inspectWinnrTokenPermissions(wrapped(['purchase'])).scope,'UNKNOWN');
  assert.equal(inspectWinnrTokenPermissions(wrapped(['purchase'])).authorizedToSend,false);
});
test('missing, malformed, contradictory and unsigned provider scope fails closed',()=>{
  for(const x of [null,{}, {ok:false},wrapped(null),wrapped([]),wrapped('read,write'),wrapped(['read','read']),wrapped(['read','admin']),wrapped(['read',{}]),{...wrapped(['read','write']),receipt:{}}]){
    const r=inspectWinnrTokenPermissions(x);
    assert.equal(r.status,'PROVIDER_TOKEN_SCOPE_UNKNOWN');
    assert.equal(r.providerWritePermissionReported,false);
    assert.equal(r.authorizedToSend,false);
  }
});
test('hostile getter cannot exfiltrate from or override immutable result',()=>{
  const input={ok:true,receipt:{responseDigest:DIGEST},data:{}};
  Object.defineProperty(input.data,'api_token',{get(){throw new Error('cannot inspect')}});
  assert.equal(inspectWinnrTokenPermissions(input).status,'PROVIDER_TOKEN_SCOPE_UNKNOWN');
});
