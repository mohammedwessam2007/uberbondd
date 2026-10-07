import test from 'node:test';
import assert from 'node:assert/strict';
import { auditOpenRouterCanon } from '../scripts/open-router-canon-doctor.mjs';

test('Open Router vault is current, complete and source-bound',()=>{
  const report=auditOpenRouterCanon();
  assert.equal(report.ok,true,JSON.stringify(report.failures));
  assert.equal(report.status,'OPEN_ROUTER_CANON_CURRENT');
  assert.equal(report.crownBlocker,'crown-admission-absent');
  assert.equal(report.exactRemainingPaidCalls,2);
  assert.equal(report.maximumIncrementalUsd,0.30);
  assert.equal(report.typingMindSavedState,'NOT_VERIFIED_SAVED');
  assert.equal(report.providerCallsPerformed,0);
  assert.equal(report.spendAuthorized,false);
  assert.equal(report.businessEffectAuthority,'NONE');
});

test('manifest is self-excluding and covers every other file',()=>{
  const report=auditOpenRouterCanon();
  assert.equal(report.manifestInventoryCount,report.folderFileCount-1);
});
