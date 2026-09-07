#!/usr/bin/env node
import {
  mapClaim,
  classifyUncertainty,
  modelEcology,
  realityVeto,
  abstractionDebt,
  computationalIrreducibility
} from '../src/epistemic-immune-system.mjs';

// Synthetic operator-only contract check. This doctor does not load founder data,
// contact a provider, or create any action/business authority.
const unknown = mapClaim({ claim: 'synthetic claim' });
const uncertainty = classifyUncertainty({
  probabilitiesEstimable: true,
  stateSpaceKnown: true,
  variablesKnown: false
});
const ecology = modelEcology([
  { name: 'fixture-model-a', method: 'REGRESSION', assumptions: 'shared-observational-family' },
  { name: 'fixture-model-b', method: 'REGRESSION', assumptions: 'shared-observational-family' },
  { name: 'fixture-model-c', method: 'CAUSAL_MODEL', assumptions: 'intervention-family' }
]);
const veto = realityVeto({
  claim: 'synthetic model claim',
  internalSupport: ['model agreement', 'elegant reasoning', 'high confidence'],
  contradictedByObservation: 1
});
const debt = abstractionDebt({
  compressed: 'synthetic summary',
  dropped: ['decisive exception'],
  decisionDependsOn: ['decisive exception']
});
const irreducible = computationalIrreducibility({
  question: 'synthetic question with no validated predictive shortcut'
});

const authoritySafe = [unknown, uncertainty, ecology, veto, debt, irreducible]
  .every(result => result?.businessEffectAuthority === 'NONE');

const ok = unknown.ok === true
  && unknown.state === 'UNKNOWN'
  && unknown.isKnowledge === false
  && uncertainty.ok === true
  && uncertainty.uncertaintyClass === 'IGNORANCE'
  && ecology.ok === true
  && ecology.modelCount === 3
  && ecology.distinctMethods === 2
  && ecology.monoculture === false
  && veto.ok === true
  && veto.status === 'MODEL_MUST_BE_REVISED'
  && veto.internalSupportOffsetsObservation === false
  && debt.ok === true
  && debt.status === 'RETURN_TO_RAW_EVIDENCE'
  && irreducible.ok === true
  && irreducible.status === 'REALITY_MUST_COMPUTE_THIS__OBSERVE_OR_EXPERIMENT'
  && authoritySafe;

process.stdout.write(`${JSON.stringify({
  ok,
  status: ok ? 'EPISTEMIC_IMMUNE_DOCTOR_HEALTHY' : 'EPISTEMIC_IMMUNE_DOCTOR_FAILED',
  knowledgeState: unknown.state,
  uncertaintyClass: uncertainty.uncertaintyClass,
  ecology: {
    modelCount: ecology.modelCount,
    distinctMethods: ecology.distinctMethods,
    monoculture: ecology.monoculture
  },
  realityVeto: {
    status: veto.status,
    internalSupportOffsetsObservation: veto.internalSupportOffsetsObservation
  },
  abstractionDebt: debt.status,
  irreducibility: irreducible.status,
  privateFounderDataLoaded: false,
  highestAuthorityCreated: 'NONE',
  businessEffectAuthority: 'NONE',
  truthBoundary: 'SYNTHETIC_OPERATOR_DOCTOR_PROVES_INTERNAL EPISTEMIC CONTRACTS ONLY__IT DOES NOT PROVE ANY CLAIM TRUE'
}, null, 2)}\n`);
if (!ok) process.exitCode = 2;
