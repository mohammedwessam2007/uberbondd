import test from 'node:test';
import assert from 'node:assert/strict';
import { semanticHash } from '../src/semantic-closure-kernel.mjs';
import { compileCrownBoundaryQuery } from '../src/crown-boundary-query.mjs';

const passportVerification={ok:true,authority:'Q_CERTIFIED_BOUNDED'};
const base=()=>{
  const exactSourceExcerpt='Provider policy explicitly allows API-based transactional mail for authenticated customers.';
  const seed={
    passportVerification,
    circuitId:'jev.source-relevance.provider-screening.v1',
    taskArchetype:'PROVIDER_SCREENING',
    boundaryQuestion:'Is this source excerpt material to SMTP/API route eligibility?',
    exactSourceExcerpt,
    exactSourceExcerptHash:semanticHash(exactSourceExcerpt),
    jevDecision:'RELEVANT'
  };
  const messages=[
    {role:'system',content:'Audit one certified Jev relevance boundary. Reply A if the Jev decision is correct, B if it is wrong. No explanation.'},
    {role:'user',content:JSON.stringify({
      v:1,c:seed.circuitId,t:seed.taskArchetype,q:seed.boundaryQuestion,
      source:seed.exactSourceExcerpt,jev:seed.jevDecision
    })}
  ];
  return {...seed,tokenizerReceipt:{payloadHash:semanticHash(messages),inputTokens:187,verifierRef:'fixture://tokenizer'}};
};
const verifyTokenizerReceipt=({receipt,messages})=>receipt.payloadHash===semanticHash(messages)&&receipt.inputTokens===187;

test('certified Jev audit compiles to a independently token-bounded one-token Crown query',()=>{
  const out=compileCrownBoundaryQuery({...base(),verifyTokenizerReceipt,maxInputTokens:400});
  assert.equal(out.ok,true);
  assert.equal(out.maxTokens,1);
  assert.ok(out.inputTokens<=400);
  assert.deepEqual(out.outputAlphabet,['A','B']);
  assert.equal(out.semanticAuthority,'NONE');
});

test('boundary audit refuses a copied token count without independent verifier',()=>{
  const out=compileCrownBoundaryQuery({...base(),verifyTokenizerReceipt:null,maxInputTokens:400});
  assert.equal(out.ok,false);
  assert.ok(out.reasons.includes('independent-tokenizer-verification-required'));
});

test('boundary audit refuses stale/uncertified Jev authority before Crown spend',()=>{
  const x=base();x.passportVerification={ok:false,authority:'NONE'};
  const out=compileCrownBoundaryQuery({...x,verifyTokenizerReceipt,maxInputTokens:400});
  assert.equal(out.ok,false);
  assert.ok(out.reasons.includes('current-certified-jev-passport-required'));
});

test('boundary audit refuses source mutation and oversized token receipts',()=>{
  const changed=base();changed.exactSourceExcerpt+=' changed';
  assert.equal(compileCrownBoundaryQuery({...changed,verifyTokenizerReceipt,maxInputTokens:400}).ok,false);
  const huge=base();huge.tokenizerReceipt={...huge.tokenizerReceipt,inputTokens:401};
  assert.equal(compileCrownBoundaryQuery({...huge,verifyTokenizerReceipt,maxInputTokens:400}).ok,false);
});
