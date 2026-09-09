import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const COMPOSED_EFFECT_AUTHORITY_AUDIT_VERSION='uberbond.composed-effect-authority-audit.v1';
export const COMPOSITION_IDS=Object.freeze([
  'PLANNER_SCHEDULER','BROWSER_RESEARCH','CREDENTIALED_PROVIDER','MESSENGER','PAYMENT_RAIL',
  'DEPLOYMENT_CONTROLLER','PRIVATE_LIFE_GENERIC_AGENT','WORLD_RESOURCE_EXECUTOR','RECOVERY_CREDENTIAL_MANAGER'
]);
const MODES=new Set(['DIRECT_EFFECT_SINK','READ_ONLY_SURFACE','NON_SINK_WITH_DOWNSTREAM_GATE','EXTERNAL_AUTHORITY_BOUNDARY']);
const text=(v,max=1000)=>{const s=String(v??'').trim();return s&&s.length<=max?s:null;};
const uniq=v=>[...new Set((Array.isArray(v)?v:[]).map(x=>text(x,1000)).filter(Boolean))].sort();
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const digest=v=>`sha256:${crypto.createHash('sha256').update(JSON.stringify(stable(v))).digest('hex')}`;
const fail=(reasons,extra={})=>({ok:false,status:'COMPOSED_EFFECT_AUTHORITY_AUDIT_REFUSED',reasonCodes:[...new Set(reasons.filter(Boolean))],businessEffectAuthority:'NONE',externalEffectLedger:structuredClone(ZERO_EXTERNAL_EFFECTS),...extra});

function verifyMarker(sourceBodies,marker){
  const path=text(marker?.path,500),mustContain=uniq(marker?.mustContain),mustNotContain=uniq(marker?.mustNotContain);
  const body=sourceBodies?.[path];
  if(typeof body!=='string')return{ok:false,path,reasons:['source-body-required']};
  const reasons=[];
  for(const token of mustContain)if(!body.includes(token))reasons.push(`required-source-marker-missing:${token}`);
  for(const token of mustNotContain)if(body.includes(token))reasons.push(`prohibited-source-marker-present:${token}`);
  return{ok:reasons.length===0,path,reasons};
}

export function compileComposedEffectAuthorityAudit({declarations=[],sourceBodies={}}={}){
  const reasons=[];
  const rows=Array.isArray(declarations)?declarations:[];
  const ids=rows.map(r=>text(r?.compositionId,100)).filter(Boolean);
  if(rows.length!==COMPOSITION_IDS.length)reasons.push('exact-composition-denominator-required');
  if(new Set(ids).size!==ids.length)reasons.push('unique-composition-ids-required');
  for(const required of COMPOSITION_IDS)if(!ids.includes(required))reasons.push(`composition-missing:${required}`);
  for(const id of ids)if(!COMPOSITION_IDS.includes(id))reasons.push(`unknown-composition:${id}`);

  const normalized=[];
  for(const row of rows){
    const id=text(row?.compositionId,100);if(!id)continue;
    const mode=text(row?.mode,100);const local=[];
    if(!MODES.has(mode))local.push('recognized-composition-mode-required');
    const entrypointRefs=uniq(row?.entrypointRefs),terminalSinkRefs=uniq(row?.terminalSinkRefs),authorityBindingFields=uniq(row?.authorityBindingFields);
    if(entrypointRefs.length===0)local.push('entrypoint-reference-required');
    if(!text(row?.authorityLaw,2000))local.push('authority-law-required');
    if(mode==='DIRECT_EFFECT_SINK'){
      if(terminalSinkRefs.length===0)local.push('terminal-sink-reference-required');
      if(authorityBindingFields.length===0)local.push('exact-authority-binding-fields-required');
      if(row?.failClosed!==true)local.push('direct-effect-sink-must-fail-closed');
      if(row?.uncertaintyDoesNotAuthorizeRetry!==true)local.push('uncertainty-must-not-authorize-retry');
    }
    if(mode==='NON_SINK_WITH_DOWNSTREAM_GATE'&&terminalSinkRefs.length===0)local.push('non-sink-must-name-downstream-terminal-gate');
    if(mode==='READ_ONLY_SURFACE'){
      if(row?.externalMutationAuthority!=='NONE')local.push('read-only-surface-mutation-authority-must-be-none');
      if(!text(row?.readOnlyInvariant,2000))local.push('read-only-invariant-required');
    }
    if(mode==='EXTERNAL_AUTHORITY_BOUNDARY'){
      if(row?.externalMutationAuthority!=='NONE')local.push('external-boundary-mutation-authority-must-be-none');
      if(!text(row?.nextAuthorityGate,1000))local.push('external-boundary-next-authority-gate-required');
    }
    const markerResults=(Array.isArray(row?.sourceMarkers)?row.sourceMarkers:[]).map(marker=>verifyMarker(sourceBodies,marker));
    if(markerResults.length===0)local.push('source-markers-required');
    for(const result of markerResults)for(const reason of result.reasons)local.push(`${result.path||'unknown'}:${reason}`);
    normalized.push({compositionId:id,mode,entrypointRefs,terminalSinkRefs,authorityBindingFields,failClosed:row?.failClosed===true,uncertaintyDoesNotAuthorizeRetry:row?.uncertaintyDoesNotAuthorizeRetry===true,externalMutationAuthority:row?.externalMutationAuthority||null,readOnlyInvariant:row?.readOnlyInvariant||null,nextAuthorityGate:row?.nextAuthorityGate||null,markerResults,reasonCodes:[...new Set(local)]});
    if(local.length)reasons.push(`composition-authority-gap:${id}`);
  }
  if(reasons.length)return fail(reasons,{compositions:normalized,counts:{required:COMPOSITION_IDS.length,observed:rows.length,passing:normalized.filter(r=>r.reasonCodes.length===0).length}});
  const receipt={version:COMPOSED_EFFECT_AUTHORITY_AUDIT_VERSION,compositionIds:[...COMPOSITION_IDS],compositionDigests:rows.map(digest).sort(),sourceDigests:Object.fromEntries(Object.entries(sourceBodies).sort().map(([path,body])=>[path,digest(body)]))};
  return{ok:true,status:'ALL_DECLARED_EFFECT_SINKS_AUTHORITY_BOUND',compositions:normalized,counts:{required:COMPOSITION_IDS.length,observed:rows.length,passing:rows.length},receipt,receiptDigest:digest(receipt),truthBoundary:'This proves the current declared source authority cut-set: direct sinks fail closed on exact authority bindings, read-only/non-sink surfaces do not gain effect authority, and external-boundary modules stop before the external mutation. It does not prove provider credentials, runtime deployment, customer effects, money movement or owner enrollment actually occurred.',businessEffectAuthority:'NONE',externalEffectLedger:structuredClone(ZERO_EXTERNAL_EFFECTS)};
}
