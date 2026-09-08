#!/usr/bin/env node
import { compileInstitutionalFinancialLedger, admitInstitutionalEffect, reconcileInstitutionalEvidence } from '../src/institutional-financial-sovereignty.mjs';

const now='2026-09-09T00:00:00.000Z';
const compiled=compileInstitutionalFinancialLedger({
  now,
  entity:{entityRef:'synthetic:entity',legalName:'Synthetic Owner Operation',entityType:'SYNTHETIC',jurisdictionRefs:['TEST']},
  obligations:[{
    id:'synthetic-obligation',kind:'TEST_FILING',jurisdiction:'TEST',accountableRole:'OWNER',sourceRef:'synthetic:source',sourceDate:'2026-09-01',validThrough:'2026-12-31',dueEvent:'synthetic due event',preEffectRequiredClasses:['COMPLIANCE_EVIDENCE','LEGAL_AUTHORITY'],postEffectRequiredClasses:['ACTUAL_FILING_OR_PAYMENT'],declaredAmountCents:100,currency:'TST',evidence:[
      {evidenceClass:'COMPLIANCE_EVIDENCE',evidenceRef:'synthetic:compliance',origin:'EXTERNAL',observedAt:now},
      {evidenceClass:'LEGAL_AUTHORITY',evidenceRef:'synthetic:authority',origin:'EXTERNAL',observedAt:now}
    ]
  }],
  treasury:{availableCashCents:10000,reservedCashCents:1000,committedObligationsCents:1000,reserveFloorCents:2000,maxSingleProcurementCents:1000,currency:'TST'},
  reconciliations:[{id:'synthetic-reconciliation',bookNetCents:5000,externalNetCents:5000,toleranceCents:0,currency:'TST',evidenceRef:'synthetic:statement'}]
});
const admission=admitInstitutionalEffect({compiled,action:{kind:'TEST_FILING',amountCents:100,currency:'TST',obligationIds:['synthetic-obligation']}});
const fakeActual=reconcileInstitutionalEvidence({compiled,obligationId:'synthetic-obligation',evidence:{evidenceClass:'ACTUAL_FILING_OR_PAYMENT',evidenceRef:'synthetic:internal-fake',origin:'INTERNAL',observedAt:now,amountCents:100,currency:'TST'}});
const ok=compiled.ok===true
  && compiled.ledger.obligations[0].status==='READY_FOR_EFFECT_GATE__POST_EVIDENCE_PENDING'
  && admission.status==='READY_FOR_SEPARATE_EFFECT_AUTHORITY_GATE'
  && admission.businessEffectAuthority==='NONE'
  && fakeActual.ok===false;
console.log(JSON.stringify({ok,status:ok?'C25_TRUTH_BOUNDARIES_HELD':'C25_BOUNDARY_LOST',institutionalStatus:compiled.status,obligationStatus:compiled.ledger.obligations[0].status,actionAdmission:admission.status,fakeActualEvidenceStatus:fakeActual.status,businessEffectAuthority:'NONE',externalEffects:{providerCalls:0,spendCents:0,paymentMutations:0,customerMessages:0},note:'Synthetic zero-effect doctor only. It does not create legal authority, compliance clearance, filing, payment, contract, procurement, tax treatment or professional opinion.'},null,2));
if(!ok)process.exitCode=1;
