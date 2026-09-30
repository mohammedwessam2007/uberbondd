import crypto from 'node:crypto';
const h=x=>'sha256:'+crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
export function admitVerifierEvidence(v={}){
 const reasons=[];
 if(typeof v.verifierId!=='string'||!v.verifierId)reasons.push('verifier-id-required');
 if(!Array.isArray(v.proves)||!v.proves.length)reasons.push('explicit-proof-scope-required');
 if(!Array.isArray(v.doesNotProve))reasons.push('explicit-nonproof-scope-required');
 if(!Number.isSafeInteger(v.mutationCases)||v.mutationCases<1)reasons.push('mutation-evidence-required');
 if(!Number.isSafeInteger(v.falsePositiveCases)||v.falsePositiveCases<1)reasons.push('false-positive-attack-required');
 if(!Number.isSafeInteger(v.falseNegativeCases)||v.falseNegativeCases<1)reasons.push('false-negative-attack-required');
 if(v.independentCrossCheckPassed!==true)reasons.push('independent-cross-check-required');
 if(v.coverage==null||!Number.isFinite(Number(v.coverage))||Number(v.coverage)<=0||Number(v.coverage)>1)reasons.push('bounded-coverage-required');
 if(reasons.length)return {ok:false,status:'VERIFIER_AUTHORITY_REFUSED',reasons,authority:[]};
 const body={...v,coverage:Number(v.coverage)};
 return {ok:true,status:'VERIFIER_AUTHORITY_ADMITTED',authority:[...v.proves],coverage:body.coverage,receiptHash:h(body),truthBoundary:'Verifier authority is exactly its declared proven scope and measured coverage; it cannot certify outside that envelope.'};
}
export function verifierMayCertify(receipt,obligation){
 return Boolean(receipt?.ok&&receipt.authority?.includes(obligation)&&receipt.coverage===1);
}
