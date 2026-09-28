import test from 'node:test';
import assert from 'node:assert/strict';
import { compileUberReplyAsyncResponseDraft } from '../src/uberreply-async-response.mjs';

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
