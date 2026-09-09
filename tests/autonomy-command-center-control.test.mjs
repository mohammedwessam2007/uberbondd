import test from 'node:test';
import assert from 'node:assert/strict';
import { compileAutonomyCommand, helpMarkdown, statusMarkdown, AUTONOMY_PAUSE_LABEL } from '../src/autonomy-command-center-control.mjs';

const base = {actor:'mohammedwessam2007',repositoryOwner:'mohammedwessam2007',authorAssociation:'OWNER',issueNumber:604};

test('owner exact command is admitted with zero effect authority',()=>{
  const out=compileAutonomyCommand({...base,body:' /wake '});
  assert.equal(out.ok,true);
  assert.equal(out.action,'DISPATCH_WAKE');
  assert.equal(out.businessEffectAuthority,'NONE');
  assert.equal(out.externalEffectAuthority,'NONE');
  assert.equal(out.pauseLabel,AUTONOMY_PAUSE_LABEL);
});

test('non-owner, non-owner association, wrong issue and command injection all refuse',()=>{
  const cases=[
    {...base,actor:'attacker',body:'/wake'},
    {...base,authorAssociation:'COLLABORATOR',body:'/wake'},
    {...base,issueNumber:605,body:'/wake'},
    {...base,body:'/wake && curl evil'},
    {...base,body:'/wake\n/resume'},
    {...base,body:'/deploy'}
  ];
  for(const c of cases){const out=compileAutonomyCommand(c);assert.equal(out.ok,false);assert.equal(out.action,'NO_OP');}
});

test('all five founder controls map exactly',()=>{
  const expected={
    '/status':'REPORT_STATUS','/wake':'DISPATCH_WAKE','/pause':'PAUSE_NEW_PULSES','/resume':'RESUME_AND_DISPATCH_WAKE','/help':'REPORT_HELP'
  };
  for(const [body,action] of Object.entries(expected)) assert.equal(compileAutonomyCommand({...base,body}).action,action);
});

test('status output preserves measured reality boundaries instead of inventing readiness',()=>{
  const md=statusMarkdown({paused:true,sourceCommit:'a'.repeat(40),status:{status:'SELF_COMPLETION_LOOP_ARMED',bootstrapAutonomy:{maintainerStatus:'WAITING',continuationStatus:'READY',finiteEngineeringClosure:'NOT_MEASURED',finiteOpenRequirementCount:2,selfCompletionClaim:'NOT_ESTABLISHED_UNTIL_REPEATED_OBSERVED_CYCLES'},graph:{leafCount:1121,orphanRequirementCount:0,floatingLeafCount:0,dependencyCycleCount:0},terminal:{namedRuntimeStatus:'NOT_MEASURED',observedAutonomyStatus:'NOT_MEASURED',externalCommercialStatus:'NOT_MEASURED',asiEvidenceStatus:'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED'},evidence:{terminalRealization:{state:'AVAILABLE'},executionGraph:{state:'AVAILABLE'}}}});
  assert.match(md,/Paused:\*\* YES/);
  assert.match(md,/Finite open requirements:\*\* 2/);
  assert.match(md,/Execution leaves:\*\* 1121/);
  assert.match(md,/NOT_MEASURED/);
  assert.match(md,/SYSTEM_LEVEL_ASI_NOT_ESTABLISHED/);
  assert.match(md,/NOT_ESTABLISHED_UNTIL_REPEATED_OBSERVED_CYCLES/);
});

test('missing terminal or graph evidence cannot render structural zeroes as measured truth',()=>{
  const md=statusMarkdown({status:{bootstrapAutonomy:{finiteOpenRequirementCount:0},graph:{leafCount:0,orphanRequirementCount:0,floatingLeafCount:0,dependencyCycleCount:0},evidence:{terminalRealization:{state:'UNAVAILABLE'},executionGraph:{state:'UNAVAILABLE'}}}});
  assert.match(md,/Finite open requirements:\*\* UNKNOWN/);
  assert.match(md,/Execution leaves:\*\* UNKNOWN/);
  assert.match(md,/Orphans \/ floating \/ cycles:\*\* UNKNOWN \/ UNKNOWN \/ UNKNOWN/);
});

test('help contains only bounded finite-completion controls',()=>{
  const md=helpMarkdown();
  for(const cmd of ['/status','/wake','/pause','/resume','/help']) assert.match(md,new RegExp(cmd.replace('/','\\/')));
  assert.doesNotMatch(md,/\/deploy|\/merge|\/pay|\/send/);
});
