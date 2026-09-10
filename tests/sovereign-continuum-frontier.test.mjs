import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileSovereignContinuumFrontierDirective, compileSovereignContinuumFrontierTask } from '../src/sovereign-continuum-frontier.mjs';
import { REQUIRED_SOURCE_CONTRACTS } from '../src/sovereign-bootstrap-readiness.mjs';

const BASE='a'.repeat(40);
const finite={ok:true,status:'FINITE_ENGINEERING_ALREADY_CLOSED',taskRequired:false,baseRevision:BASE};
function ledger(partials=[1,10]){
  const set=new Set(partials);
  return{ok:true,status:'GENESIS_EVIDENCE_LEDGER_READY',ideaCount:275,entries:Array.from({length:275},(_,i)=>{const id=i+1;return{id,name:`Idea ${id}`,maturity:set.has(id)?'PARTIAL_PRIMITIVE':'IMPLEMENTED_PRIMITIVE',status:'SOURCE_AND_TEST_PRESENT',sources:[`src/idea-${id}.mjs`],tests:[`tests/idea-${id}.test.mjs`],note:`Bounded evidence for ${id}`};})};
}

test('post-finite frontier cannot open before exact-base finite closure',()=>{
  const out=compileSovereignContinuumFrontierDirective({baseRevision:BASE,finiteDirective:{...finite,status:'FINITE_REQUIREMENT_TARGET_READY'},genesisLedger:ledger()});
  assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('exact-base-finite-engineering-closure-required'));
});

test('frontier walks current partial primitives with a non-authoritative cursor',()=>{
  const first=compileSovereignContinuumFrontierDirective({baseRevision:BASE,finiteDirective:finite,genesisLedger:ledger([1,10])});
  assert.equal(first.ok,true);assert.equal(first.status,'CONTINUUM_FRONTIER_TARGET_READY');assert.equal(first.targetId,1);assert.equal(first.frontierCandidateCount,2);
  const next=compileSovereignContinuumFrontierDirective({baseRevision:BASE,finiteDirective:finite,genesisLedger:ledger([1,10]),afterTargetId:1});
  assert.equal(next.targetId,10);
  const wrapped=compileSovereignContinuumFrontierDirective({baseRevision:BASE,finiteDirective:finite,genesisLedger:ledger([1,10]),afterTargetId:10});
  assert.equal(wrapped.targetId,1);
});

test('frontier refuses a ledger that only claims 275 without carrying 275 unique rows',()=>{
  const malformed=ledger([1]);malformed.entries=malformed.entries.slice(0,274);
  const out=compileSovereignContinuumFrontierDirective({baseRevision:BASE,finiteDirective:finite,genesisLedger:malformed});
  assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('exact-current-genesis-evidence-ledger-required'));
  const duplicate=ledger([1]);duplicate.entries[274]={...duplicate.entries[0]};
  assert.equal(compileSovereignContinuumFrontierDirective({baseRevision:BASE,finiteDirective:finite,genesisLedger:duplicate}).ok,false);
});

test('no eligible partial primitive is a truthful stopping rule, not an excuse to invent code',()=>{
  const out=compileSovereignContinuumFrontierDirective({baseRevision:BASE,finiteDirective:finite,genesisLedger:ledger([])});
  assert.equal(out.ok,true);assert.equal(out.taskRequired,false);assert.equal(out.status,'CONTINUUM_FRONTIER_AWAITS_NEW_EVIDENCE');
});

test('frontier task is bounded local preparation and cannot relabel the scoreboard',()=>{
  const directive=compileSovereignContinuumFrontierDirective({baseRevision:BASE,finiteDirective:finite,genesisLedger:ledger([10]),afterTargetId:1});
  const task=compileSovereignContinuumFrontierTask({directive,date:new Date('2026-09-10T12:00:00Z')});
  assert.equal(task.ok,true);assert.equal(task.consequenceClass,'LOCAL_PREPARATION');assert.equal(task.targetAgent,'local-sovereign-model');
  assert.ok(task.constraints.includes('continuum-frontier-mode'));assert.ok(task.constraints.includes('continuum-frontier-target:10'));assert.ok(task.constraints.includes('behavior-change-not-scoreboard-relabel'));
  assert.ok(task.forbiddenActions.includes('edit-terminal-north-star'));assert.ok(task.forbiddenActions.includes('edit-genesis-evidence-or-maturity'));
  assert.deepEqual(task.acceptanceTests,['npm run check:syntax','npm run test:deterministic']);
});

test('founder wake, doctor and isolated worker are wired to the Continuum gear',()=>{
  const authorctl=readFileSync(new URL('../ops/sovereign/uberbond-authorctl',import.meta.url),'utf8');
  const worker=readFileSync(new URL('../scripts/sovereign-native-local-model-worker.mjs',import.meta.url),'utf8');
  const doctor=readFileSync(new URL('../scripts/sovereign-bootstrap-doctor.mjs',import.meta.url),'utf8');
  assert.match(authorctl,/scripts\/sovereign-continuum-pulse\.mjs/);
  assert.match(worker,/continuum-frontier-target/);assert.match(worker,/GENESIS_IMPLEMENTATION_EVIDENCE/);assert.match(worker,/SOVEREIGN_COGNITIVE_CONTINUUM_TOTAL_NORTH_STAR/);
  assert.ok(REQUIRED_SOURCE_CONTRACTS.includes('continuumPulse'));assert.match(doctor,/continuumPulse:'scripts\/sovereign-continuum-pulse\.mjs'/);
});
