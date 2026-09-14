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
  }
];

const episodes = EPISODES.map(spec => {
  const selected = bottlenecks(spec.generation).selected;
  const evaluated = evaluateSelectionEpisode({
    generation: spec.generation,
    successorGeneration: spec.successorGeneration,
    bottleneckId: selected.id,
    symptomKind: spec.symptomKind,
    beforeVector: generation(spec.generation).vector,
    afterVector: generation(spec.successorGeneration).vector,
    evidenceClass: EPISODE_EVIDENCE_CLASSES.RETROSPECTIVE_RECONSTRUCTION
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
  verdict,
  finding: verdict.status === 'IMPROVEMENT_PROCESS_NOT_WORKING'
    ? 'Both selections named a saturated instrument and both times the response widened coverage instead of raising difficulty. The ceiling survived both.'
    : 'See verdict.',
  truthBoundary: 'EVERY EPISODE HERE IS RETROSPECTIVE. RETROSPECTIVE EVIDENCE CAN SHOW THIS PROCESS FAILING; IT CANNOT SHOW IT SUCCEEDING.',
  businessEffectAuthority: 'NONE'
}, null, 2)}\n`);
