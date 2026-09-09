import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyReachabilityConservation } from '../src/readiness-reachability-conservation.mjs';

test('reachability refusal preserves exact normalized offender paths without granting authority',()=>{
  const out=verifyReachabilityConservation({
    repository:{sourceModules:8},
    reachability:{
      srcModules:8,
      reachableFromProduction:2,
      reachableFromUnattendedOperatorScriptsOnly:2,
      reachableFromFounderInteractiveOnly:2,
      noEntryPointAtAll:2,
      partitionExact:true,
      allClassified:false,
      unclassified:[' src/z.mjs ','src/a.mjs','src/a.mjs'],
      staleClassifications:['src/stale.mjs'],
      founderInteractiveClassificationViolations:['src/private.mjs']
    }
  });
  assert.equal(out.ok,false);
  assert.deepEqual(out.classificationDiagnostics.unclassified,['src/a.mjs','src/z.mjs']);
  assert.deepEqual(out.classificationDiagnostics.staleClassifications,['src/stale.mjs']);
  assert.deepEqual(out.classificationDiagnostics.founderInteractiveClassificationViolations,['src/private.mjs']);
  assert.ok(out.reasonCodes.includes('reachability-unclassified-list-must-be-empty'));
  assert.ok(out.reasonCodes.includes('reachability-founder-classification-violations-must-be-empty'));
  assert.match(out.truthBoundary,/GRANT NO REACHABILITY OR AUTHORITY/);
});
