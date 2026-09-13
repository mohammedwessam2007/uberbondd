import test from 'node:test';
import assert from 'node:assert/strict';
import { compileEconomicRepairDispatch } from '../src/economic-repair-dispatcher.mjs';

const task=(blockerClass,stage='PAYMENT')=>({pathId:'secret-path',stage,class:blockerClass,actions:['repair'],substituteRailIds:['secret-rail']});

test('internal blocker becomes repair job',()=>{assert.equal(compileEconomicRepairDispatch({autonomousResolutionTasks:[task('INTERNAL_SOLVABLE')]}).jobCount,1);});
test('provider blocker becomes repair job',()=>{assert.equal(compileEconomicRepairDispatch({autonomousResolutionTasks:[task('PROVIDER_OR_RAIL')]}).jobCount,1);});
test('evidence blocker becomes repair job',()=>{assert.equal(compileEconomicRepairDispatch({autonomousResolutionTasks:[task('EVIDENCE_REQUIRED')]}).jobCount,1);});
test('authority blocker is refused',()=>{const x=compileEconomicRepairDispatch({autonomousResolutionTasks:[task('AUTHORITY_REQUIRED')]});assert.equal(x.jobCount,0);assert.equal(x.refusedCount,1);});
test('prohibited blocker is refused',()=>{const x=compileEconomicRepairDispatch({autonomousResolutionTasks:[task('PROHIBITED_OR_IMPOSSIBLE')]});assert.equal(x.jobCount,0);});
test('owner only blockers never dispatch',()=>{const x=compileEconomicRepairDispatch({ownerOnlyBlockers:[task('AUTHORITY_REQUIRED')]});assert.equal(x.jobCount,0);assert.equal(x.refusedCount,1);});
test('private ids are hashed out',()=>{const x=compileEconomicRepairDispatch({autonomousResolutionTasks:[task('INTERNAL_SOLVABLE')]});const s=JSON.stringify(x);assert.equal(s.includes('secret-path'),false);assert.equal(s.includes('secret-rail'),false);});
