export function auditCrownCapitalization({crownCallReceipts=[],capitalAssets=[]}={}){
 if(!Array.isArray(crownCallReceipts)||!Array.isArray(capitalAssets))throw new Error('receipt-and-capital-lists-required');
 const assetRefs=new Set(capitalAssets.flatMap(a=>[a.originatingCallId,a.costReceiptRef,a.authorityReceiptHash].filter(Boolean)));
 const failures=[];
 for(const r of crownCallReceipts){
  if(r?.kind!=='CROWN_CALL'||r.semanticReusableStructure!==true)continue;
  if(!r.callId)throw new Error('crown-call-id-required');
  if(!assetRefs.has(r.callId)&&!assetRefs.has(r.costReceiptRef)&&!assetRefs.has(r.authorityReceiptHash))failures.push({callId:r.callId,status:'CAPITALIZATION_FAILURE',reason:'reusable-crown-structure-has-no-durable-capital-descendant'});
 }
 const eligible=crownCallReceipts.filter(r=>r?.kind==='CROWN_CALL'&&r.semanticReusableStructure===true).length;
 return {status:failures.length?'CAPITALIZATION_FAILURES_PRESENT':'CROWN_CAPITALIZATION_CLOSED_FOR_OBSERVED_CALLS',eligibleCrownCalls:eligible,capitalized:eligible-failures.length,failures,crownCapitalYield:eligible? (eligible-failures.length)/eligible:null,truthBoundary:'Yield measures durable descendant linkage only, not quality or economic value.'};
}
