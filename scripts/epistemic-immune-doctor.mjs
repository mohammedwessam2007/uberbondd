#!/usr/bin/env node
import {
  auditEvidenceSet,
  modelEcology,
  immuneVerdict
} from '../src/epistemic-immune-system.mjs';

const audit = auditEvidenceSet({
  claim: 'synthetic claim',
  evidence: [
    { ref: 'fixture:e1', lineage: 'fixture:shared', direction: 'SUPPORTS', counterevidenceSearched: true },
    { ref: 'fixture:e2', lineage: 'fixture:shared', direction: 'SUPPORTS', counterevidenceSearched: true },
    { ref: 'fixture:e3', lineage: 'fixture:independent', direction: 'OPPOSES', counterevidenceSearched: true }
  ],
  selectionProcessDeclared: true
});
const ecology = modelEcology([
  { id: 'fixture-model-a', provider: 'fixture-a', lineage: 'fixture:shared-model-lineage' },
  { id: 'fixture-model-b', provider: 'fixture-b', lineage: 'fixture:shared-model-lineage' },
  { id: 'fixture-model-c', provider: 'fixture-c', lineage: 'fixture:independent-model-lineage' }
]);
const verdict = immuneVerdict({ audit, ecology });
const ok = audit.ok && ecology.ok && verdict.ok
  && audit.independentUsableLineages === 2
  && ecology.independentFailureLineages === 2
  && verdict.businessEffectAuthority === 'NONE';

process.stdout.write(`${JSON.stringify({
  ok,
  status: ok ? 'EPISTEMIC_IMMUNE_DOCTOR_GREEN' : 'EPISTEMIC_IMMUNE_DOCTOR_FAILED',
  audit: {
    risks: audit.risks,
    independentUsableLineages: audit.independentUsableLineages,
    opposeLineages: audit.opposeLineages
  },
  ecology: {
    modelCount: ecology.modelCount,
    providerCount: ecology.providerCount,
    independentFailureLineages: ecology.independentFailureLineages
  },
  verdict: verdict.status,
  privateFounderDataLoaded: false,
  businessEffectAuthority: 'NONE'
}, null, 2)}\n`);
if (!ok) process.exitCode = 2;
