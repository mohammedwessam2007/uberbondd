import crypto from 'node:crypto';
const hash=x=>'sha256:'+crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const array=x=>Array.isArray(x)?x:[];
function canonParse(p){
  return {goal:String(p?.goal??''),claims:array(p?.claims).map(String).sort(),constraints:array(p?.constraints).map(String).sort(),
    requiredOutputs:array(p?.requiredOutputs).map(String).sort(),sideEffects:array(p?.sideEffects).map(String).sort(),
    ambiguities:array(p?.ambiguities).map(String).sort(),uncertainties:array(p?.uncertainties).map(String).sort()};
}
export function closeInterpretation({rawTaskHash,parses,crownResolution=null,typedCompilerCertificate=null,verifyTypedCompilerCertificate=null}={}){
  if(!/^sha256:[0-9a-f]{64}$/.test(String(rawTaskHash||''))||!Array.isArray(parses)||parses.length<2) return {ok:false,status:'INTERPRETATION_EVIDENCE_INSUFFICIENT'};
  if(typedCompilerCertificate?.authority==='E2_VERIFIED_TRANSFORMATION'&&typedCompilerCertificate.rawTaskHash===rawTaskHash&&typedCompilerCertificate.compilerHash&&typedCompilerCertificate.program&&typeof verifyTypedCompilerCertificate==='function'&&verifyTypedCompilerCertificate(typedCompilerCertificate)===true){const program=canonParse(typedCompilerCertificate.program);return {ok:true,status:'INTERPRETATION_TYPED_COMPILER_CLOSED',program,certificate:{rawTaskHash,compilerHash:typedCompilerCertificate.compilerHash,pinnedProgramHash:hash(program),proofRef:typedCompilerCertificate.proofRef??null,preserved:typedCompilerCertificate.preserved??[],omitted:typedCompilerCertificate.omitted??[],ambiguitiesResolved:typedCompilerCertificate.ambiguitiesResolved??[]}};}
  const normalized=parses.map(canonParse), hashes=normalized.map(hash), same=hashes.every(h=>h===hashes[0]);
  const unionAmbiguities=[...new Set(normalized.flatMap(p=>p.ambiguities))];
  if(!same||unionAmbiguities.length){
    if(crownResolution?.semanticAuthority!=='CURRENT_TASK_CLASS_CROWN'||crownResolution.rawTaskHash!==rawTaskHash) return {ok:false,status:'INTERPRETATION_CROWN_REQUIRED',parseHashes:hashes,ambiguities:unionAmbiguities};
    const pinned=canonParse(crownResolution.program);
    return {ok:true,status:'INTERPRETATION_CROWN_CLOSED',program:pinned,certificate:{rawTaskHash,parseHashes:hashes,pinnedProgramHash:hash(pinned),authorityReceiptHash:crownResolution.authorityReceiptHash,preserved:crownResolution.preserved??[],omitted:crownResolution.omitted??[],ambiguitiesResolved:crownResolution.ambiguitiesResolved??[]}};
  }
  return {ok:false,status:'INTERPRETATION_AGREEMENT_NOT_AUTHORITY',candidateProgram:normalized[0],parseHashes:hashes};
}
