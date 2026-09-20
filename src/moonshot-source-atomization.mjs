import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const MOONSHOT_SOURCE_ATOMIZATION_VERSION='uberbond.moonshot-source-atomization.v1';

const envelope=extra=>({
  businessEffectAuthority:'NONE',
  externalEffectAuthority:'NONE',
  externalEffectLedger:structuredClone(ZERO_EXTERNAL_EFFECTS),
  ...extra
});
const fail=(status,reasons,extra={})=>envelope({
  ok:false,status,reasonCodes:[...new Set(reasons.filter(Boolean))],...extra
});
const text=(v,max=20000)=>{
  const s=String(v??'').trim();
  return s&&s.length<=max?s:null;
};

function literalUnits(markdown){
  const body=String(markdown??'').replace(/\r/g,'').trim();
  if(!body) return [];
  const raw=body
    .split(/\n{2,}|(?<=[.!?])\s+(?=[A-Z0-9*#`])/)
    .map(s=>s.trim())
    .filter(Boolean);
  return raw.map((literal,index)=>({
    atomId:'source-atom-'+String(index+1).padStart(3,'0'),
    literal,
    kind:/\\\[|\\boxed\{|=|≡|→|->/.test(literal)
      ?'FORMAL_OR_RELATIONAL_SOURCE_UNIT'
      :/\b(must|never|cannot|no amount|only if|required|without)\b/i.test(literal)
        ?'CONSTRAINT_OR_INVARIANT_SOURCE_UNIT'
        :/\b(create|build|compile|discover|invent|extract|evolve|improve|manage|observe|maximize|search|map|generate)\b/i.test(literal)
          ?'OBJECTIVE_SOURCE_UNIT'
          :'SOURCE_STATEMENT',
    sourceExact:true
  }));
}

function defaultTestFamily(surface,kind){
  const s=String(surface||'').toUpperCase();
  const k=String(kind||'').toUpperCase();
  if(s==='FORMAL') return 'FORMAL_PROOF_OR_COUNTERMODEL';
  if(s==='SOFTWARE') return k==='DOCTRINE_OR_INVARIANT'?'MACHINE_CHECKABLE_INVARIANT_TEST':'HELDOUT_SOFTWARE_BENCHMARK';
  return 'FORMALIZE_BEFORE_EXPERIMENT_SELECTION';
}

export function atomizeMoonshotLiteralSource({
  stableId,ordinal,literalTitle,literalBodyMarkdown,realizationSurface,ideaKind
}={}){
  const id=text(stableId,200),title=text(literalTitle,500),body=text(literalBodyMarkdown,20000);
  if(!id||!Number.isSafeInteger(Number(ordinal))||!title||!body){
    return fail('MOONSHOT_SOURCE_ATOMIZATION_INVALID',['stable-id-ordinal-title-and-literal-body-required']);
  }
  const atoms=literalUnits(body);
  if(!atoms.length) return fail('MOONSHOT_SOURCE_ATOMIZATION_INVALID',['at-least-one-literal-source-atom-required']);

  return envelope({
    ok:true,status:'MOONSHOT_LITERAL_SOURCE_ATOMIZED',
    stableId:id,ordinal:Number(ordinal),literalTitle:title,
    realizationSurface:String(realizationSurface||'UNKNOWN').toUpperCase(),
    ideaKind:String(ideaKind||'UNKNOWN').toUpperCase(),
    sourceAtoms:atoms,
    atomCount:atoms.length,
    derivedClaimState:'NOT_YET_DERIVED',
    derivedHypothesis:null,
    rivalHypothesis:null,
    falsifier:null,
    baseline:null,
    measurement:null,
    defaultTestFamily:defaultTestFamily(realizationSurface,ideaKind),
    claimAdmissionContract:{
      sourceBindingRequired:true,
      exactSourceAtomIdsRequired:true,
      novelAssumptionsMustBeDeclared:true,
      rivalHypothesisRequired:true,
      falsifierRequired:true,
      baselineRequired:true,
      heldOutOrCounterexampleRequired:true,
      evidenceCannotBeInheritedFromParentOrDonor:true
    },
    nextAction:'DERIVE_ONE_OR_MORE_EXPLICIT_FALSIFIABLE_CLAIMS_WITH_SOURCE_ATOM_BINDINGS',
    law:'ATOMIZATION_PRESERVES_LITERAL_SOURCE_UNITS__IT_DOES_NOT_TURN_AMBITION_INTO_A_CLAIM',
    truthBoundary:'NO_DERIVED_HYPOTHESIS_EXISTS_UNTIL_A_SEPARATE_EVIDENCE_GRADE_DERIVATION_IS_ADMITTED'
  });
}

export function compileInternalMoonshotAtomizationLayer({literalEntries=[],executionPrograms=[]}={}){
  if(!Array.isArray(literalEntries)||literalEntries.length!==890||!Array.isArray(executionPrograms)||executionPrograms.length!==890){
    return fail('INTERNAL_MOONSHOT_ATOMIZATION_INVALID',['exact-890-literal-and-program-layers-required']);
  }
  const literalByOrdinal=new Map(literalEntries.map(e=>[Number(e.ordinal),e]));
  const internal=executionPrograms.filter(p=>p.frontierClass==='INTERNAL_EXECUTION');
  const packets=[];
  for(const program of internal){
    const literal=literalByOrdinal.get(Number(program.ordinal));
    if(!literal) return fail('INTERNAL_MOONSHOT_ATOMIZATION_INVALID',['literal-source-missing:'+program.stableId]);
    const result=atomizeMoonshotLiteralSource({
      stableId:program.stableId,
      ordinal:program.ordinal,
      literalTitle:literal.literalTitle,
      literalBodyMarkdown:literal.literalBodyMarkdown,
      realizationSurface:program.realizationSurface,
      ideaKind:program.ideaKind
    });
    if(!result.ok) return result;
    packets.push(result);
  }
  packets.sort((a,b)=>a.ordinal-b.ordinal);
  const sourceAtomCount=packets.reduce((sum,p)=>sum+p.atomCount,0);
  return envelope({
    ok:true,
    status:'INTERNAL_MOONSHOT_SOURCE_ATOMIZATION_LAYER_READY',
    internalProgramCount:internal.length,
    atomizedCount:packets.length,
    sourceAtomCount,
    derivedClaimCount:0,
    packets,
    law:'ALL_INTERNAL_PROGRAMS_ARE_SOURCE_ATOMIZED__ZERO_AUTOMATIC_DERIVED_CLAIMS_ARE_SMUGGLED_IN',
    nextStage:'EVIDENCE_GRADE_CLAIM_DERIVATION_AND_CHILD_IMPLEMENTATION'
  });
}

export function admitDerivedClaim({
  atomization,claimId,statement,sourceAtomIds=[],assumptions=[],rivalHypothesis,
  falsifier,baseline,measurement,heldOutOrCounterexample
}={}){
  if(!atomization?.ok||atomization.status!=='MOONSHOT_LITERAL_SOURCE_ATOMIZED'){
    return fail('DERIVED_CLAIM_REFUSED',['valid-source-atomization-required']);
  }
  const id=text(claimId,200),claim=text(statement,4000),rival=text(rivalHypothesis,4000);
  const fals=text(falsifier,4000),base=text(baseline,2000),measure=text(measurement,3000);
  const held=text(heldOutOrCounterexample,3000);
  const refs=[...new Set((Array.isArray(sourceAtomIds)?sourceAtomIds:[]).map(String))];
  const available=new Set(atomization.sourceAtoms.map(a=>a.atomId));
  const reasons=[];
  if(!id||!claim) reasons.push('claim-id-and-statement-required');
  if(!refs.length||refs.some(ref=>!available.has(ref))) reasons.push('valid-source-atom-bindings-required');
  if(!rival||rival===claim) reasons.push('distinct-rival-hypothesis-required');
  if(!fals) reasons.push('falsifier-required');
  if(!base) reasons.push('baseline-required');
  if(!measure) reasons.push('measurement-required');
  if(!held) reasons.push('heldout-or-counterexample-required');
  if(reasons.length) return fail('DERIVED_CLAIM_REFUSED',reasons);

  return envelope({
    ok:true,status:'DERIVED_MOONSHOT_CLAIM_ADMITTED_FOR_EXPERIMENT_DESIGN',
    stableId:atomization.stableId,claimId:id,statement:claim,
    sourceAtomIds:refs,
    sourceAtoms:atomization.sourceAtoms.filter(a=>refs.includes(a.atomId)),
    assumptions:(Array.isArray(assumptions)?assumptions:[]).map(String).filter(Boolean),
    rivalHypothesis:rival,falsifier:fals,baseline:base,measurement:measure,
    heldOutOrCounterexample:held,
    evidenceState:'HYPOTHESIS',
    promotionAuthority:'NONE',
    law:'A_DERIVED_CLAIM_IS_TRACEABLE_TO_LITERAL_SOURCE_BUT_REMAINS_A_HYPOTHESIS_UNTIL_REAL_EVIDENCE'
  });
}
