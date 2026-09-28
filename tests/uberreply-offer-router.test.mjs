import test from 'node:test';
import assert from 'node:assert/strict';
import { compileUberReplyRuntimeOfferDecision } from '../src/uberreply-offer-router.mjs';

const research={
  accountValueScore:0.85,
  signalStrength:0.9,
  artifactFeasibility:1,
  evidenceDensity:0.9,
  estimatedResearchMinutes:10
};

test('pinned campaign stays pinned when prospect fit passes',()=>{
  const out=compileUberReplyRuntimeOfferDecision({
    campaign:{offerId:'AI_AGENT_RELEASE_GATE'},
    prospect:{
      industry:'AI SaaS',
      tags:['AI','agent','software','release','eval'],
      problemEvidenceScore:0.9,
      fitEvidenceConfidence:0.9,
      sourceCount:3,
      sourceFreshness:1
    },
    research
  });
  assert.equal(out.ok,true);
  assert.equal(out.routingMode,'PINNED');
  assert.equal(out.selectedOfferId,'AI_AGENT_RELEASE_GATE');
  assert.equal(out.externalEffectAuthority,'NONE');
});

test('auto route selects only among the four known offers using supplied evidence',()=>{
  const out=compileUberReplyRuntimeOfferDecision({
    campaign:{autoRouteOffer:true},
    prospect:{
      industry:'AI software',
      tags:['AI','agent','SaaS','engineering','release','QA'],
      problemEvidenceScore:0.95,
      fitEvidenceConfidence:0.95,
      sourceCount:4,
      sourceFreshness:1
    },
    research
  });
  assert.equal(out.ok,true);
  assert.equal(out.routingMode,'AUTO_EVIDENCE_ROUTED');
  assert.equal(out.selectedOfferId,'AI_AGENT_RELEASE_GATE');
  assert.equal(out.automaticOfferMutationAuthorized,false);
});

test('auto route abstains when no offer has strong fit',()=>{
  const out=compileUberReplyRuntimeOfferDecision({
    campaign:{autoRouteOffer:true},
    prospect:{
      industry:'unrelated',
      tags:['unrelated'],
      problemEvidenceScore:0.2,
      fitEvidenceConfidence:0.2,
      sourceCount:1,
      sourceFreshness:1
    },
    research
  });
  assert.equal(out.ok,false);
  assert.equal(out.selectedOfferId,null);
});

test('legacy campaign without offer routing preserves legacy path',()=>{
  const out=compileUberReplyRuntimeOfferDecision({
    campaign:{},
    prospect:{},
    research:{}
  });
  assert.equal(out.ok,true);
  assert.equal(out.routingMode,'NONE');
  assert.equal(out.selectedOfferId,null);
});
