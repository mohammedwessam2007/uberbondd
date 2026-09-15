#!/usr/bin/env node
// Section 310. Run the meta-improvement evaluation over the real generation
// history recorded in artifacts/nullstar-omega/.
import { readFileSync, writeFileSync } from 'node:fs';
import {
  SYMPTOM_KINDS,
  EPISODE_EVIDENCE_CLASSES,
  evaluateSelectionEpisode,
  metaImprovementVerdict,
  NULLSTAR_OMEGA_META_IMPROVEMENT_VERSION
} from '../src/nullstar-omega-meta-improvement.mjs';

const read = path => JSON.parse(readFileSync(path, 'utf8'));
const generation = id => read(`artifacts/nullstar-omega/generations/${id}.json`);
const bottlenecks = id => read(`artifacts/nullstar-omega/bottlenecks-${id}.json`);

// Both symptom kinds are read off the selected bottleneck's own recorded
// symptom, but they are being assigned now, with the successor already
// measured. That makes every episode here retrospective, and the verdict
// treats retrospective episodes as unable to establish success.
const EPISODES = [
  {
    generation: 'G0',
    successorGeneration: 'G1',
    symptomKind: SYMPTOM_KINDS.INSTRUMENT_SATURATED,
    note: 'BN-EVAL-SATURATED: all measured dimensions at 1.0, so the instrument cannot register movement.'
  },
  {
    generation: 'G1',
    successorGeneration: 'G2',
    symptomKind: SYMPTOM_KINDS.INSTRUMENT_SATURATED,
    note: 'BN-EVAL-COVERAGE: the same ceiling, now over more dimensions.'
  },
  {
    generation: 'G2',
    successorGeneration: 'G3',
    symptomKind: SYMPTOM_KINDS.INSTRUMENT_SATURATED,
    evidenceClass: EPISODE_EVIDENCE_CLASSES.PROSPECTIVE,
    bottleneckFrom: 'discriminating-test',
    note: 'BN-EVAL-MEASURES-CONSISTENCY-NOT-CAPABILITY. This one is prospective: the diagnosis was recorded in G2-discriminating-test.json before G3 was built, and G3 was built in response to it.'
  },
  {
    generation: 'G3',
    successorGeneration: 'G4',
    symptomKind: SYMPTOM_KINDS.COVERAGE_INSUFFICIENT,
    evidenceClass: EPISODE_EVIDENCE_CLASSES.PROSPECTIVE,
    note: 'BN-EVAL-COVERAGE. The symptom kind and the resolution criterion were committed in G3-prospective-declaration.json before any G4 code existed, so the ordering is checkable in git rather than asserted here.'
  },
  {
    generation: 'G4',
    successorGeneration: 'G5',
    symptomKind: SYMPTOM_KINDS.COVERAGE_INSUFFICIENT,
    evidenceClass: EPISODE_EVIDENCE_CLASSES.PROSPECTIVE,
    bottleneckFrom: 'g4-declaration',
    note: 'BN-EVAL-COVERAGE again. Declared in G4-prospective-declaration.json before any G5 code existed. G5 attempted forecasting and causality and the evidence-reuse guard refused both: every observation behind them was already scoring another dimension. Coverage held at 10, so the symptom persisted. The process was right to refuse and the symptom is still there; both are true.'
  }
];

const episodes = EPISODES.map(spec => {
  // G2 produced a discriminating test rather than a ranked bottleneck file,
  // so its diagnosis is read from there.
  const selected = spec.bottleneckFrom === 'discriminating-test'
    ? (() => {
        const test = read('artifacts/nullstar-omega/G2-discriminating-test.json');
        return { id: test.diagnosis, symptom: test.discriminatingTest };
      })()
    : spec.bottleneckFrom === 'g4-declaration'
      ? (() => {
          const decl = read('artifacts/nullstar-omega/G4-prospective-declaration.json');
          return { id: decl.bottleneckId, symptom: decl.bottleneckSymptom };
        })()
      : bottlenecks(spec.generation).selected;
  const evaluated = evaluateSelectionEpisode({
    generation: spec.generation,
    successorGeneration: spec.successorGeneration,
    bottleneckId: selected.id,
    symptomKind: spec.symptomKind,
    beforeVector: generation(spec.generation).vector,
    afterVector: generation(spec.successorGeneration).vector,
    evidenceClass: spec.evidenceClass ?? EPISODE_EVIDENCE_CLASSES.RETROSPECTIVE_RECONSTRUCTION
  });
  return { ...evaluated, selectedSymptom: selected.symptom, note: spec.note };
});

const verdict = metaImprovementVerdict(episodes);

for (const row of episodes) {
  console.log(`${row.generation}->${row.successorGeneration} ${row.bottleneckId}: ${row.status}`);
  console.log(`  ${row.why}`);
}
console.log(`\n${verdict.status} resolved=${verdict.resolved ?? 0} persisted=${verdict.persisted ?? 0} movedElsewhere=${verdict.movedElsewhere ?? 0}`);

writeFileSync('artifacts/nullstar-omega/meta-improvement.json', `${JSON.stringify({
  schemaVersion: 'uberbond-nullstar-omega-meta-improvement-1.0.0',
  module: NULLSTAR_OMEGA_META_IMPROVEMENT_VERSION,
  directiveSection: '310',
  generatedAt: new Date().toISOString(),
  episodes,
  // G3 scores its own selfDiagnosis dimension from this file. It reads only
  // episodes whose successor is not G3, so the G2->G3 result cannot feed back
  // into the generation it is about.
  episodesAvailableBeforeG3: episodes.filter(row => row.successorGeneration !== 'G3').length,
  verdict,
  integrityTension: 'G5 scores as a persistence because coverage did not rise, and coverage did not rise because the evidence-reuse guard refused two dimensions that would have been cut from observations already in use. A process that declines to inflate its own metric scores worse here than one that inflates it. That is a real cost of measuring the process this way and it is recorded rather than adjusted away, because adjusting it would make the metric unfalsifiable.',
  finding: 'G0 and G1 both named a saturated instrument and both times the response widened coverage instead of raising difficulty, so the ceiling survived. The G2 diagnosis named the cause -- the corpus was reading values the repository already computed -- and G3 measured observed outcomes instead. That symptom resolved. One prospective resolution is not a working process.',
  truthBoundary: 'EVERY EPISODE HERE IS RETROSPECTIVE. RETROSPECTIVE EVIDENCE CAN SHOW THIS PROCESS FAILING; IT CANNOT SHOW IT SUCCEEDING.',
  businessEffectAuthority: 'NONE'
}, null, 2)}\n`);
