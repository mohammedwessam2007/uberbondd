import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzePhoenixSwarmPrs} from '../src/phoenix-swarm-pr-overlap.mjs';
const a='a'.repeat(40),b='b'.repeat(40),c='c'.repeat(40);
const at='2026-10-20T10:00:00Z';
const base=(n,files,more={})=>({number:n,state:'open',headSha:n===1?a:b,baseSha:c,files,...more});
const audit=(records)=>analyzePhoenixSwarmPrs(records,{mainSha:c,checkedAt:at});
test('unrelated work has no collisions and never grants merge permission',()=>{
  const x=audit([base(1,['src/a.mjs']),base(2,['src/b.mjs'])]);
  assert.equal(x.ok,true);assert.equal(x.intersectionCount,0);assert.equal(x.autoMergeAllowed,false);
  assert.equal(x.sideEffectBoundary.repositoryWrites,0);
});
test('generated files are marked for regeneration without false duplication',()=>{
  const x=audit([base(1,['docs/CURRENT_SYSTEM_STATE.md','src/a.mjs']),
    base(2,['docs/CURRENT_SYSTEM_STATE.md','src/b.mjs'])]);
  assert.equal(x.generatedOnlyPairs,1);assert.equal(x.sourceOverlapPairs,0);
  assert.match(x.intersections[0].severity,/GENERATED_ONLY/);
});
test('source overlap requires lineage review and retains unique donors',()=>{
  const x=audit([base(1,['src/active.mjs','src/unique.mjs']),base(2,['src/active.mjs'])]);
  assert.equal(x.sourceOverlapPairs,1);assert.deepEqual(x.intersections[0].sourcePaths,['src/active.mjs']);
  assert.equal(x.autoCloseAllowed,false);
});
test('old base is flagged as observation not declared unmergeable',()=>{
  const x=audit([base(1,['a'],{baseSha:a}),base(2,['b'])]);
  assert.equal(x.prs[0].sourceBaseDiffersFromObservedMain,true);
  assert.equal(x.prs[1].sourceBaseDiffersFromObservedMain,false);
});
test('mutable head, duplicate id, bad paths, duplicate files and malformed authority fail closed',()=>{
  for(const rs of [
    [base(1,['src/a'],{headChangedDuringRead:true}),base(2,['src/b'])],
    [base(1,['src/a']),base(1,['src/b'])],
    [base(1,['../private']),base(2,['src/b'])],
    [base(1,['src/a','src/a']),base(2,['src/b'])],
    [base(1,[]),base(2,['src/b'],{headSha:'unverified'})]
  ])assert.equal(audit(rs).ok,false);
});
test('shuffled paths and PR input order produce equivalent collision identity',()=>{
  const x=audit([base(1,['src/a.mjs','docs/CURRENT_SYSTEM_STATE.md']),base(2,['docs/CURRENT_SYSTEM_STATE.md','src/a.mjs'])]);
  const y=audit([base(2,['src/a.mjs','docs/CURRENT_SYSTEM_STATE.md']),base(1,['docs/CURRENT_SYSTEM_STATE.md','src/a.mjs'])]);
  assert.deepEqual(x.intersections,y.intersections);
});
