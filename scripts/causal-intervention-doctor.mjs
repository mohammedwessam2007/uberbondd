#!/usr/bin/env node
import {
  assessCausalEvidence,
  compileNOf1Experiment,
  nOf1Evidence
} from '../src/causal-intervention-ladder.mjs';

// Synthetic, public-safe fixture only. This doctor proves the operator path is
// callable; it never loads founder-private state and cannot execute an
// intervention.
const ladder = assessCausalEvidence([
  { rung: 'CONTROLLED_INTERVENTION', evidenceRef: 'fixture:trial-a', lineage: 'fixture-lineage-a' },
  { rung: 'CONTROLLED_INTERVENTION', evidenceRef: 'fixture:trial-b', lineage: 'fixture-lineage-b' },
  { rung: 'REPLICATION', evidenceRef: 'fixture:replication', lineage: 'fixture-synthesis' }
]);

const protocol = compileNOf1Experiment({
  question: 'Does a reversible synthetic scheduling change alter a synthetic focus metric?',
  intervention: 'synthetic reversible scheduling change',
  outcome: 'synthetic focus metric',
  personRef: 'synthetic-person',
  reversible: true,
  riskClass: 'LOW',
  baselineWindow: 7,
  interventionWindow: 7,
  measurementMethod: 'synthetic predeclared metric',
  confounders: ['synthetic sleep-window marker'],
  stopConditions: ['synthetic stop condition']
});

const personal = nOf1Evidence({
  personRef: 'synthetic-person',
  interventionRef: 'synthetic-schedule-change',
  episodes: [
    { controlled: true, evidenceRef: 'fixture:episode-1', episodeRef: 'fixture-e1', outcomeRef: 'fixture-o1' },
    { controlled: true, evidenceRef: 'fixture:episode-2', episodeRef: 'fixture-e2', outcomeRef: 'fixture-o2' }
  ]
});

const ok = ladder.ok && protocol.ok && personal.ok
  && ladder.causalClaimCeiling === 'REPLICATED_INTERVENTION_EFFECT'
  && personal.causalClaimCeiling === 'PERSONAL_REPLICATED_INTERVENTION_EFFECT'
  && protocol.businessEffectAuthority === 'NONE';

process.stdout.write(`${JSON.stringify({
  ok,
  status: ok ? 'CAUSAL_INTERVENTION_DOCTOR_GREEN' : 'CAUSAL_INTERVENTION_DOCTOR_FAILED',
  ladder: {
    causalClaimCeiling: ladder.causalClaimCeiling,
    independentControlledLineages: ladder.independentControlledLineages
  },
  protocol: {
    status: protocol.status,
    causalClaimCeilingBeforeObservation: protocol.causalClaimCeilingBeforeObservation
  },
  personal: {
    causalClaimCeiling: personal.causalClaimCeiling,
    validPersonalReplication: personal.validPersonalReplication
  },
  privateFounderDataLoaded: false,
  businessEffectAuthority: 'NONE'
}, null, 2)}\n`);

if (!ok) process.exitCode = 2;
