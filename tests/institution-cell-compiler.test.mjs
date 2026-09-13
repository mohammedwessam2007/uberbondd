import test from 'node:test';
import assert from 'node:assert/strict';
import {compileInstitutionCell} from '../src/institution-cell-compiler.mjs';

const candidate=(id,executorClass,overrides={})=>({id,executorClass,capabilities:['parse','score'],evidenceRefs:[`receipt:${id}`],verified:true,authority:'NONE',latencyMs:100,costUsd:0.01,founderMinutes:0,...overrides});

test('chooses minimum sufficient deterministic code instead of proliferating agents',()=>{
  const out=compileInstitutionCell({task:{taskClass:'rank',requiredCapabilities:['parse','score'],maxLatencyMs:1000,maxCostUsd:1,maxFounderMinutes:1},candidates:[candidate('agent','AGENT'),candidate('skill','SKILL'),candidate('code','DETERMINISTIC_CODE')]});
  assert.equal(out.ok,true);
  assert.equal(out.cell.executor.id,'code');
  assert.equal(out.cell.executor.executorClass,'DETERMINISTIC_CODE');
  assert.equal(out.externalEffectAuthority,'NONE');
});

test('falls through code to skill to agent only when earlier classes are insufficient',()=>{
  const out=compileInstitutionCell({task:{taskClass:'rank',requiredCapabilities:['parse','score'],maxLatencyMs:1000,maxCostUsd:1,maxFounderMinutes:1},candidates:[candidate('code','DETERMINISTIC_CODE',{capabilities:['parse']}),candidate('skill','SKILL'),candidate('agent','AGENT')]});
  assert.equal(out.ok,true);
  assert.equal(out.cell.executor.id,'skill');
});

test('unverified or over-budget candidates cannot be selected',()=>{
  const out=compileInstitutionCell({task:{taskClass:'rank',requiredCapabilities:['parse','score'],maxLatencyMs:50,maxCostUsd:0.005,maxFounderMinutes:0},candidates:[candidate('code','DETERMINISTIC_CODE',{verified:false}),candidate('skill','SKILL',{latencyMs:1000,costUsd:2})]});
  assert.equal(out.ok,false);
  assert.ok(out.reasonCodes.includes('no-sufficient-executor-candidate'));
});

test('human gate is selected only for explicitly human-only tasks',()=>{
  const human=candidate('founder','HUMAN_GATE',{authority:'FOUNDER_REQUIRED',founderMinutes:0.5});
  const normal=compileInstitutionCell({task:{taskClass:'choose',requiredCapabilities:['parse','score'],maxLatencyMs:1000,maxCostUsd:1,maxFounderMinutes:1},candidates:[human]});
  assert.equal(normal.ok,false);
  const gated=compileInstitutionCell({task:{taskClass:'choose',requiredCapabilities:['parse','score'],humanOnly:true,maxLatencyMs:1000,maxCostUsd:1,maxFounderMinutes:1},candidates:[human,candidate('agent','AGENT')]});
  assert.equal(gated.ok,true);
  assert.equal(gated.cell.executor.executorClass,'HUMAN_GATE');
});

test('capability never widens authority',()=>{
  const dangerous=candidate('super-agent','AGENT',{authority:'PRODUCTION_DEPLOY'});
  const out=compileInstitutionCell({task:{taskClass:'deploy',requiredCapabilities:['parse','score']},candidates:[dangerous]});
  assert.equal(out.ok,false);
  assert.equal(out.evaluated[0].authorityAllowed,false);
});
