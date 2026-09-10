import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { compileSandwichDescendantAdmission, SANDWICH_DESCENDANT_CANON_PATH } from '../src/sandwich-descendant-admission.mjs';

const git=(args)=>execFileSync('git',args,{encoding:'utf8'}).trim();

test('an uncommitted descendant-canon mutation can only be one trusted append',()=>{
  const diff=git(['diff','--',SANDWICH_DESCENDANT_CANON_PATH]);
  if(!diff)return;
  const head=git(['rev-parse','HEAD']).toLowerCase();
  const before=JSON.parse(execFileSync('git',['show',`HEAD:${SANDWICH_DESCENDANT_CANON_PATH}`],{encoding:'utf8'}));
  const after=JSON.parse(readFileSync(new URL(`../${SANDWICH_DESCENDANT_CANON_PATH}`,import.meta.url),'utf8'));
  assert.equal(after.terminalConcepts.length,before.terminalConcepts.length+1,'only one canonical concept may be admitted per Sandwich genesis');
  const entry=after.terminalConcepts.at(-1);
  assert.equal(entry?.kind,'SANDWICH_DESCENDANT_REQUIREMENT');
  const candidate={
    name:entry.name,
    foldClass:entry.foldClass,
    canonicalGoalRefs:entry.canonicalGoalRefs,
    dependencies:entry.dependencies,
    acceptanceEvidence:entry.acceptanceEvidence,
    rationale:entry.rationale
  };
  const compiled=compileSandwichDescendantAdmission({beforeDocument:before,candidate,baseRevision:head});
  assert.equal(compiled.ok,true,JSON.stringify(compiled.reasonCodes||[]));
  assert.deepEqual(after,compiled.afterDocument,'trusted append compiler must reconstruct the exact working-tree canon mutation');
});
