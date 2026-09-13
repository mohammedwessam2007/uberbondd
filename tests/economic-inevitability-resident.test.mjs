import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runUniversalWealthJob } from '../src/universal-wealth-job-handler.mjs';

const stages=(suffix)=>Object.fromEntries(['OPPORTUNITY','OFFER','DISTRIBUTION','PAYMENT','FULFILLMENT','ACCEPTANCE','RENEWAL','RECONCILIATION'].map(stage=>[stage,{status:'READY',railId:`${stage.toLowerCase()}-${suffix}`,evidenceRefs:['observed']} ]));

function executionPath(id,extra={}){
  return {id,mechanismFamily:`family-${id}`,independenceClass:`class-${id}`,stages:stages(id),successProbability:.3,evidenceQuality:.8,expectedNetContribution:100,...extra};
}

test('resident wealth pulse exposes multipath execution readiness without leaking private path identities',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'wealth-inevitability-'));
  await fs.mkdir(path.join(root,'private'),{recursive:true});
  await fs.writeFile(path.join(root,'private/universal-wealth-input.json'),JSON.stringify({
    executionPaths:[executionPath('secret-alpha'),executionPath('secret-beta'),executionPath('secret-gamma')],
    policyClearedDonorDigests:['private-cleared-mechanism-digest'],
    minimumIndependentPaths:3,
    syntheticSamples:64,
    syntheticIterations:100
  }));
  const receipt=await runUniversalWealthJob({root,maxSearchCells:4,simulationIterations:100,syntheticSamples:64,syntheticIterations:100});
  assert.equal(receipt.economicInevitability.status,'MULTIPATH_EXECUTION_READY_UNPROVEN');
  assert.equal(receipt.economicInevitability.executablePathCount,3);
  assert.equal(receipt.economicInevitability.independentExecutionClassCount,3);
  assert.equal(receipt.economicInevitability.inevitabilityClaimAuthority,'NONE');
  assert.equal(receipt.economicInevitability.moneyClaimAuthority,'NONE');
  const raw=await fs.readFile(path.join(root,'artifacts/universal-wealth-latest.json'),'utf8');
  for(const secret of ['secret-alpha','secret-beta','secret-gamma','private-cleared-mechanism-digest']) assert.equal(raw.includes(secret),false);
});

test('resident wealth pulse surfaces an authority bottleneck instead of pretending the path is executable',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'wealth-inevitability-'));
  await fs.mkdir(path.join(root,'private'),{recursive:true});
  const blocked=executionPath('owner-gated');
  blocked.stages.PAYMENT={status:'BLOCKED_AUTHORITY'};
  await fs.writeFile(path.join(root,'private/universal-wealth-input.json'),JSON.stringify({executionPaths:[blocked],syntheticSamples:64,syntheticIterations:100}));
  const receipt=await runUniversalWealthJob({root,maxSearchCells:4,simulationIterations:100,syntheticSamples:64,syntheticIterations:100});
  assert.equal(receipt.economicInevitability.executablePathCount,0);
  assert.equal(receipt.economicInevitability.ownerOnlyBlockerCount,1);
  assert.equal(receipt.economicInevitability.blockerCounts.AUTHORITY_REQUIRED,1);
  assert.equal(receipt.economicInevitability.status,'THEORY_ONLY');
});

test('resident wealth pulse only records a realized loop after cleared payment and accepted delivery evidence',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'wealth-inevitability-'));
  await fs.mkdir(path.join(root,'private'),{recursive:true});
  const paths=[executionPath('a',{observedClearedPayments:1,acceptedDeliveries:1}),executionPath('b'),executionPath('c')];
  await fs.writeFile(path.join(root,'private/universal-wealth-input.json'),JSON.stringify({executionPaths:paths,syntheticSamples:64,syntheticIterations:100}));
  const receipt=await runUniversalWealthJob({root,maxSearchCells:4,simulationIterations:100,syntheticSamples:64,syntheticIterations:100});
  assert.equal(receipt.economicInevitability.realizedPathCount,1);
  assert.equal(receipt.economicInevitability.status,'RESILIENT_MONEY_LOOP_OBSERVED');
});
