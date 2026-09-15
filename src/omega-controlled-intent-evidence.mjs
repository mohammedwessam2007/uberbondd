import { ZERO_EFFECTS, compileControlledLanguage, canonicalProblemSemantics, digest } from './omega-private-lab-core.mjs';
import { compileContractLattice, chooseDiscriminatingObservation, conditionContractLattice } from './omega-contract-lattice-core.mjs';

export const OMEGA_CONTROLLED_INTENT_EVIDENCE_VERSION='uberbond.omega-controlled-intent-evidence.v1';
const envelope=extra=>({businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:{...ZERO_EFFECTS},...extra});
const fail=(...r)=>envelope({ok:false,status:'OMEGA_CONTROLLED_INTENT_REFUSED',version:OMEGA_CONTROLLED_INTENT_EVIDENCE_VERSION,reasonCodes:[...new Set(r.flat().filter(Boolean))]});

export function compileAmbiguousControlledIntent({candidates=[]}={}){
  if(!Array.isArray(candidates)||candidates.length<2||candidates.length>16)return fail('two-or-more-candidates-required');
  const compiled=[];
  for(const raw of candidates){
    const id=String(raw?.id??'').trim(),terminalContract=String(raw?.terminalContract??'').trim();
    if(!id||!terminalContract)return fail('candidate-id-and-terminal-contract-required');
    const receipt=compileControlledLanguage({id:`intent-${id}`,domain:String(raw.domain??'CONTROLLED_INTENT'),text:raw.text});
    if(!receipt.ok)return fail(`candidate-compile-failed:${id}`);
    const semantics=canonicalProblemSemantics(receipt.problem),semanticHash=digest(semantics);
    compiled.push({id,terminalContract,clauses:{semanticHash,authorityClass:String(raw.authorityClass??'NONE'),effectClass:String(raw.effectClass??'NONE')},problem:receipt.problem,sourceHash:receipt.sourceHash,semanticHash});
  }
  const lattice=compileContractLattice({candidates:compiled.map(({problem,sourceHash,semanticHash,...c})=>c)});if(!lattice.ok)return lattice;
  return envelope({ok:true,status:'OMEGA_AMBIGUOUS_CONTROLLED_INTENT_COMPILED',version:OMEGA_CONTROLLED_INTENT_EVIDENCE_VERSION,candidates:compiled,lattice:lattice.lattice,truthBoundary:'This harness compiles only the declared controlled grammar and caller-supplied candidate interpretations. It does not discover an exhaustive set of meanings from unrestricted natural language.'});
}

export function selectSemanticObservation({compiledIntent,observations=[]}={}){
  if(!compiledIntent?.lattice)return fail('compiled-intent-required');
  const selected=chooseDiscriminatingObservation({lattice:compiledIntent.lattice,observations});if(!selected.ok)return selected;
  return envelope({ok:true,status:'OMEGA_SEMANTIC_OBSERVATION_SELECTED',version:OMEGA_CONTROLLED_INTENT_EVIDENCE_VERSION,selected:selected.selected,ranking:selected.ranking});
}

export function resolveControlledIntent({compiledIntent,observation,observedValue}={}){
  if(!compiledIntent?.lattice||!observation)return fail('compiled-intent-and-observation-required');
  const conditioned=conditionContractLattice({lattice:compiledIntent.lattice,observation,observedValue});if(!conditioned.ok)return conditioned;
  if(conditioned.status!=='OMEGA_CONTRACT_LATTICE_COLLAPSED')return envelope({ok:true,status:'OMEGA_CONTROLLED_INTENT_REMAINS_AMBIGUOUS',version:OMEGA_CONTROLLED_INTENT_EVIDENCE_VERSION,conditioned});
  const survivor=compiledIntent.candidates.find(c=>c.id===conditioned.survivor.id);if(!survivor)return fail('survivor-payload-missing');
  return envelope({ok:true,status:'OMEGA_CONTROLLED_INTENT_RESOLVED',version:OMEGA_CONTROLLED_INTENT_EVIDENCE_VERSION,resolved:{id:survivor.id,terminalContract:survivor.terminalContract,problem:survivor.problem,semanticHash:survivor.semanticHash,sourceHash:survivor.sourceHash},truthBoundary:'Resolution is evidence-conditioned selection among preregistered controlled interpretations, not unrestricted semantic understanding.'});
}

export function independentlyVerifySemanticWitness({resolved,expectedProblem}={}){
  if(!resolved?.semanticHash||!expectedProblem)return fail('resolved-and-expected-problem-required');
  const expected=canonicalProblemSemantics(expectedProblem);if(!expected)return fail('invalid-expected-problem');
  const expectedHash=digest(expected),valid=expectedHash===resolved.semanticHash;
  return envelope({ok:true,status:valid?'OMEGA_SEMANTIC_WITNESS_VERIFIED':'OMEGA_SEMANTIC_WITNESS_REJECTED',version:OMEGA_CONTROLLED_INTENT_EVIDENCE_VERSION,valid,expectedSemanticHash:expectedHash,observedSemanticHash:resolved.semanticHash,truthBoundary:'The semantic witness is independently supplied formal ground truth for this bounded task. It does not solve open-world language grounding.'});
}
