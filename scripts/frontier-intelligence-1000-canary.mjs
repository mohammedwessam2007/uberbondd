#!/usr/bin/env node
import crypto from 'node:crypto';
import {
  FRONTIER_FINAL_RETAINED_TARGET,
  normalizeFrontierIntelligenceRecord,
  extractFrontierMechanismAtoms,
  buildFrontierMillionTournament,
  compileFrontierReproductionExperiment
} from '../src/frontier-intelligence-foundry.mjs';

export const FRONTIER_CANARY_RECORDS = 1000;
const FAMILIES = Object.freeze([
  'reasoning','memory','planning','verification','retrieval','tool-use','multi-agent','metacognition','research','coding',
  'science','causal','forecasting','simulation','optimization','multimodal','context','learning','reflection','orchestration'
]);

function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }

export function buildFrontier1000CanaryInputs({ count = FRONTIER_CANARY_RECORDS, observedAt = '2026-09-14T00:00:00.000Z' } = {}) {
  if (!Number.isInteger(count) || count < 1) throw new Error('positive integer count required');
  return Array.from({ length: count }, (_, index) => {
    const n = index + 1;
    const family = FAMILIES[index % FAMILIES.length];
    return {
      name: `Synthetic Frontier Canary ${String(n).padStart(4, '0')}`,
      sourceUrl: `https://frontier-canary.invalid/record/${n}`,
      sourceClass: 'OTHER_PUBLIC_EVIDENCE',
      publicSource: true,
      provenanceTier: 'P4',
      provenanceConfidence: 0,
      generatingOrAssistingModel: 'SYNTHETIC_TEST_FIXTURE',
      mechanismFamily: family,
      mechanism: `Synthetic ${family} mechanism fixture ${n} used only to exercise UberBond Frontier Intelligence pipeline behavior.`,
      observableClaim: `Fixture ${n} must survive normalization, remain distinct, atomize, and compile a reproduction tournament without gaining execution authority.`,
      evidenceRefs: [`fixture:frontier-canary:${n}`],
      tags: ['synthetic-fixture', 'canary-1000', family],
      reproducibility: 'TEST_FIXTURE',
      licenseStatus: 'UNKNOWN',
      observedAt,
      capabilityAtoms: [{
        id: `canary-${family}-${n}`,
        family,
        verb: 'exercise',
        noun: `${family}-pipeline`,
        description: `Synthetic atom ${n} for ${family} pipeline verification.`,
        inputs: ['fixture'],
        outputs: ['receipt'],
        sideEffectClass: 'NONE'
      }]
    };
  });
}

export function runFrontier1000Canary({ count = FRONTIER_CANARY_RECORDS } = {}) {
  const inputs = buildFrontier1000CanaryInputs({ count });
  const normalized = inputs.map(input => normalizeFrontierIntelligenceRecord(input));
  const failures = normalized.filter(result => !result.ok);
  if (failures.length) return { ok: false, status: 'FRONTIER_1000_CANARY_NORMALIZATION_FAILED', failures };

  const records = normalized.map(result => result.record);
  const tournament = buildFrontierMillionTournament({ records, target: count });
  const atomized = records.map((record, index) => extractFrontierMechanismAtoms({ ...record, capabilityAtoms: inputs[index].capabilityAtoms }));
  const experiments = records.map(record => compileFrontierReproductionExperiment(record));
  const distinctIds = new Set(records.map(record => record.id));
  const allNoAuthority = records.every(record => record.executionAuthority === 'NONE' && record.consequenceAuthority === 'NONE');
  const atomsOk = atomized.every(result => result.ok && result.atoms.length === 1 && result.atoms[0].executionAuthority === 'NONE');
  const experimentsOk = experiments.every(result => result.ok && result.experiment.executionAuthority === 'NONE' && result.experiment.consequenceAuthority === 'NONE');
  const exactCount = records.length === count && distinctIds.size === count && tournament.distinctCapabilityRecords === count && tournament.retainedCapabilityRecords === count;

  const receipt = {
    schemaVersion: 'uberbond.frontier-intelligence.1000-canary.v1',
    syntheticFixture: true,
    requestedRecords: count,
    normalizedRecords: records.length,
    distinctRecords: distinctIds.size,
    retainedRecords: tournament.retainedCapabilityRecords,
    atomizedRecords: atomized.filter(result => result.ok && result.atoms.length === 1).length,
    compiledExperiments: experiments.filter(result => result.ok).length,
    exactCount,
    allNoAuthority,
    immutableRealCorpusTarget: FRONTIER_FINAL_RETAINED_TARGET,
    realCorpusCompletionClaimed: false,
    truthBoundary: 'THIS IS A SYNTHETIC 1000-RECORD FULL-PIPELINE CANARY. IT PROVES PIPELINE CAPACITY AND INVARIANTS ONLY. IT DOES NOT COUNT TOWARD THE REAL ONE-MILLION EVIDENCE-BACKED FRONTIER CORPUS.',
  };
  return {
    ok: exactCount && allNoAuthority && atomsOk && experimentsOk,
    status: exactCount && allNoAuthority && atomsOk && experimentsOk ? 'FRONTIER_1000_CANARY_PASSED' : 'FRONTIER_1000_CANARY_FAILED',
    receipt: { ...receipt, receiptDigest: digest(receipt) },
    tournamentStatus: tournament.status
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = runFrontier1000Canary();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.ok ? 0 : 2);
}
