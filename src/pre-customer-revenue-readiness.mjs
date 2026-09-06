import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { FIRST_CASH_QUESTIONS, FIRST_CASH_CANARY_PACKET_VERSION } from './first-cash-canary-packet.mjs';
import { PAYMENT_RENEWAL_TRUTH_VERSION } from './payment-renewal-truth.mjs';

export const PRE_CUSTOMER_REVENUE_READINESS_VERSION='uberbond.pre-customer-revenue-readiness.v1.0.1';
const zero=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
const digest=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
function fail(reasonCodes,extra={}){return{ok:false,status:'PRE_CUSTOMER_READINESS_DENIED',reasonCodes:[...new Set(reasonCodes.filter(Boolean))],businessEffectAuthority:'NONE',externalEffectLedger:zero(),...extra};}

const STAGE_QUESTIONS=Object.freeze({
  DISTRIBUTION:['CAN_WE_CONTACT','WHO','WHY','WHICH_SENDER','WHICH_PROVIDER','WHICH_POLICY_EVIDENCE','WHICH_AUTHORITY','ON_REPLY','ON_BOUNCE','ON_COMPLAINT','ON_UNCERTAIN_SEND','AFTER_FIVE_CONVERSATIONS'],
  OFFER:['WHAT_OFFER','WHAT_PRICE'],
  PAYMENT:['WHAT_PAYMENT_LINK','HOW_RECONCILED','ON_REFUND_OR_DISPUTE'],
  FULFILMENT:['HOW_DELIVERED'],
  ACCEPTANCE:['HOW_ACCEPTED']
});

function classify(question){
  if(['ANSWERED','PREPARED'].includes(question.status)) return 'SOFTWARE_READY_OR_PREPARED';
  if(question.status==='EXTERNAL_PROOF_REQUIRED') return 'EXTERNAL_PROOF_REQUIRED';
  if(question.status==='OWNER_ACTION_REQUIRED') return 'OWNER_AUTHORITY_REQUIRED';
  if(question.status==='BLOCKED'){
    if(['OWNER_DECISION','OWNER_ATTESTATION'].includes(question.evidenceClass)) return 'OWNER_AUTHORITY_REQUIRED';
    if(['PROVIDER_POLICY_RESEARCH','EXTERNAL_PAYMENT','EXTERNAL_CUSTOMER'].includes(question.evidenceClass)) return 'EXTERNAL_PROOF_REQUIRED';
    return 'CONFIG_OR_PROVIDER_REQUIRED';
  }
  return 'UNCLASSIFIED';
}
function expectedPacketId(packet){
  if(!packet?.generatedAt||!packet?.gates)return null;
  return `firstcash_${digest({version:FIRST_CASH_CANARY_PACKET_VERSION,atIso:packet.generatedAt,gates:packet.gates}).slice(0,24)}`;
}
function validateFirstCashPacket(packet){
  const reasons=[];
  if(!packet?.ok||!Array.isArray(packet.questions))reasons.push('valid-first-cash-packet-required');
  if(packet?.schemaVersion!=='uberbond-first-cash-canary-packet-1.4.0'||packet?.policyVersion!==FIRST_CASH_CANARY_PACKET_VERSION)reasons.push('canonical-first-cash-schema-version-required');
  if(packet?.packetId!==expectedPacketId(packet))reasons.push('first-cash-packet-id-integrity-mismatch');
  const ids=Array.isArray(packet?.questions)?packet.questions.map(q=>q?.question):[];
  const unique=new Set(ids);
  const missing=FIRST_CASH_QUESTIONS.filter(id=>!unique.has(id));
  const unexpected=[...unique].filter(id=>!FIRST_CASH_QUESTIONS.includes(id));
  if(missing.length)reasons.push('first-cash-question-coverage-incomplete');
  if(unexpected.length)reasons.push('unexpected-first-cash-question');
  if(ids.length!==FIRST_CASH_QUESTIONS.length||unique.size!==FIRST_CASH_QUESTIONS.length)reasons.push('first-cash-question-set-must-be-exact-and-unique');
  const truth=packet?.commercialTruth||{};
  if(Number(truth.realCustomers)!==0||Number(truth.clearedRevenueCents)!==0||Number(truth.acceptedPaidDeliveries)!==0||Number(truth.retainedCustomers)!==0)reasons.push('pre-customer-commercial-truth-must-remain-zero');
  if(packet?.businessEffectAuthority!=='NONE')reasons.push('first-cash-business-authority-must-remain-none');
  return {reasons,missing,unexpected};
}

function lifecycleContracts(){
  return [
    {
      stage:'RENEWAL',
      softwareStatus:'SOFTWARE_READY',
      canonicalModule:'src/payment-renewal-truth.mjs',
      canonicalPolicyVersion:PAYMENT_RENEWAL_TRUTH_VERSION,
      externalTruthStatus:'EXTERNAL_PROOF_REQUIRED',
      requiredExternalProof:'PROVIDER_CLEARED_RENEWAL_PROOF',
      truthBoundary:'SECOND_PAYMENT_OR_RENEWAL_IS_NOT_PROVEN_BY_SOFTWARE_PRESENCE'
    },
    {
      stage:'RETENTION',
      softwareStatus:'SOFTWARE_READY',
      canonicalModule:'src/payment-renewal-truth.mjs',
      canonicalPolicyVersion:PAYMENT_RENEWAL_TRUTH_VERSION,
      externalTruthStatus:'EXTERNAL_PROOF_REQUIRED',
      requiredExternalProof:'CLEARED_PAYMENT_NOT_FULLY_REVERSED_PLUS_REQUIRED_CUSTOMER_LIFECYCLE_EVIDENCE',
      truthBoundary:'RETENTION_OR_RETAINED_REVENUE_IS_NOT_PROVEN_BY_SOFTWARE_PRESENCE'
    }
  ];
}

export function compilePreCustomerRevenueReadiness({firstCashPacket}={}){
  const validation=validateFirstCashPacket(firstCashPacket);
  if(validation.reasons.length)return fail(validation.reasons,{missingQuestions:validation.missing,unexpectedQuestions:validation.unexpected});
  const rows=firstCashPacket.questions.map(q=>({question:q.question,classification:classify(q),status:q.status,evidenceClass:q.evidenceClass,module:q.module,reasonCodes:[...(q.reasonCodes||[])]}));
  const stageRows=Object.entries(STAGE_QUESTIONS).map(([stage,ids])=>{
    const items=rows.filter(row=>ids.includes(row.question));
    const blocking=items.filter(row=>row.classification!=='SOFTWARE_READY_OR_PREPARED');
    return{stage,status:blocking.length?'EXTERNAL_OR_CONFIGURATION_GATED':'SOFTWARE_READY',questionCount:items.length,softwareReadyCount:items.length-blocking.length,blockers:blocking.map(row=>({question:row.question,classification:row.classification,reasonCodes:row.reasonCodes}))};
  });
  const lifecycle=lifecycleContracts();
  for(const contract of lifecycle){
    stageRows.push({stage:contract.stage,status:'EXTERNAL_PROOF_GATED',questionCount:0,softwareReadyCount:1,blockers:[{question:null,classification:'EXTERNAL_PROOF_REQUIRED',reasonCodes:[contract.requiredExternalProof]}],canonicalModule:contract.canonicalModule,canonicalPolicyVersion:contract.canonicalPolicyVersion});
  }
  const counts=rows.reduce((acc,row)=>{acc[row.classification]=(acc[row.classification]||0)+1;return acc;},{});
  const matrix={schemaVersion:PRE_CUSTOMER_REVENUE_READINESS_VERSION,sourcePacketId:firstCashPacket.packetId,sourcePolicyVersion:firstCashPacket.policyVersion,canContact:firstCashPacket.canContact===true,commercialTruth:{realCustomers:0,clearedRevenueCents:0,acceptedPaidDeliveries:0,retainedCustomers:0},counts,stages:stageRows,lifecycleContracts:lifecycle,questions:rows,softwareCompleteForKnownInternalQuestions:rows.every(row=>row.classification!=='UNCLASSIFIED')&&lifecycle.every(item=>item.softwareStatus==='SOFTWARE_READY'),externalActivationRequired:rows.some(row=>row.classification!=='SOFTWARE_READY_OR_PREPARED')||lifecycle.some(item=>item.externalTruthStatus==='EXTERNAL_PROOF_REQUIRED'),truthBoundary:'SOFTWARE_READINESS_NEVER_CREATES_CUSTOMERS_CLEARED_REVENUE_ACCEPTED_DELIVERY_RENEWAL_OR_RETENTION;_EXTERNAL_STATES_REQUIRE_INDEPENDENT_EVIDENCE',businessEffectAuthority:'NONE',externalEffectLedger:zero()};
  return{ok:true,status:'PRE_CUSTOMER_REVENUE_READINESS_COMPILED',matrix,matrixDigest:digest(matrix),businessEffectAuthority:'NONE',externalEffectLedger:zero()};
}
