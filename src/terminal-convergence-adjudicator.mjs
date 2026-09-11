import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
const zero=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const fail=r=>({ok:false,status:'TERMINAL_CONVERGENCE_BLOCKED',reasonCodes:r,externalEffectAuthority:'NONE',businessEffectAuthority:'NONE',externalEffectLedger:zero()});
export function selectVerifiedSurvivors({planResult,results=[]}={}){
 if(!planResult?.ok||hash(planResult.plan)!==planResult.planDigest)return fail(['untampered-plan-required']);
 const ids=new Set(planResult.plan.graph.nodes.filter(n=>n.type==='ATTACK').map(n=>n.id)),accepted=[],rejected=[];
 for(const r of results){const gain=Number(r.after)-Number(r.before);if(ids.has(r.nodeId)&&r.evidenceClass==='OBSERVED_BEHAVIORAL'&&r.independentVerifier===true&&Number.isFinite(gain)&&gain>0)accepted.push({...r,gain});else rejected.push({nodeId:r.nodeId||null,reason:'VERIFIED_POSITIVE_BEHAVIORAL_GAIN_REQUIRED'});}accepted.sort((a,b)=>b.gain-a.gain);
 return {ok:true,status:'TERMINAL_SURVIVORS_SELECTED',accepted,rejected,killCount:rejected.length,externalEffectAuthority:'NONE',businessEffectAuthority:'NONE',externalEffectLedger:zero()};
}
export function adjudicateFrozenGate({gate={},observations=[]}={}){
 if(!gate.id||!Array.isArray(gate.dimensions)||!gate.dimensions.length)return fail(['frozen-gate-required']);
 const m=new Map(observations.map(x=>[x.dimension,x]));const missing=gate.dimensions.filter(d=>m.get(d)?.passed!==true||m.get(d)?.evidenceClass!=='OBSERVED_BEHAVIORAL');
 return {ok:true,status:missing.length?'TERMINAL_GATE_NOT_YET_SATISFIED':'TERMINAL_GATE_SATISFIED',passed:gate.dimensions.length-missing.length,total:gate.dimensions.length,missing,claimAuthority:missing.length?'NONE':'FROZEN_GATE_ONLY',truthBoundary:'Adjudicates only the frozen gate from observed behavioral receipts.',externalEffectAuthority:'NONE',businessEffectAuthority:'NONE',externalEffectLedger:zero()};
}
