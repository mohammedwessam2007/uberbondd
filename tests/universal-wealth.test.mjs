import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  WEALTH_GRAMMAR,PROHIBITED_WEALTH_PATTERNS,compileEconomicSearchLattice,compileUniversalWealthPortfolio,
  compileSleepWealthCycle,recordWealthOutcome,reallocateWealthCapital,validateWealthMechanism
} from '../src/universal-wealth-engine.mjs';
import {runUniversalWealthJob} from '../src/universal-wealth-job-handler.mjs';
import {startScheduler} from '../src/scheduler.mjs';

const base=(extra={})=>({id:'m1',valueSource:'REVENUE_GAIN',assetForm:'SOFTWARE',captureModel:'SUBSCRIPTION',distribution:'MARKETPLACE',buyerClass:'SMB',evidenceRefs:['e1'],stopConditions:['stop'],policyCleared:true,expectedClearedContribution:1000,probability:.5,downside:50,founderMinutes:10,cashAtRisk:0,timeToCashDays:10,repeatability:.8,defensibility:.7,reversibility:.9,evidenceQuality:.8,optionValue:.8,...extra});

test('wealth grammar spans economic primitives instead of a fixed method list',()=>{
  assert.ok(WEALTH_GRAMMAR.assetForms.length>=10);
  assert.ok(WEALTH_GRAMMAR.captureModels.includes('ROYALTY'));
  assert.ok(WEALTH_GRAMMAR.captureModels.includes('MARKETPLACE_TAKE_RATE'));
  assert.ok(WEALTH_GRAMMAR.distribution.includes('EMBEDDED_DISTRIBUTION'));
});

test('unconditioned lattice creates hypotheses, never income claims',()=>{
  const x=compileEconomicSearchLattice({maxCells:37});
  assert.equal(x.cellCount,37);
  assert.ok(x.cells.every(c=>c.status==='SEARCH_CELL_NOT_BUSINESS'));
});

test('regulated or capital-risk candidate requires explicit regulatory clearance',()=>{
  const x=validateWealthMechanism(base({assetForm:'CAPITAL',captureModel:'YIELD'}));
  assert.equal(x.ok,false);
  assert.ok(x.reasons.includes('regulatory-clearance-required'));
});

test('prohibited patterns are rejected even when economics look attractive',()=>{
  const x=validateWealthMechanism(base({patternFlags:['FRAUD'],expectedClearedContribution:1e9}));
  assert.equal(x.ok,false);
  assert.match(x.reasons.join('|'),/prohibited-pattern/);
  assert.ok(PROHIBITED_WEALTH_PATTERNS.includes('UNAUTHORIZED_ACCESS'));
});

test('portfolio never grants external, trading, or capital authority',()=>{
  const x=compileUniversalWealthPortfolio({candidates:[base()],maxCanaries:3});
  assert.deepEqual(x.canaries,['m1']);
  assert.equal(x.externalEffectAuthority,'NONE');
  assert.equal(x.capitalDeploymentAuthority,'NONE');
  assert.equal(x.tradingAuthority,'NONE');
});

test('unrealized valuation cannot masquerade as money',()=>{
  const x=recordWealthOutcome({mechanismId:'m1',clearedCash:0,acceptedDeliveries:1,founderMinutes:1});
  assert.equal(x.wealthEvidence,false);
  assert.equal(x.contribution,0);
  assert.match(x.truthBoundary,/UNREALIZED_VALUATIONS_DO_NOT/);
});

test('cleared realized contribution can drive allocation',()=>{
  const a=base({id:'a'}), b=base({id:'b'});
  const outcomes=[recordWealthOutcome({mechanismId:'a',clearedCash:500,cashCost:100,founderMinutes:20}),recordWealthOutcome({mechanismId:'b',clearedCash:400,cashCost:50,founderMinutes:5})];
  const x=reallocateWealthCapital({candidates:[a,b],outcomes,maxActive:1});
  assert.deepEqual(x.active,['b']);
  assert.equal(x.capitalDeploymentAuthority,'NONE');
});

test('sleep cycle may search/build/test but cannot autonomously spend, trade, contact, publish, borrow or contract',()=>{
  const x=compileSleepWealthCycle({candidates:[base()],maxSearchCells:12});
  assert.equal(x.searchLattice.cellCount,12);
  assert.equal(x.externalEffectAuthority,'NONE');
  for(const key of ['UNAUTHORIZED_SPEND','UNAUTHORIZED_TRADING','UNAUTHORIZED_BORROWING','UNAUTHORIZED_CUSTOMER_CONTACT','UNAUTHORIZED_PUBLISHING','UNAUTHORIZED_CONTRACTING']) assert.ok(x.prohibitedAutonomy.includes(key));
});

test('resident wealth job works with no private input and persists zero-authority receipt',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'wealth-job-'));
  const r=await runUniversalWealthJob({root,maxSearchCells:11});
  assert.equal(r.searchCellCount,11);
  assert.equal(r.externalEffectAuthority,'NONE');
  const disk=JSON.parse(await fs.readFile(path.join(root,'artifacts/universal-wealth-latest.json'),'utf8'));
  assert.equal(disk.schema,'uberbond.universal-wealth-job.v1');
});

test('private mechanism names and evidence do not leak into persisted receipt',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'wealth-job-'));
  const candidate=base({id:'secret-business',evidenceRefs:['secret-evidence']});
  await fs.mkdir(path.join(root,'private'),{recursive:true});
  await fs.writeFile(path.join(root,'private/universal-wealth-input.json'),JSON.stringify({candidates:[candidate]}));
  await runUniversalWealthJob({root,maxSearchCells:5});
  const raw=await fs.readFile(path.join(root,'artifacts/universal-wealth-latest.json'),'utf8');
  assert.equal(raw.includes('secret-business'),false);
  assert.equal(raw.includes('secret-evidence'),false);
  assert.equal(raw.includes('SUBSCRIPTION'),false);
});

test('job refuses path traversal outside runtime root',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'wealth-job-'));
  await assert.rejects(()=>runUniversalWealthJob({root,inputPath:'../outside.json'}),/must-stay-under-root/);
});

test('autopilot durably schedules one universal wealth occurrence with singleton protection',async()=>{
  const settings={}; const jobs=[];
  const store={getSettings:async()=>structuredClone(settings),setSetting:async(k,v)=>{settings[k]=structuredClone(v);}};
  const queue={store,enqueue:async(type,payload,options)=>{jobs.push({type,payload,options});return{id:String(jobs.length)}}};
  const errors=[]; const stop=startScheduler(queue,{autopilot:true,maxBatch:1,replyPollMinutes:5,discovery:{enabled:false},prometheus:{schedulingEnabled:false},domainMailbox:{schedulingEnabled:false}},{error:(...x)=>errors.push(x)});
  await new Promise(r=>setTimeout(r,20)); stop();
  const wealth=jobs.filter(j=>j.type==='universal.wealth.pulse');
  assert.equal(wealth.length,1);
  assert.equal(wealth[0].payload.maxCapitalAtRisk,0);
  assert.equal(wealth[0].options.singletonKey,'singleton:universal.wealth.pulse');
  assert.equal(errors.length,0);
});
