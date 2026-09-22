#!/usr/bin/env node
import { compileGenesisEscalationDecision, compileGenesisEscalationPortfolio } from '../src/genesis-escalation-tribunal.mjs';

const receipt={ok:true,result:{
  unresolved:['Whether the mechanism works on a fixed held-out task population.'],
  strongestCounterexamples:['baseline leakage'],
  confidence:.68
}};
const pure={
  candidateId:'genesis-candidate-doctor-tribunal',
  title:'Doctor pure-software candidate',
  utility:.95,testability:.94,reversibility:.98,
  substrateNeeds:['QUEUE','CHECKPOINTING']
};
const physical={...pure,candidateId:'genesis-candidate-doctor-physical',substrateNeeds:['UBERWATT','THERMAL_TELEMETRY']};
const semanticReceipt={ok:true,result:{...receipt.result,unresolved:['Supplier quality, latency, and coordination overhead must be measured on the actual runtime.']}};

const rows=[
  compileGenesisEscalationDecision({candidate:pure,cognitionReceipt:receipt}),
  compileGenesisEscalationDecision({candidate:physical,cognitionReceipt:receipt}),
  compileGenesisEscalationDecision({candidate:{...pure,candidateId:'genesis-candidate-doctor-semantic'},cognitionReceipt:semanticReceipt,paidProviderEnabled:false})
];
const portfolio=compileGenesisEscalationPortfolio({rows,limit:3});
const ok=portfolio.ok
  && rows[0].decision==='IMPLEMENT_NOW'
  && rows[1].decision==='WAIT_REALITY_EVIDENCE'
  && rows[2].decision==='WAIT_PAID_SEMANTIC_AUTHORITY'
  && rows.every(r=>r.externalEffectAuthority==='NONE');

console.log(JSON.stringify({
  ok,
  status:ok?'GENESIS_ESCALATION_TRIBUNAL_HEALTHY':'GENESIS_ESCALATION_TRIBUNAL_INVALID',
  decisions:rows.map(r=>({candidateId:r.candidateId,decision:r.decision,score:r.score})),
  executionAuthority:portfolio.executionAuthority||'NONE'
},null,2));
if(!ok) process.exitCode=1;
