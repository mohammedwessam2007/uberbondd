import crypto from 'node:crypto';
import { summarizeProvableExecutions } from './provable-execution-ledger.mjs';

export const COGNITIVE_CAPITAL_LEDGER_SCHEMA='uberbond.cognitive-capital-ledger.v1';
const sha=x=>'sha256:'+crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const id=v=>typeof v==='string'&&/^[a-zA-Z0-9_.:/-]{1,240}$/.test(v);
const safe=v=>Number.isSafeInteger(v)&&v>=0;

export function createCognitiveCapitalLedger({period,campaignId,requiredCostClasses=[]}={}){
  if(!/^\d{4}-\d{2}$/.test(String(period||''))||!id(campaignId))throw new Error('period-and-campaign-required');
  if(!Array.isArray(requiredCostClasses)||new Set(requiredCostClasses).size!==requiredCostClasses.length||
     requiredCostClasses.some(x=>!id(x)))throw new Error('unique-required-cost-classes-required');
  return {
    schemaVersion:COGNITIVE_CAPITAL_LEDGER_SCHEMA,period,campaignId,
    requiredCostClasses:[...requiredCostClasses].sort(),
    costReceipts:[],capitalAssets:{},closed:false
  };
}

export function appendObservedCapitalCost(ledger,receipt={}){
  if(ledger?.schemaVersion!==COGNITIVE_CAPITAL_LEDGER_SCHEMA||ledger.closed)throw new Error('open-capital-ledger-required');
  if(!id(receipt.receiptId)||!id(receipt.costClass)||!id(receipt.assetId)||!safe(receipt.actualMicrousd)||
     typeof receipt.evidenceRef!=='string'||!receipt.evidenceRef||
     !Number.isFinite(Date.parse(receipt.observedAt))||String(receipt.observedAt).slice(0,7)!==ledger.period)throw new Error('observed-cost-receipt-required');
  if(receipt.basis!=='OBSERVED_EXTERNAL_BILL'&&receipt.basis!=='OBSERVED_RUNTIME_METER'&&receipt.basis!=='OBSERVED_ZERO_COST')throw new Error('observed-cost-basis-required');
  if(receipt.basis==='OBSERVED_ZERO_COST'&&receipt.actualMicrousd!==0)throw new Error('zero-cost-basis-must-be-zero');
  if(ledger.costReceipts.some(r=>r.receiptId===receipt.receiptId))throw new Error('duplicate-cost-receipt-id');
  const row={...structuredClone(receipt),receiptHash:null};
  row.receiptHash=sha({...row,receiptHash:undefined});
  const next=structuredClone(ledger);next.costReceipts.push(row);return next;
}

export function registerCognitiveCapitalAsset(ledger,asset={}){
  if(ledger?.schemaVersion!==COGNITIVE_CAPITAL_LEDGER_SCHEMA||ledger.closed)throw new Error('open-capital-ledger-required');
  if(!id(asset.assetId)||!id(asset.kind)||typeof asset.evidenceRef!=='string'||!asset.evidenceRef||
     typeof asset.qualityBasis!=='string'||!asset.qualityBasis)throw new Error('capital-asset-evidence-required');
  if(ledger.capitalAssets[asset.assetId])throw new Error('duplicate-capital-asset-id');
  const next=structuredClone(ledger);
  next.capitalAssets[asset.assetId]={...structuredClone(asset),assetHash:sha(asset)};
  return next;
}

export function closeCognitiveCapitalLedger(ledger,{closureEvidenceRef,closedAt}={}){
  if(ledger?.schemaVersion!==COGNITIVE_CAPITAL_LEDGER_SCHEMA||ledger.closed)throw new Error('open-capital-ledger-required');
  if(typeof closureEvidenceRef!=='string'||!closureEvidenceRef||!Number.isFinite(Date.parse(closedAt))||String(closedAt).slice(0,7)!==ledger.period)throw new Error('capital-ledger-closure-evidence-required');
  const present=new Set(ledger.costReceipts.map(r=>r.costClass));
  const missing=ledger.requiredCostClasses.filter(x=>!present.has(x));
  if(missing.length)throw new Error('capital-cost-classes-incomplete:'+missing.join(','));
  const next=structuredClone(ledger);next.closed=true;next.closedAt=closedAt;next.closureEvidenceRef=closureEvidenceRef;
  next.ledgerHash=sha({...next,ledgerHash:undefined});
  return next;
}

export function auditCognitiveCapitalEconomics({capitalLedger,provableExecutionLedger}={}){
  const fail=(status,extra={})=>({ok:false,status,...extra});
  if(capitalLedger?.schemaVersion!==COGNITIVE_CAPITAL_LEDGER_SCHEMA||capitalLedger.closed!==true)return fail('CLOSED_CAPITAL_LEDGER_REQUIRED');
  if(capitalLedger.ledgerHash!==sha({...capitalLedger,ledgerHash:undefined}))return fail('CAPITAL_LEDGER_TAMPERED');
  const hashes=new Set();
  for(const r of capitalLedger.costReceipts){
    if(r.receiptHash!==sha({...r,receiptHash:undefined}))return fail('CAPITAL_COST_RECEIPT_TAMPERED',{receiptId:r.receiptId});
    if(hashes.has(r.receiptHash))return fail('DUPLICATE_COST_RECEIPT_HASH');
    hashes.add(r.receiptHash);
  }
  const actualAllInMicrousd=capitalLedger.costReceipts.reduce((n,r)=>n+r.actualMicrousd,0);
  if(actualAllInMicrousd===0)return fail('NONZERO_OBSERVED_ALL_IN_COST_REQUIRED_FOR_FINITE_MULTIPLIER',{
    actualAllInMicrousd,capitalLedgerHash:capitalLedger.ledgerHash
  });
  const economics=summarizeProvableExecutions({ledger:provableExecutionLedger,actualAllInMicrousd});
  if(!economics.ok)return fail('PROVABLE_REFERENCE_ECONOMICS_REQUIRED',{economics,actualAllInMicrousd});
  return {
    ok:true,status:'COGNITIVE_CAPITAL_ECONOMICS_AUDITED',
    campaignId:capitalLedger.campaignId,capitalLedgerHash:capitalLedger.ledgerHash,
    observedAllInMicrousd:actualAllInMicrousd,
    observedAllInUsd:actualAllInMicrousd/1e6,
    certifiedExecutions:economics.certifiedExecutions,
    directFrontierReferenceMicrousd:economics.directFrontierReferenceMicrousd,
    directFrontierReferenceUsd:economics.directFrontierReferenceMicrousd/1e6,
    referenceCompressionFactor:economics.referenceCompressionFactor,
    millionDollarReferenceThresholdMet:economics.millionDollarReferenceThresholdMet,
    target33333xMet:economics.target33333xMet,
    costClasses:[...new Set(capitalLedger.costReceipts.map(r=>r.costClass))].sort(),
    qualityBasis:economics.qualityBasis??'E0_E4_VERIFIED_EQUIVALENCE',
    claimBoundary:'Factor is allowed only because both sides are receipt-bound: verified E0-E4 executions with cheapest-legitimate direct-reference contracts, and a closed set of observed all-in campaign cost classes.'
  };
}
