import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
export const TERMINAL_CONVERGENCE_ENGINE_VERSION='uberbond.terminal-convergence-engine.v1';
const STRATS=['DECOMPOSE','RETRIEVE','TOOL_AUGMENT','MODEL_SWAP','DIVERSE_SOLVE','FALSIFY','SIMULATE','RECOMBINE','VERIFY'];
const REQUIRED=['UBERMIND','UBERGRAPH','UBERDNA','UBERCLOUD','UBERCEL','CAPABILITY_LAB'];
const zero=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const fail=(reasons,extra={})=>({ok:false,status:'TERMINAL_CONVERGENCE_BLOCKED',reasonCodes:reasons,externalEffectAuthority:'NONE',businessEffectAuthority:'NONE',externalEffectLedger:zero(),...extra});
export function compileTerminalConvergencePlan({gate={},observations=[],availableOrgans=[],branchesPerFailure=9,maxParallel=256,generation=1}={}){
 if(!gate.id||!gate.target||!Array.isArray(gate.dimensions)||!gate.dimensions.length)return fail(['frozen-gate-required']);
 const organs=new Set(availableOrgans.map(x=>String(x).toUpperCase())),missing=REQUIRED.filter(x=>!organs.has(x));if(missing.length)return fail(['required-organs-unavailable'],{missingOrgans:missing});
 const observed=new Map(observations.map(x=>[x.dimension,x])),unresolved=gate.dimensions.filter(d=>observed.get(d)?.passed!==true),nodes=[],edges=[],attacks=[];
 unresolved.forEach((dimension,i)=>{const root=`g${generation}:failure:${i}`;nodes.push({id:root,type:'FAILURE',dimension});for(let j=0;j<branchesPerFailure;j++){const id=`g${generation}:attack:${i}:${j}`;nodes.push({id,type:'ATTACK',dimension,strategy:STRATS[j%STRATS.length],authority:'PROPOSAL_ONLY'});edges.push({from:root,to:id,type:'FAN_OUT'});attacks.push(id);}const v=`g${generation}:verify:${i}`;nodes.push({id:v,type:'VERIFY',dimension,evidenceClass:'OBSERVED_BEHAVIORAL'});attacks.filter(x=>x.startsWith(`g${generation}:attack:${i}:`)).forEach(id=>edges.push({from:id,to:v,type:'SUBMIT'}));});
 const recombine=`g${generation}:recombine`,tribunal=`g${generation}:tribunal`;nodes.push({id:recombine,type:'RECOMBINE',law:'VERIFIED_GAIN_ONLY'},{id:tribunal,type:'TRIBUNAL',gateId:gate.id,law:'FROZEN_DENOMINATOR'});nodes.filter(n=>n.type==='VERIFY').forEach(n=>edges.push({from:n.id,to:recombine,type:'PROMOTE'}));edges.push({from:recombine,to:tribunal,type:'RETEST'});
 const waves=[];for(let i=0;i<attacks.length;i+=maxParallel)waves.push(attacks.slice(i,i+maxParallel));waves.push(nodes.filter(n=>n.type==='VERIFY').map(n=>n.id),[recombine],[tribunal]);
 const plan={schemaVersion:'uberbond.terminal-convergence-plan.v1',generation,gate,unresolved,totalAttackBranches:attacks.length,waves,graph:{nodes,edges},laws:['FROZEN_GATE','PARALLELIZE_FAILURES','KILL_NO_GAIN','RECOMBINE_VERIFIED_SURVIVORS','NO_SYNTHETIC_ONLY_PROGRESS','NO_NEW_DENOMINATOR']};return {ok:true,status:unresolved.length?'TERMINAL_CONVERGENCE_PLAN_READY':'TERMINAL_GATE_ALREADY_SATISFIED',plan,planDigest:hash(plan),externalEffectAuthority:'NONE',businessEffectAuthority:'NONE',externalEffectLedger:zero()};
}
