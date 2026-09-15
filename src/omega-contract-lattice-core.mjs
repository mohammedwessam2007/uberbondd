import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const OMEGA_CONTRACT_LATTICE_CORE_VERSION='uberbond.omega-contract-lattice-core.v1';
const envelope=extra=>({businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:structuredClone(ZERO_EXTERNAL_EFFECTS),...extra});
const fail=reasonCodes=>envelope({ok:false,status:'OMEGA_CONTRACT_LATTICE_REFUSED',version:OMEGA_CONTRACT_LATTICE_CORE_VERSION,reasonCodes:[...new Set(reasonCodes)]});

export function compileContractLattice({candidates=[]}={}){
  if(!Array.isArray(candidates)||candidates.length<2)return fail(['two-candidates-required']);
  const normalized=[];
  for(const raw of candidates){
    const id=String(raw?.id||'').trim();
    const contract=String(raw?.terminalContract||'').trim();
    const clauses=raw?.clauses&&typeof raw.clauses==='object'&&!Array.isArray(raw.clauses)?raw.clauses:null;
    if(!id||!contract||!clauses)return fail(['invalid-candidate']);
    normalized.push({id,terminalContract:contract,clauses:{...clauses}});
  }
  if(new Set(normalized.map(x=>x.id)).size!==normalized.length)return fail(['duplicate-candidate-id']);
  const keys=[...new Set(normalized.flatMap(x=>Object.keys(x.clauses)))].sort();
  const invariantClauses={}; const divergentKeys=[];
  for(const key of keys){
    const values=normalized.map(x=>Object.hasOwn(x.clauses,key)?JSON.stringify(x.clauses[key]):'__MISSING__');
    if(values.every(v=>v===values[0])&&values[0]!=='__MISSING__')invariantClauses[key]=normalized[0].clauses[key];
    else divergentKeys.push(key);
  }
  return envelope({ok:true,status:'OMEGA_CONTRACT_LATTICE_COMPILED',version:OMEGA_CONTRACT_LATTICE_CORE_VERSION,lattice:{candidates:normalized,invariantClauses,divergentKeys,terminalContractDiverges:new Set(normalized.map(x=>x.terminalContract)).size>1}});
}

export function chooseDiscriminatingObservation({lattice,observations=[]}={}){
  if(!lattice?.candidates||!Array.isArray(observations)||!observations.length)return fail(['lattice-and-observations-required']);
  const ids=lattice.candidates.map(x=>x.id); const scored=[];
  for(const raw of observations){
    const id=String(raw?.id||'').trim(), cost=Number(raw?.cost||1), outcomes=raw?.outcomes;
    if(!id||!Number.isFinite(cost)||cost<=0||!outcomes)return fail(['invalid-observation']);
    if(ids.some(candidateId=>!Object.hasOwn(outcomes,candidateId)))return fail(['observation-missing-candidate']);
    const counts=new Map(); for(const candidateId of ids){const key=JSON.stringify(outcomes[candidateId]);counts.set(key,(counts.get(key)||0)+1);}
    let bits=0; for(const count of counts.values()){const p=count/ids.length;bits-=p*Math.log2(p);}
    scored.push({id,cost,informationBits:bits,informationPerCost:bits/cost,outcomes});
  }
  scored.sort((a,b)=>b.informationPerCost-a.informationPerCost||a.id.localeCompare(b.id));
  return envelope({ok:true,status:'OMEGA_DISCRIMINATING_OBSERVATION_SELECTED',version:OMEGA_CONTRACT_LATTICE_CORE_VERSION,selected:scored[0],ranking:scored.map(({outcomes,...x})=>x)});
}

export function conditionContractLattice({lattice,observation,observedValue}={}){
  if(!lattice?.candidates||!observation?.outcomes)return fail(['lattice-and-observation-required']);
  const survivors=lattice.candidates.filter(x=>Object.is(observation.outcomes[x.id],observedValue));
  if(!survivors.length)return fail(['all-candidates-eliminated']);
  if(survivors.length===1)return envelope({ok:true,status:'OMEGA_CONTRACT_LATTICE_COLLAPSED',version:OMEGA_CONTRACT_LATTICE_CORE_VERSION,survivor:survivors[0]});
  return compileContractLattice({candidates:survivors});
}
