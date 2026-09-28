import test from 'node:test';
import assert from 'node:assert/strict';
import { compileUberReplyTreatmentIdentity, compileUberReplyV5CandidateSet, compileUberReplyExperimentalAssignment } from '../src/uberreply-v5-candidate-compiler.mjs';

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
      sourceFreshness:1,
      roleOwnershipScore:0.85,
      trigger:{type:'OBSERVED_PROBLEM',confidence:0.9,freshness:1,problemLinked:true}
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
  assert.ok(out.candidateCount>=8);
  assert.ok(out.candidateCount<=12);
  assert.ok(out.selectedCandidate);
  assert.ok(out.assignedCandidate);
  assert.ok(['EXPLOIT_CHAMPION','EXPLORE_CHALLENGER'].includes(out.assignmentMode));
  assert.match(out.assignedCandidate.body,/Want me to send it\?|Worth sending over\?|Want the screenshots\?|Useful if I send the one-pager\?/);
  assert.ok(out.assignedCandidate.subject.split(/\s+/).length>=2);
  assert.ok(out.assignedCandidate.subject.split(/\s+/).length<=5);
  assert.equal(out.externalEffectAuthority,'NONE');
  assert.equal(out.tournament.automaticDispatchAuthorized,false);

  assert.ok(new Set(out.candidates.map(candidate=>candidate.strategyAtoms.bodyMode)).size>=2);
  assert.equal(new Set(out.candidates.map(candidate=>candidate.strategyArmId)).size,out.candidates.length);
  assert.ok(out.candidates.every(candidate=>candidate.strategyArmId?.startsWith('ubv5arm_')));
  const baseline=out.candidates.find(candidate=>candidate.strategyAtoms.controlledDimension==='BASELINE');
  assert.ok(baseline);
  for(const candidate of out.candidates.filter(candidate=>candidate.strategyAtoms.controlledDimension==='SUBJECT')){
    assert.equal(candidate.strategyAtoms.ctaId,baseline.strategyAtoms.ctaId);
    assert.equal(candidate.strategyAtoms.bodyMode,baseline.strategyAtoms.bodyMode);
  }
  for(const candidate of out.candidates.filter(candidate=>candidate.strategyAtoms.controlledDimension==='CTA')){
    assert.equal(candidate.subject,baseline.subject);
    assert.equal(candidate.strategyAtoms.bodyMode,baseline.strategyAtoms.bodyMode);
  }
  for(const candidate of out.candidates.filter(candidate=>candidate.strategyAtoms.controlledDimension==='PROOF_DENSITY')){
    assert.equal(candidate.subject,baseline.subject);
    assert.equal(candidate.strategyAtoms.ctaId,baseline.strategyAtoms.ctaId);
  }
  assert.ok(out.candidates.every(candidate=>candidate.genotypeId?.startsWith('ubog_')));
  assert.ok(out.candidates.every(candidate=>candidate.renderedMessageId?.startsWith('ubom_')));
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
  assert.ok(a.assignmentProbability>0&&a.assignmentProbability<=1);
  assert.equal(a.automaticDispatchAuthorized,false);
  assert.equal(a.externalEffectAuthority,'NONE');
});


test('15% exploration prior is actually approximately 15% and reaches all top challengers',()=>{
  const tournament={
    ok:true,
    explorationRate:0.15,
    champion:{candidateId:'champ',score:0.9,candidate:{candidateId:'champ'}},
    challengers:[
      {candidateId:'challenger-a',score:0.8,candidate:{candidateId:'challenger-a'}},
      {candidateId:'challenger-b',score:0.7,candidate:{candidateId:'challenger-b'}},
      {candidateId:'challenger-c',score:0.6,candidate:{candidateId:'challenger-c'}}
    ]
  };
  let explored=0;
  const seen=new Set();
  const n=10000;
  for(let i=0;i<n;i+=1){
    const out=compileUberReplyExperimentalAssignment({tournament,prospectKey:`prospect-${i}`});
    if(out.mode==='EXPLORE_CHALLENGER'){
      explored+=1;
      seen.add(out.assignedCandidateId);
    }
  }
  const rate=explored/n;
  assert.ok(rate>0.13&&rate<0.17,`expected ~15% exploration, observed ${rate}`);
  assert.deepEqual([...seen].sort(),['challenger-a','challenger-b','challenger-c']);
});


test('exact treatment identity preserves first-touch assignment and gives each follow-up its own payload identity',()=>{
  const candidateSet={
    assignedCandidateId:'ubv5_first',
    assignmentMode:'EXPLORE_CHALLENGER',
    assignedCandidate:{candidateId:'ubv5_first',strategyAtoms:{ctaId:'SEND_IT'}}
  };
  const first=compileUberReplyTreatmentIdentity({
    offerId:'LEAD_TO_BOOKING_LEAK_AUDIT',
    subject:'lead handoff',
    body:'first body',
    followup:0,
    candidateSet,
    prospect:{company:'Example Agency',seniority:'Director'},
    artifact:{artifactType:'ONE_PAGE_REVENUE_LEAK_EVIDENCE_MAP',artifactId:'ubart_1'}
  });
  const second=compileUberReplyTreatmentIdentity({
    offerId:'LEAD_TO_BOOKING_LEAK_AUDIT',
    subject:'lead handoff',
    body:'second body with new evidence',
    followup:1,
    candidateSet,
    prospect:{company:'Example Agency',seniority:'Director'},
    artifact:{artifactType:'ONE_PAGE_REVENUE_LEAK_EVIDENCE_MAP',artifactId:'ubart_1'}
  });
  assert.equal(first.candidateId,'ubv5_first');
  assert.equal(first.assignmentMode,'EXPLORE_CHALLENGER');
  assert.match(first.strategyArmId,/^ubv5arm_/);
  assert.notEqual(second.candidateId,first.candidateId);
  assert.equal(second.assignmentMode,'EVIDENCE_SEQUENCE');
  assert.match(second.strategyArmId,/^ubv5arm_/);
  assert.notEqual(second.strategyArmId,first.strategyArmId);
  assert.equal(second.sequencePosition,2);
  assert.notEqual(second.payloadDigest,first.payloadDigest);

  assert.match(second.genotypeId,/^ubog_/);
  assert.match(second.renderedMessageId,/^ubom_/);
  assert.equal(second.externalEffectAuthority,'NONE');
});


test('exploration samples every challenger rather than starving lower-prior arms',()=>{
  const tournament={
    ok:true,
    explorationRate:0.5,
    champion:{candidateId:'champ',score:0.9,candidate:{candidateId:'champ',strategyArmId:'arm-champ'}},
    challengers:Array.from({length:7},(_,index)=>({
      candidateId:`challenger-${index+1}`,
      score:0.8-index*0.01,
      candidate:{candidateId:`challenger-${index+1}`,strategyArmId:`arm-${index+1}`}
    }))
  };
  const seen=new Set();
  for(let i=0;i<5000;i+=1){
    const out=compileUberReplyExperimentalAssignment({tournament,prospectKey:`p-${i}`});
    if(out.mode==='EXPLORE_CHALLENGER')seen.add(out.assignedCandidateId);
  }
  assert.equal(seen.size,7);
});


test('a tournament with no challenger assigns the champion with probability one',()=>{
  const out=compileUberReplyExperimentalAssignment({
    tournament:{ok:true,explorationRate:0.15,champion:{candidateId:'only',score:0.9,candidate:{candidateId:'only',strategyArmId:'only-arm'}},challengers:[]},
    prospectKey:'p-only'
  });
  assert.equal(out.mode,'EXPLOIT_CHAMPION');
  assert.equal(out.assignmentProbability,1);
  assert.equal(out.assignedStrategyArmId,'only-arm');
});


test('equal seed-score leaders share exploitation traffic instead of choosing a hash-tie winner forever',()=>{
  const tournament={
    ok:true,
    explorationRate:0.15,
    champion:{candidateId:'leader-a',score:0.9,candidate:{candidateId:'leader-a',strategyArmId:'arm-a'}},
    challengers:[
      {candidateId:'leader-b',score:0.9,candidate:{candidateId:'leader-b',strategyArmId:'arm-b'}},
      {candidateId:'lower',score:0.8,candidate:{candidateId:'lower',strategyArmId:'arm-lower'}}
    ]
  };
  const leaders=new Set();
  let leaderAssignments=0;
  let lowerAssignments=0;
  for(let i=0;i<10000;i+=1){
    const out=compileUberReplyExperimentalAssignment({tournament,prospectKey:`tie-${i}`});
    if(out.mode==='EXPLOIT_CHAMPION'){
      leaderAssignments+=1;
      leaders.add(out.assignedCandidateId);
      assert.equal(out.assignmentProbability,0.425);
    }else{
      lowerAssignments+=1;
      assert.equal(out.assignedCandidateId,'lower');
      assert.equal(out.assignmentProbability,0.15);
    }
  }
  assert.deepEqual([...leaders].sort(),['leader-a','leader-b']);
  assert.ok(leaderAssignments/10000>0.83&&leaderAssignments/10000<0.87);
  assert.ok(lowerAssignments/10000>0.13&&lowerAssignments/10000<0.17);
});
