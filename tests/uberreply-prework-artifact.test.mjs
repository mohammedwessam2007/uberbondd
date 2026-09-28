import test from 'node:test';
import assert from 'node:assert/strict';
import { compileUberReplyPreworkArtifact } from '../src/uberreply-prework-artifact.mjs';

const issue={
  code:'handoff-1',
  title:'form confirmation has no visible next-step',
  service:'Lead handoff',
  implication:'the agency cannot verify what happens after submission',
  confidence:0.94,
  safeForOutreach:true,
  evidenceUrl:'https://example.com/contact',
  evidenceExcerpt:'Thanks, your request has been received.',
  screenshots:{desktop:'artifacts/screens/contact.png'}
};

test('prework artifact is evidence-bound and zero-authority',()=>{
  const out=compileUberReplyPreworkArtifact({
    offerId:'LEAD_TO_BOOKING_LEAK_AUDIT',
    prospect:{id:'p1',company:'Example Agency',website:'https://example.com'},
    issue,
    audit:[issue]
  });
  assert.equal(out.ok,true);
  assert.equal(out.prepared,true);
  assert.equal(out.artifactType,'ONE_PAGE_REVENUE_LEAK_EVIDENCE_MAP');
  assert.equal(out.findings.length,1);
  assert.ok(out.evidenceRefs.includes('https://example.com/contact'));
  assert.equal(out.externalEffectAuthority,'NONE');
});

test('prework artifact refuses unsupported prose without evidence',()=>{
  const out=compileUberReplyPreworkArtifact({
    offerId:'CLIENT_ROI_PROOF_SPRINT',
    prospect:{id:'p2'},
    issue:{title:'Maybe attribution is bad',safeForOutreach:true}
  });
  assert.equal(out.ok,false);
  assert.equal(out.prepared,false);
});
