import crypto from 'node:crypto';
import {proveReferenceEconomics,validateProvableWorkItem} from './provable-reference-economics.mjs';
export const PROVABLE_EXECUTION_LEDGER_SCHEMA='uberbond.provable-execution-ledger.v1';
const sha=x=>'sha256:'+crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const digest=x=>typeof x==='string'&&/^sha256:[0-9a-f]{64}$/.test(x);
export function createProvableExecutionLedger({period}={}){if(!/^\d{4}-\d{2}$/.test(String(period||'')))throw new Error('period-required');return{schemaVersion:PROVABLE_EXECUTION_LEDGER_SCHEMA,period,executions:[]};}
export function appendProvableExecution(ledger,receipt={}){
 if(ledger?.schemaVersion!==PROVABLE_EXECUTION_LEDGER_SCHEMA)throw new Error('provable-execution-ledger-required');
 if(!receipt.executionId||!receipt.taskId||!receipt.completedAt||!receipt.referenceContractHash||!digest(receipt.referenceContractHash))throw new Error('bound-execution-receipt-required');
 if(String(receipt.completedAt).slice(0,7)!==ledger.period)throw new Error('execution-period-binding-required');
 if(sha(receipt.directReference)!==receipt.referenceContractHash)throw new Error('reference-contract-hash-mismatch');
 if(!digest(receipt.directReference?.promptHash)||!digest(receipt.directReference?.matchedOutputHash)||!digest(receipt.directReference?.tokenizerHash)||!receipt.directReference?.tokenizerReceiptRef)throw new Error('tokenized-counterfactual-binding-required');
 if(ledger.executions.some(x=>x.executionId===receipt.executionId))throw new Error('duplicate-provable-execution-id');
 const item={id:receipt.executionId,equivalenceClass:receipt.equivalenceClass,proofVerified:receipt.proofVerified,matchedObligationHash:receipt.matchedObligationHash,
  qualityContractHash:receipt.qualityContractHash,proofRef:receipt.proofRef,executionCount:1,directReference:receipt.directReference};
 const v=validateProvableWorkItem(item);if(!v.ok)throw new Error('unprovable-execution:'+v.reasons.join(','));
 const normalized={...receipt,economicAuthority:'E0_E4_PROOF_PLUS_COUNTERFACTUAL_ARITHMETIC',executionReceiptHash:null};
 normalized.executionReceiptHash=sha({...normalized,executionReceiptHash:undefined});
 const next=structuredClone(ledger);next.executions.push(normalized);return next;
}
export function summarizeProvableExecutions({ledger,actualAllInMicrousd}={}){
 if(ledger?.schemaVersion!==PROVABLE_EXECUTION_LEDGER_SCHEMA)throw new Error('provable-execution-ledger-required');
 if(!ledger.executions.length)return{ok:false,status:'NO_PROVABLE_EXECUTIONS'};
 const groups=new Map();
 for(const r of ledger.executions){
  const key=sha({equivalenceClass:r.equivalenceClass,matchedObligationHash:r.matchedObligationHash,qualityContractHash:r.qualityContractHash,referenceContractHash:r.referenceContractHash});
  const g=groups.get(key)??{id:key,equivalenceClass:r.equivalenceClass,proofVerified:true,matchedObligationHash:r.matchedObligationHash,qualityContractHash:r.qualityContractHash,proofRef:'execution-ledger:'+key,executionCount:0,directReference:r.directReference};
  g.executionCount++;groups.set(key,g);
 }
 const workItems=[...groups.values()];
 const economics=proveReferenceEconomics({workItems,actualAllInMicrousd});
 return{...economics,period:ledger.period,uniqueExecutionCount:ledger.executions.length,executionLedgerHash:sha(ledger),
  qualityRetestRequired:false,qualityBasis:'E0_E4_VERIFIED_EQUIVALENCE',claimBoundary:'DOLLAR SAVINGS REQUIRE OBSERVED ACTUAL ALL-IN COST; COUNTERFACTUAL DIRECT COST NEEDS VERIFIED TOKENIZATION AND CURRENT ROUTE ECONOMICS'};
}
