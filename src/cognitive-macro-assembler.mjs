import { canonicalSemanticJson, semanticHash, renderClosedClaims } from './semantic-closure-kernel.mjs';

export const COGNITIVE_MACRO_ASSEMBLER_SCHEMA='uberbond.cognitive-macro-assembler.v1';
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const id=v=>typeof v==='string'&&/^[a-zA-Z0-9_.:/-]{1,240}$/.test(v);
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const placeholder=/\{\{([a-zA-Z0-9_.:-]{1,80})\}\}/g;

function renderSlot(value){
  if(typeof value==='string')return value;
  if(typeof value==='number'&&Number.isFinite(value))return String(value);
  if(typeof value==='boolean')return value?'true':'false';
  if(value===null)return 'null';
  return canonicalSemanticJson(value);
}

export function validateApprovedCognitiveMacro({macro,trustedMacroHashes={},context,now=Date.now()}={}){
  const reasons=[];
  try{
    if(!plain(macro)||!id(macro.id)||macro.status!=='ACTIVE')throw new Error('active-macro-required');
    if(typeof macro.template!=='string'||!macro.template.length||Buffer.byteLength(macro.template)>200000)throw new Error('bounded-template-required');
    if(!plain(macro.slots)||!Object.keys(macro.slots).length)throw new Error('macro-slots-required');
    if(Object.entries(macro.slots).some(([k,v])=>!id(k)||!id(v)))throw new Error('typed-slot-map-required');
    const names=[...macro.template.matchAll(placeholder)].map(m=>m[1]);
    const unique=[...new Set(names)].sort();
    if(!names.length||JSON.stringify(unique)!==JSON.stringify(Object.keys(macro.slots).sort()))throw new Error('template-slot-coverage-mismatch');
    if(!context||macro.crownRevision!==context.crownRevision||macro.qualityContractHash!==context.qualityContractHash)throw new Error('macro-crown-or-quality-mismatch');
    if(!plain(macro.sourceHashes)||!Object.keys(macro.sourceHashes).length)throw new Error('macro-source-dependencies-required');
    for(const [k,v] of Object.entries(macro.sourceHashes)){
      if(!digest(v)||context.sourceHashes?.[k]!==v)throw new Error('macro-source-dependency-changed');
    }
    if(!Array.isArray(macro.invalidators))throw new Error('macro-invalidators-required');
    for(const key of macro.invalidators)if(!id(key)||context.invalidators?.[key]!==false)throw new Error('macro-invalidator-fired-or-unknown');
    if(!Number.isFinite(Date.parse(macro.verifiedAt))||Date.parse(macro.verifiedAt)>now||
       !Number.isFinite(Date.parse(macro.expiresAt))||Date.parse(macro.expiresAt)<=now)throw new Error('macro-stale-or-future');
    if(typeof macro.evidenceRef!=='string'||!macro.evidenceRef)throw new Error('macro-crown-evidence-required');
    if(!digest(trustedMacroHashes?.[macro.id])||trustedMacroHashes[macro.id]!==semanticHash(macro))throw new Error('macro-not-independently-trusted');
  }catch(error){reasons.push(error.message);}
  return {ok:reasons.length===0,reasons};
}

export function renderApprovedCognitiveMacro({macro,trustedMacroHashes={},artifact,closure,context,now=Date.now()}={}){
  const v=validateApprovedCognitiveMacro({macro,trustedMacroHashes,context,now});
  if(!v.ok)return {ok:false,status:'COGNITIVE_MACRO_REFUSED',reasons:v.reasons,semanticAuthority:'NONE',externalEffectAuthority:'NONE'};
  try{
    // renderClosedClaims re-verifies the current closure and rejects copied/forged
    // closure objects, changed dependencies, expired authorities and free prose.
    const rows=JSON.parse(renderClosedClaims({artifact,closure,context,now,style:'json'}));
    const claims=new Map(rows.map(row=>[row.id,row.value]));
    if(claims.size!==rows.length)throw new Error('duplicate-closed-claim-id');
    let rendered=macro.template;
    for(const [slot,claimId] of Object.entries(macro.slots)){
      if(!claims.has(claimId))throw new Error('macro-slot-claim-missing:'+claimId);
      rendered=rendered.split('{{'+slot+'}}').join(renderSlot(claims.get(claimId)));
    }
    if(placeholder.test(rendered))throw new Error('unresolved-macro-placeholder');
    return {
      ok:true,
      status:'E2_CROWN_APPROVED_MACRO_RENDERED',
      schemaVersion:COGNITIVE_MACRO_ASSEMBLER_SCHEMA,
      rendered,
      outputHash:semanticHash(rendered),
      macroId:macro.id,
      macroHash:semanticHash(macro),
      artifactHash:semanticHash(artifact),
      semanticAuthority:'CROWN_APPROVED_MACRO_PLUS_CURRENT_E0_E4_CLOSURE',
      qualityClass:'Q_CERTIFIED_BOUNDED',
      externalEffectAuthority:'NONE',
      claimBoundary:'Only exact closed claim values are inserted into an independently trusted Crown-approved template. No model-authored prose is created at render time.'
    };
  }catch(error){
    return {ok:false,status:'COGNITIVE_MACRO_REFUSED',reasons:[String(error.message||error)],semanticAuthority:'NONE',externalEffectAuthority:'NONE'};
  }
}
