import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateOmegaPrivateEvidence } from '../src/omega-private-evidence-gate.mjs';

const pass = (opts = {}) => ({ passed: true, evidenceRefs: ['private:receipt'], independent: opts.independent === true, replicated: opts.replicated === true });

function fullSet() {
  return {
    semanticCompilation: pass(),
    sealedHiddenHoldouts: pass({ independent: true }),
    crossFamilyTransfer: pass(),
    crossDomainTransfer: pass({ independent: true }),
    verifierIndependence: pass({ independent: true }),
    leakageResistance: pass({ independent: true }),
    fullCostAccounting: pass(),
    robustness: pass(),
    replication: pass({ independent: true, replicated: true }),
    realitySettlement: pass({ independent: true }),
    compoundingReduction: pass(),
    metaGeneralization: pass()
  };
}

test('complete evidence set reaches E10', () => {
  const out = evaluateOmegaPrivateEvidence({ dimensions: fullSet() });
  assert.equal(out.e10, true);
  assert.equal(out.grade, 'E10');
  assert.equal(out.score, 12);
});

test('missing cross-domain evidence blocks E10', () => {
  const dimensions = fullSet();
  dimensions.crossDomainTransfer = { passed: false, evidenceRefs: [], independent: true };
  const out = evaluateOmegaPrivateEvidence({ dimensions });
  assert.equal(out.e10, false);
  assert.ok(out.reasonCodes.includes('crossDomainTransfer:not-passed'));
});

test('critical dimensions require independent checking', () => {
  const dimensions = fullSet();
  dimensions.leakageResistance.independent = false;
  const out = evaluateOmegaPrivateEvidence({ dimensions });
  assert.equal(out.e10, false);
  assert.ok(out.reasonCodes.includes('leakageResistance:independence-required'));
});

test('replication must be reproduced', () => {
  const dimensions = fullSet();
  dimensions.replication.replicated = false;
  const out = evaluateOmegaPrivateEvidence({ dimensions });
  assert.equal(out.e10, false);
  assert.ok(out.reasonCodes.includes('replication:replicated-run-required'));
});
