import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runUniversalWealthJob } from '../src/universal-wealth-job-handler.mjs';

const secretMechanism={
  id:'secret-eight-hour-mechanism',
  secretEvidence:'do-not-persist-this',
  policyCleared:true,
  authorityAvailable:true,
  grossIfSuccess:120,
  successProbabilityPerAttempt:.04,
  attemptsPerHour:12,
  settlementProbabilityWithinWindow:.8,
  deliveryAcceptanceProbability:.95,
  netMargin:.9,
  setupHours:.5,
  fixedCost:5,
  cashAtRisk:0,
  capitalLossProbability:0,
  evidenceQuality:.7
};

test('resident wealth pulse persists an eight-hour distribution without leaking private mechanism identity',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'wealth8-resident-'));
  await fs.mkdir(path.join(root,'private'),{recursive:true});
  await fs.writeFile(path.join(root,'private/universal-wealth-input.json'),JSON.stringify({sleepHours:8,simulationIterations:800,sleepMechanisms:[secretMechanism]}));
  const receipt=await runUniversalWealthJob({root,maxSearchCells:11,simulationIterations:800});
  assert.equal(receipt.unknownMechanismFrontier,true);
  assert.ok(BigInt(receipt.openWorldAddressableCombinationCount)>1000000n);
  assert.equal(receipt.eightHourSimulation.status,'EIGHT_HOUR_WEALTH_SIMULATED');
  assert.equal(receipt.eightHourSimulation.moneyClaimAuthority,'NONE');
  assert.ok(receipt.eightHourSimulation.expectedClearedGross>0);
  assert.ok(receipt.eightHourSimulation.p90>=receipt.eightHourSimulation.p50);
  assert.ok(receipt.eightHourSimulation.p50>=receipt.eightHourSimulation.p10);
  const raw=await fs.readFile(path.join(root,'artifacts/universal-wealth-latest.json'),'utf8');
  assert.equal(raw.includes('secret-eight-hour-mechanism'),false);
  assert.equal(raw.includes('do-not-persist-this'),false);
  assert.equal(raw.includes('grossIfSuccess'),false);
});

test('resident pulse with no mechanism assumptions reports zero simulation rather than inventing a dollar forecast',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'wealth8-resident-'));
  const receipt=await runUniversalWealthJob({root,maxSearchCells:7,simulationIterations:500});
  assert.equal(receipt.eightHourSimulation.status,'NO_EXECUTABLE_MECHANISMS_TO_SIMULATE');
  assert.equal(receipt.eightHourSimulation.expectedClearedGross,0);
  assert.equal(receipt.eightHourSimulation.p50,0);
  assert.match(receipt.truthBoundary,/NO SIMULATED_DOLLAR_IS_REVENUE/);
});
