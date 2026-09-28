import test from 'node:test';
import assert from 'node:assert/strict';
import { compileUberReplyV5CandidateSet, compileUberReplyExperimentalAssignment } from '../src/uberreply-v5-candidate-compiler.mjs';

const artifact={
  prepared:true,
  artifactType:'ONE_PAGE_REVENUE_LEAK_EVIDENCE_MAP',
  publicLabel:'one-page revenue-leak evidence map',
  evidenceRefs:['https://example.com/contact','artifacts/screens/contact.png'],
  findings:[
    {
      title:'form confirmation has no visible next-step',
      implication:'the downstream lead handoff is not visible',
      confidence:0.94,
      evidenceUrl:'https://example.com/contact',
      evidenceExcerpt:'Thanks, your request has been received.'
    }
  ]
};

test('candidate compiler creates bounded evidence-first variants and selects one without send authority',()=>{
  const out=compileUberReplyV5CandidateSet({
    offerId:'LEAD_TO_BOOKING_LEAK_AUDIT',
    prospect:{
      company:'Example Agency',
      tags:['agency','HVAC','booking'],
      problemEvidenceScore:0.9,
      fitEvidenceConfidence:0.9,
      sourceCount:3,
      sourceFreshness:1
    },
    issue:artifact.findings[0],
    contact:{firstName:'Sam'},
    sender:{name:'Mohamed',company:'UberBond',address:'Cairo'},
    artifact,
    research:{
      accountValueScore:0.8,
      signalStrength:0.9,
      artifactFeasibility:1,
      evidenceDensity:0.9
    },
    maxCandidates:12
  });
  assert.equal(out.ok,true);
  assert.equal(out.state,'UBERREPLY_V5_CANDIDATE_SET_READY');
  assert.ok(out.candidateCount>=4);
  assert.ok(out.candidateCount<=12);
  assert.ok(out.selectedCandidate);
  assert.ok(out.assignedCandidate);
  assert.ok(['EXPLOIT_CHAMPION','EXPLORE_CHALLENGER'].includes(out.assignmentMode));
  assert.match(out.assignedCandidate.body,/Want me to send it\?|Worth sending over\?|Want the screenshots\?|Useful if I send the one-pager\?/);
  assert.ok(out.assignedCandidate.subject.split(/\s+/).length>=2);
  assert.ok(out.assignedCandidate.subject.split(/\s+/).length<=5);
  assert.equal(out.externalEffectAuthority,'NONE');
  assert.equal(out.tournament.automaticDispatchAuthorized,false);
});

test('candidate compiler refuses to fabricate variants before evidence artifact exists',()=>{
  const out=compileUberReplyV5CandidateSet({
    offerId:'LEAD_TO_BOOKING_LEAK_AUDIT',
    prospect:{company:'Example'},
    artifact:{prepared:false}
  });
  assert.equal(out.ok,false);
  assert.ok(out.reasonCodes.includes('prepared-artifact-required'));
});


test('experimental assignment is deterministic for the same prospect and bounded to tournament candidates',()=>{
  const tournament={
    ok:true,
    explorationRate:0.5,
    champion:{candidateId:'champ',score:0.9,candidate:{candidateId:'champ'}},
    challengers:[
      {candidateId:'challenger-a',score:0.8,candidate:{candidateId:'challenger-a'}},
      {candidateId:'challenger-b',score:0.7,candidate:{candidateId:'challenger-b'}}
    ]
  };
  const a=compileUberReplyExperimentalAssignment({tournament,prospectKey:'prospect-123'});
  const b=compileUberReplyExperimentalAssignment({tournament,prospectKey:'prospect-123'});
  assert.deepEqual(a,b);
  assert.ok(['champ','challenger-a','challenger-b'].includes(a.assignedCandidateId));
  assert.equal(a.automaticDispatchAuthorized,false);
  assert.equal(a.externalEffectAuthority,'NONE');
});
