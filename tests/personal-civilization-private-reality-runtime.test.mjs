import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { normalizePrivateRecord } from '../src/personal-civilization-core.mjs';
import { loadPrivateState, savePrivateState } from '../src/personal-civilization-private-operator.mjs';
import { runPrivateRealityCommand } from '../scripts/personal-civilization-private.mjs';

const OWNER = { subject: 'FOUNDER', grant: 'PRIVATE_LIFE_STATE', issuedAt: '2026-09-09T00:00:00.000Z' };
const KEY = 'a'.repeat(64);
const AT = '2026-09-09T00:00:00.000Z';

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uberbond-pce-reality-'));
  const file = path.join(dir, 'life-state.json');
  const root = normalizePrivateRecord({ kind: 'LIFE_EVENT', body: 'synthetic source private event', occurredAt: '2026-09-08T23:00:00.000Z' }).record;
  const seeded = savePrivateState({
    state: { schemaVersion: 'uberbond.personal-civilization-private-state.v1', records: [root], hypotheses: [], edges: [], updatedAt: null },
    filePath: file, authorization: OWNER, privateKey: KEY, now: AT
  });
  assert.equal(seeded.ok, true);
  return { dir, file, root };
}

function startCommand(rootId) {
  return {
    action: 'START_REALITY_CYCLE', sourceRecordIds: [rootId],
    scientificExperiment: {
      founderSelection: { chosenByFounder: true, possibility: 'explore a different working environment', selectedAt: AT, evidenceRef: 'private:synthetic:selection' },
      requiredCapabilities: ['deep work'], capabilities: [],
      experience: { uncertainty: 'whether the environment improves deep work', smallestReversibleExperience: 'work for one hour in the alternate environment using the same task', wouldReveal: 'whether focus and friction materially change', wouldFalsify: 'no meaningful difference under matched task conditions', reversible: true, cost: 'none', time: 'one hour', costCents: 0, timeMinutes: 60, effects: [] },
      hypotheses: [ { id: 'environment-matters', predictedObservations: ['focus improves', 'friction falls'] }, { id: 'environment-does-not-matter', predictedObservations: ['focus unchanged', 'friction unchanged'] } ],
      budget: { maxCostCents: 0, maxTimeMinutes: 90, maxDeclaredEffects: 0 },
      voi: { unit: 'decision-loss-points', budgetUnits: 10, currentEvidenceSufficient: false, observe: { canChangeDecision: true, discriminating: true, informationValueUnits: 9, costUnits: 1, delayCostUnits: 1, optionDecayUnits: 0, requiresExternalEffect: false }, defer: { informationGainUnits: 1, delayCostUnits: 1, optionDecayUnits: 1, windowRemainsOpen: true } }
    },
    decision: { statement: 'which working environment should I use for focused work', options: [ { name: 'current', scores: { meaning: 0.7, financial_cost: 0.2 } }, { name: 'alternate', scores: { meaning: 0.8, financial_cost: 0.1 } } ], keyAssumptions: ['same task difficulty'], updateConditions: ['new observed focus evidence'] },
    founderChoice: { chosenByFounder: true, option: 'alternate', evidenceRef: 'private:synthetic:choice', chosenAt: AT },
    choiceForecast: { probabilities: { yes: 0.6, no: 0.4 }, evidenceCutoff: AT, method: 'bounded personal experiment', assumptions: ['same task difficulty'] }
  };
}

test('start persists the cycle in the existing authenticated private vault and returns no raw private body', () => {
  const f=fixture(); try { const result=runPrivateRealityCommand({command:startCommand(f.root.id),authorization:OWNER,privateKey:KEY,filePath:f.file,now:AT}); assert.equal(result.ok,true); assert.equal(result.status,'PCE_PRIVATE_REALITY_WAITING_FOR_OBSERVED_OUTCOME'); assert.equal(result.encryption,'AES-256-GCM'); assert.equal(result.privateDataReturned,false); assert.ok(result.recordIds.forecast); assert.equal(JSON.stringify(result).includes('synthetic source private event'),false); assert.equal(JSON.stringify(result).includes('which working environment'),false); const raw=fs.readFileSync(f.file,'utf8'); assert.equal(raw.includes('synthetic source private event'),false); assert.equal(raw.includes('which working environment'),false); } finally { fs.rmSync(f.dir,{recursive:true,force:true}); }
});

test('a later process reloads ciphertext, closes the persisted forecast, and saves calibration durably', () => {
  const f=fixture(); try { const started=runPrivateRealityCommand({command:startCommand(f.root.id),authorization:OWNER,privateKey:KEY,filePath:f.file,now:AT}); assert.equal(started.ok,true); const closed=runPrivateRealityCommand({command:{action:'CLOSE_REALITY_CYCLE',forecastRecordId:started.recordIds.forecast,observedOutcome:{value:'yes',observedAt:'2026-10-09T00:00:00.000Z',evidenceRef:'private:synthetic:observed',availableAtTime:['same task difficulty']}},authorization:OWNER,privateKey:KEY,filePath:f.file,now:'2026-10-09T00:01:00.000Z'}); assert.equal(closed.ok,true); assert.equal(closed.status,'PCE_PRIVATE_REALITY_CYCLE_REHYDRATED_AND_CLOSED'); assert.equal(closed.calibration.observed,'yes'); assert.ok(closed.recordIds.outcome); const loaded=loadPrivateState({filePath:f.file,authorization:OWNER,privateKey:KEY}); assert.equal(loaded.ok,true); assert.ok(loaded.state.records.some(row=>row.id===closed.recordIds.outcome)); } finally { fs.rmSync(f.dir,{recursive:true,force:true}); }
});

test('wrong private key cannot use the reality runtime as a decryption oracle', () => { const f=fixture(); try { const result=runPrivateRealityCommand({command:startCommand(f.root.id),authorization:OWNER,privateKey:'b'.repeat(64),filePath:f.file,now:AT}); assert.equal(result.ok,false); assert.equal(result.status,'PRIVATE_STATE_READ_REFUSED'); assert.ok(result.reasonCodes.includes('private-state-authentication-failed')); assert.equal(Object.hasOwn(result,'state'),false); } finally { fs.rmSync(f.dir,{recursive:true,force:true}); } });
test('runtime cannot be invoked without founder private-state authorization', () => { const f=fixture(); try { const result=runPrivateRealityCommand({command:startCommand(f.root.id),authorization:null,privateKey:KEY,filePath:f.file,now:AT}); assert.equal(result.ok,false); assert.equal(result.status,'PRIVATE_STATE_FOUNDER_AUTHORITY_REQUIRED'); } finally { fs.rmSync(f.dir,{recursive:true,force:true}); } });
test('runtime accepts no network or generic execute action', () => { const result=runPrivateRealityCommand({command:{action:'EXECUTE_EXPERIMENT'},authorization:OWNER,privateKey:KEY}); assert.equal(result.ok,false); assert.equal(result.status,'PCE_PRIVATE_REALITY_RUNTIME_REFUSED'); assert.equal(result.businessEffectAuthority,'NONE'); assert.equal(result.externalEffectLedger.providerCalls,0); });
