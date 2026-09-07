#!/usr/bin/env node
import {
  traceOntologicalCrisis,
  compileOntologyRebuild
} from '../src/ontological-crisis-protocol.mjs';

// Synthetic fixture only. The operator path proves callability without reading
// founder-private state or mutating any runtime authority.
const nodes = [
  { id: 'fixture-assumption', type: 'ASSUMPTION', dependsOn: [] },
  { id: 'fixture-belief', type: 'BELIEF', dependsOn: ['fixture-assumption'] },
  { id: 'fixture-model', type: 'MODEL', dependsOn: ['fixture-belief'] },
  { id: 'fixture-prediction', type: 'PREDICTION', dependsOn: ['fixture-model'] },
  { id: 'fixture-value', type: 'VALUE', dependsOn: ['fixture-prediction'] },
  { id: 'fixture-recommendation', type: 'RECOMMENDATION', dependsOn: ['fixture-prediction', 'fixture-value'] }
];
const crisis = traceOntologicalCrisis({ nodes, failedIds: ['fixture-assumption'], crisisRef: 'fixture:reality-contradiction' });
const plan = compileOntologyRebuild({ nodes, crisis });
const ok = crisis.ok && plan.ok
  && crisis.invalidated.includes('fixture-prediction')
  && crisis.reviewRequired.includes('fixture-value')
  && plan.businessEffectAuthority === 'NONE';

process.stdout.write(`${JSON.stringify({
  ok,
  status: ok ? 'ONTOLOGICAL_CRISIS_DOCTOR_GREEN' : 'ONTOLOGICAL_CRISIS_DOCTOR_FAILED',
  invalidated: crisis.invalidated,
  reviewRequired: crisis.reviewRequired,
  rebuildSteps: plan.steps,
  privateFounderDataLoaded: false,
  businessEffectAuthority: 'NONE'
}, null, 2)}\n`);
if (!ok) process.exitCode = 2;
