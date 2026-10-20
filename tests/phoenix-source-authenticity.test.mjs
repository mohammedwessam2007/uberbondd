import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {verifyPinnedSourceText} from '../src/phoenix-source-authenticity.mjs';
const ref='github:releases/example-1';
const text='Version 1: new safe API available\n';
const expected='sha256:'+createHash('sha256').update(text).digest('hex');
test('Wave 10 original pinned release note passes source integrity gate',()=>{
  const r=verifyPinnedSourceText({sourceText:text,expectedSha256:expected,sourceRef:ref});
  assert.equal(r.ok,true);assert.equal(r.sourceProposalId,'phoenix-wave10-0001');
  assert.equal(r.observedSha256,expected);
  assert.equal(r.externalEffectLedger.providerCalls,0);
});
test('changing original release note byte rejects source authenticity',()=>{
  const r=verifyPinnedSourceText({sourceText:text+'undocumented feature\n',expectedSha256:expected,sourceRef:ref});
  assert.equal(r.ok,false);assert.equal(r.reason,'SOURCE_CONTENT_DIGEST_CHANGED');
  assert.notEqual(r.observedSha256,expected);
});
test('missing pin, invalid digest and oversized text cannot claim authenticity',()=>{
  assert.equal(verifyPinnedSourceText({sourceText:text,sourceRef:ref}).ok,false);
  assert.equal(verifyPinnedSourceText({sourceText:text,sourceRef:ref,expectedSha256:'f'.repeat(64)}).ok,false);
  assert.equal(verifyPinnedSourceText({sourceText:'x'.repeat(1048577),sourceRef:ref,expectedSha256:expected}).ok,false);
});

test('CoS command rejects altered source note under the pinned digest',async()=>{
  const {runPhoenixCosCommand}=await import('../scripts/phoenix-cos-operator.mjs');
  const r=runPhoenixCosCommand(['source-verify',JSON.stringify({
    sourceText:text+'changed',expectedSha256:expected,sourceRef:ref
  })]);
  assert.equal(r.ok,false);assert.equal(r.reason,'SOURCE_CONTENT_DIGEST_CHANGED');
  assert.equal(r.externalEffectLedger.messages,0);
});
