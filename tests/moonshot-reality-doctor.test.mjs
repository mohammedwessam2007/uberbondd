import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectMoonshotRealityProgram } from '../src/moonshot-reality-doctor.mjs';
import { MOONSHOT_TRUTH_STATES } from '../src/moonshot-reality-compiler.mjs';

function fixture() {
  return {
    program: {
      executableCore: 'MOONSHOT_REALITY_COMPILER',
      hardTruth: ['SIMULATION_IS_NOT_PHYSICAL_PROOF'],
      coverageContract: { exactTranscriptImportRequiredForLiteralNoDropRegistry: true }
    },
    registry: {
      program: 'MOONSHOT_REALITY_COMPILER',
      truthStates: [...MOONSHOT_TRUTH_STATES],
      hardTruth: ['REALITY_RETAINS_FINAL_VETO']
    },
    canaries: {
      canaries: Array.from({ length: 5 }, (_, i) => ({
        id: `c${i}`,
        realityState: 'IMAGINED',
        firstClaim: 'claim',
        firstProbe: 'probe',
        promotionBlocker: 'not proven'
      }))
    }
  };
}

test('doctor accepts coherent compiler program while refusing to call it proof', () => {
  const result = inspectMoonshotRealityProgram(fixture());
  assert.equal(result.ok, true);
  assert.equal(result.status, 'MOONSHOT_REALITY_DOCTOR_OK');
  assert.match(result.truthBoundary, /NOT_MOONSHOT_FEASIBILITY_OR_EXTERNAL_PROOF/);
});

test('doctor catches missing final veto and promoted canary warnings', () => {
  const x = fixture();
  x.registry.hardTruth = [];
  x.canaries.canaries[0].realityState = 'DEMONSTRATED';
  const result = inspectMoonshotRealityProgram(x);
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes('reality-final-veto-missing'));
  assert.ok(result.warnings.includes('canary-not-imagined:c0'));
});
