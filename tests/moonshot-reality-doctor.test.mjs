import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectMoonshotRealityProgram } from '../src/moonshot-reality-doctor.mjs';
import { REALITY_STATES, HOLDING_OR_TERMINAL_STATES } from '../src/moonshot-reality-compiler.mjs';

function fixture() {
  const canaries = {
    canaries: Array.from({ length: 5 }, (_, i) => ({
      id: `c${i}`,
      realityState: 'IMAGINED',
      firstClaim: 'claim',
      firstProbe: 'probe',
      promotionBlocker: 'not proven'
    }))
  };
  return {
    program: {
      executableCore: 'MOONSHOT_REALITY_COMPILER',
      realityStates: [...REALITY_STATES],
      holdingOrTerminalStates: [...HOLDING_OR_TERMINAL_STATES],
      hardTruth: ['SIMULATION_IS_NOT_PHYSICAL_PROOF'],
      coverageContract: { exactTranscriptImportRequiredForLiteralNoDropRegistry: true }
    },
    registry: {
      program: 'MOONSHOT_REALITY_COMPILER',
      realityStates: [...REALITY_STATES],
      holdingOrTerminalStates: [...HOLDING_OR_TERMINAL_STATES],
      hardTruth: ['REALITY_RETAINS_FINAL_VETO']
    },
    canaries,
    verifiedMechanisms: {
      schemaVersion: 'uberbond.moonshot-verified-child-mechanisms.v1',
      law: 'A_CHILD_MECHANISM_STATE_NEVER_AUTO_PROMOTES_ITS_PARENT_MOONSHOT',
      entries: [{
        id: 'c0/mechanism',
        parentMoonshotId: 'c0',
        truthState: 'SOFTWARE_DEMONSTRATED',
        parentTruthStateAtPromotion: 'IMAGINED',
        parentPromotionIndependent: true,
        externalEffectAuthority: 'NONE',
        promotionHistory: [
          { from:'IMAGINED', to:'FORMALIZED', evidenceKind:'FORMAL_SPEC', evidenceRef:'doc:a' },
          { from:'FORMALIZED', to:'CONSTRAINT_MAPPED', evidenceKind:'CONSTRAINT_MAP', evidenceRef:'doc:b' },
          { from:'CONSTRAINT_MAPPED', to:'PLAUSIBILITY_BOUNDED', evidenceKind:'FEASIBILITY_ASSESSMENT', evidenceRef:'doc:c' },
          { from:'PLAUSIBILITY_BOUNDED', to:'SIMULATION_READY', evidenceKind:'SIMULATION_PROTOCOL', evidenceRef:'doc:d' },
          { from:'SIMULATION_READY', to:'SOFTWARE_DEMONSTRATED', evidenceKind:'SOFTWARE_RECEIPT', evidenceRef:'experiment:e' }
        ],
        replication: { status:'MATCHED', implementationCount:2, mismatches:0 }
      }]
    }
  };
}

test('doctor accepts coherent compiler program plus independently replicated child state', () => {
  const result = inspectMoonshotRealityProgram(fixture());
  assert.equal(result.ok, true);
  assert.equal(result.status, 'MOONSHOT_REALITY_DOCTOR_OK');
  assert.equal(result.counts.verifiedChildMechanisms, 1);
  assert.equal(result.counts.verifiedChildMechanismStates.SOFTWARE_DEMONSTRATED, 1);
  assert.match(result.truthBoundary, /NOT_PARENT_MOONSHOT_FEASIBILITY_OR_EXTERNAL_PROOF/);
});

test('doctor catches missing final veto and promoted canary warnings', () => {
  const x = fixture();
  x.registry.hardTruth = [];
  x.canaries.canaries[1].realityState = 'SOFTWARE_DEMONSTRATED';
  const result = inspectMoonshotRealityProgram(x);
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes('reality-final-veto-missing'));
  assert.ok(result.warnings.includes('canary-not-imagined:c1'));
});

test('doctor rejects child state skipping and missing replication', () => {
  const x = fixture();
  x.verifiedMechanisms.entries[0].promotionHistory = [
    { from:'IMAGINED', to:'SOFTWARE_DEMONSTRATED', evidenceKind:'SOFTWARE_RECEIPT', evidenceRef:'experiment:e' }
  ];
  x.verifiedMechanisms.entries[0].replication = { status:'PENDING', implementationCount:1, mismatches:0 };
  const result = inspectMoonshotRealityProgram(x);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(code => code.includes('verified-mechanism-history-skip')));
  assert.ok(result.errors.some(code => code.includes('verified-mechanism-replication-required')));
});

test('doctor rejects silent parent promotion drift', () => {
  const x = fixture();
  x.verifiedMechanisms.entries[0].parentTruthStateAtPromotion = 'SOFTWARE_DEMONSTRATED';
  const result = inspectMoonshotRealityProgram(x);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(code => code.includes('verified-mechanism-parent-state-mismatch')));
});
