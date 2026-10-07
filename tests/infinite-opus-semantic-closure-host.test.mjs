import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createInfiniteOpusSemanticClosureHost } from '../src/infinite-opus-semantic-closure-host.mjs';

const h=x=>'sha256:'+crypto.createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
test('semantic host exposes deterministic actions with zero effect authority',()=>{
 const host=createInfiniteOpusSemanticClosureHost();
 const manifest=host.manifest();
 assert.equal(manifest.status,'INFINITE_OPUS_SEMANTIC_CLOSURE_HOST_READY');
 assert.equal(manifest.providerCallsPerformed,0);
 const isa=host.execute('semantic.isa.validate',{program:[{op:'LOAD_FACT',sideEffectAuthority:'NONE'}]});
 assert.equal(isa.result.ok,true);assert.equal(isa.hostSemanticAuthority,'NONE');assert.equal(isa.persisted,false);
 const recurrence=host.execute('recurrence.map',{records:[{id:'r1',taskClass:'X',obligation:'o',driftClass:'LOW'},{id:'r2',taskClass:'X',obligation:'o',driftClass:'LOW'}]});
 assert.equal(recurrence.result.map.dimensions.obligation.maxFanout,2);
});
test('operator payload cannot self-attest Crown interpretation authority',()=>{
 const host=createInfiniteOpusSemanticClosureHost();
 const raw=h('raw');
 const parseA={goal:'a',claims:[],constraints:[],requiredOutputs:[],sideEffects:[],ambiguities:['x'],uncertainties:[]};
 const parseB={...parseA,goal:'b'};
 const out=host.execute('interpretation.close',{rawTaskHash:raw,parses:[parseA,parseB],crownResolution:{semanticAuthority:'CURRENT_TASK_CLASS_CROWN',rawTaskHash:raw,program:parseA}});
 assert.equal(out.result.status,'INTERPRETATION_CROWN_REQUIRED');
 assert.equal(out.hostSemanticAuthority,'NONE');
});
test('counterfactual compiler refuses self-attested tokenizer and price receipts',()=>{
 const host=createInfiniteOpusSemanticClosureHost();
 const prompt='p',output='o';
 const out=host.execute('frontier.counterfactual.compile',{
  model:'m',providerRoute:'r',canonicalPrompt:prompt,matchedOutput:output,
  tokenizerReceipt:{verified:true,inputTokens:1,outputTokens:1,tokenizerHash:h('tok'),promptHash:h(prompt),outputHash:h(output),evidenceRef:'user:tokenizer'},
  priceReceipt:{verified:true,model:'m',providerRoute:'r',evidenceRef:'user:price',inputUsdPerMillion:1,outputUsdPerMillion:1},
  economics:{cheapestLegitimateRouteVerified:true,batchEconomicsConsidered:true,promptCacheEconomicsConsidered:true,responseCacheEconomicsConsidered:true,retryEconomicsConsidered:true}
 });
 assert.equal(out.result.ok,false);
 assert.ok(out.result.reasons.includes('verified-tokenizer-receipt-required'));
 assert.ok(out.result.reasons.includes('verified-current-price-receipt-required'));
});
test('renderer refuses untrusted reverse parser even when evidence fields look strong',()=>{
 const host=createInfiniteOpusSemanticClosureHost();
 const out=host.execute('renderer.verify',{
  semanticEnvelope:{claims:['a'],numbers:[],citations:[],constraints:[]},rendered:'a',reverseParse:{claims:['a'],numbers:[],citations:[],constraints:[]},
  reverseParseAdmission:{evidenceRef:'user:fake'},verifierEvidence:{verifierId:'v',proves:['REVERSE_PARSE_EQUIVALENCE'],doesNotProve:[],mutationCases:10,falsePositiveCases:10,falseNegativeCases:10,independentCrossCheckPassed:true,coverage:1}
 });
 assert.equal(out.result.status,'REVERSE_PARSE_AUTHORITY_REQUIRED');
});
test('succession apply uses only injected verified current Crown and never payload admission',()=>{
 const none=createInfiniteOpusSemanticClosureHost();
 assert.equal(none.execute('crown.succession.apply-current-general',{currentRoles:{GENERAL_CROWN:'old'}}).result.status,'CURRENT_VERIFIED_GENERAL_CROWN_REQUIRED');
 const receipt={semanticAuthority:'CURRENT_TASK_CLASS_CROWN',receiptHash:h('receipt'),exactModelId:'anthropic/claude-opus-5.5'};
 const host=createInfiniteOpusSemanticClosureHost({currentCrownAdmission:receipt});
 const out=host.execute('crown.succession.apply-current-general',{currentRoles:{GENERAL_CROWN:'old'},admissionReceipts:{GENERAL_CROWN:{semanticAuthority:'CURRENT_TASK_CLASS_CROWN',exactModelId:'evil'}}});
 assert.equal(out.result.roles.GENERAL_CROWN,'anthropic/claude-opus-5.5');
 assert.equal(out.result.sourceCrownReceiptHash,receipt.receiptHash);
});
