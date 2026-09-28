import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyUberReplyQualification, classifyUberReplyState, compileUberReplyAsyncResponseDraft } from '../src/uberreply-async-response.mjs';

const artifact={
  prepared:true,
  findings:[
    {title:'form confirmation has no visible next-step',evidenceExcerpt:'Thanks, your request has been received.'},
    {title:'mobile call CTA is absent',evidenceExcerpt:'Request a quote'}
  ]
};

test('positive reply produces artifact-first async draft with no forced meeting',()=>{
  const out=compileUberReplyAsyncResponseDraft({
    offerId:'LEAD_TO_BOOKING_LEAK_AUDIT',
    replyState:'YES',
    artifact,
    senderName:'Mohamed'
  });
  assert.equal(out.ok,true);
  assert.equal(out.decision.meetingDefault,'NONE');
  assert.equal(out.decision.meetingAllowed,false);
  assert.equal(out.automaticSendAuthorized,false);
  assert.match(out.draft,/Here’s the evidence I mapped/i);
  assert.match(out.draft,/No call needed unless you’d prefer one/i);
});

test('price reply exposes current fixed price and bounded scope',()=>{
  const out=compileUberReplyAsyncResponseDraft({
    offerId:'AI_AGENT_RELEASE_GATE',
    replyState:'PRICE',
    senderName:'Mohamed'
  });
  assert.equal(out.ok,true);
  assert.match(out.draft,/\$3,000 fixed/);
  assert.match(out.draft,/40–60 representative cases/);
  assert.equal(out.automaticSendAuthorized,false);
});

test('complex AI workflow exposes 4k hypothesis without auto-charge authority',()=>{
  const out=compileUberReplyAsyncResponseDraft({
    offerId:'AI_AGENT_RELEASE_GATE',
    replyState:'PRICE',
    qualification:{complexWorkflow:true}
  });
  assert.match(out.draft,/\$4,000 fixed/);
  assert.equal(out.externalEffectAuthority,'NONE');
});

test('negative or unsubscribe state produces no persuasion draft',()=>{
  const out=compileUberReplyAsyncResponseDraft({
    offerId:'CLIENT_ROI_PROOF_SPRINT',
    replyState:'NO'
  });
  assert.equal(out.decision.state,'SUPPRESS_AND_STOP');
  assert.equal(out.draft,'');
  assert.equal(out.draftReady,false);
});


test('reply-state classifier gives stop and routing labels precedence over tempting keywords',()=>{
  assert.equal(classifyUberReplyState({classification:{label:'negative'},body:'Do not call me about pricing.'}),'NO');
  assert.equal(classifyUberReplyState({classification:{label:'optout'},body:'Call me? No. Remove me.'}),'NO');
  assert.equal(classifyUberReplyState({classification:{label:'wrong_person'},body:'Call Sarah about price.'}),'WRONG_PERSON');
  assert.equal(classifyUberReplyState({classification:{label:'automatic'},body:'For pricing call the office.'}),'AUTO_REPLY');
  assert.equal(classifyUberReplyState({classification:{label:'positive'},body:'What is the price?'}),'PRICE');
});

test('automatic reply never generates a sales draft',()=>{
  const out=compileUberReplyAsyncResponseDraft({
    offerId:'LEAD_TO_BOOKING_LEAK_AUDIT',
    replyState:'AUTO_REPLY',
    artifact
  });
  assert.equal(out.decision.state,'HOLD_FOR_HUMAN_RETURN');
  assert.equal(out.draft,'');
  assert.equal(out.draftReady,false);
  assert.equal(out.automaticSendAuthorized,false);
});


test('qualified-positive evidence requires explicit commercial or project intent',()=>{
  const sendIt=classifyUberReplyQualification({classification:{label:'positive'},body:'Yes, send it.',replyState:'YES'});
  assert.equal(sendIt.qualified,false);
  const price=classifyUberReplyQualification({classification:{label:'positive'},body:'Looks relevant. How much does this cost?',replyState:'PRICE'});
  assert.equal(price.qualified,true);
  assert.ok(price.reasonCodes.includes('commercial-price-question'));
  const call=classifyUberReplyQualification({classification:{label:'positive'},body:'Can we have a call tomorrow?',replyState:'CALL'});
  assert.equal(call.qualified,true);
  const negative=classifyUberReplyQualification({classification:{label:'negative'},body:'Do not call me about pricing.',replyState:'NO'});
  assert.equal(negative.qualified,false);
});
