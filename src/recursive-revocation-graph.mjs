import crypto from 'node:crypto';

export const RECURSIVE_REVOCATION_GRAPH_VERSION='uberbond.recursive-revocation-graph.v1';
const text=(v,n=400)=>{const s=String(v??'').trim();return s&&s.length<=n?s:null;};
const iso=v=>{const d=v instanceof Date?v:new Date(String(v??''));return Number.isFinite(d.getTime())?d.toISOString():null;};
const uniq=a=>[...new Set((Array.isArray(a)?a:[]).map(v=>text(v,200)).filter(Boolean))];
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const fail=(reasonCodes,extra={})=>({ok:false,status:'REVOCATION_GRAPH_REFUSED',reasonCodes:[...new Set(reasonCodes.filter(Boolean))],externalEffectAuthority:'NONE',businessEffectAuthority:'NONE',...extra});

export function compileDelegationGraph({grants=[]}={}){
  const rows=Array.isArray(grants)?grants:[];
  const reasons=[];const byId=new Map();
  for(const raw of rows){
    const id=text(raw?.id,160); if(!id){reasons.push('delegation-id-required');continue;}
    if(byId.has(id)){reasons.push(`duplicate-delegation-id:${id}`);continue;}
    const expiresAt=iso(raw?.expiresAt); if(!expiresAt) reasons.push(`delegation-expiry-required:${id}`);
    const actions=uniq(raw?.actions); if(!actions.length) reasons.push(`delegated-actions-required:${id}`);
    byId.set(id,{id,parentId:text(raw?.parentId,160),actions,expiresAt,revokedAt:raw?.revokedAt?iso(raw.revokedAt):null,revocationReason:text(raw?.revocationReason,400)});
  }
  for(const row of byId.values()){
    if(!row.parentId) continue;
    const parent=byId.get(row.parentId);
    if(!parent){reasons.push(`parent-delegation-missing:${row.id}`);continue;}
    const widened=row.actions.filter(a=>!parent.actions.includes(a));
    if(widened.length) reasons.push(`delegation-may-only-attenuate:${row.id}`);
    if(row.expiresAt&&parent.expiresAt&&Date.parse(row.expiresAt)>Date.parse(parent.expiresAt)) reasons.push(`delegation-may-not-outlive-parent:${row.id}`);
  }
  const visiting=new Set(),visited=new Set();
  const visit=id=>{
    if(visited.has(id)) return;
    if(visiting.has(id)){reasons.push(`delegation-cycle:${id}`);return;}
    visiting.add(id); const parent=byId.get(id)?.parentId; if(parent&&byId.has(parent)) visit(parent); visiting.delete(id); visited.add(id);
  };
  for(const id of byId.keys()) visit(id);
  if(reasons.length) return fail(reasons);
  const children={}; for(const row of byId.values()){if(!row.parentId)continue;(children[row.parentId]??=[]).push(row.id);} for(const ids of Object.values(children)) ids.sort();
  const normalized=[...byId.values()].sort((a,b)=>a.id.localeCompare(b.id));
  return{ok:true,status:'DELEGATION_GRAPH_COMPILED',version:RECURSIVE_REVOCATION_GRAPH_VERSION,grants:normalized,children,graphDigest:hash(normalized),externalEffectAuthority:'NONE',businessEffectAuthority:'NONE'};
}

export function revokeDelegationSubtree({graph,revokeId,revokedAt=new Date(),reason='unspecified'}={}){
  if(!graph?.ok||graph.status!=='DELEGATION_GRAPH_COMPILED') return fail(['valid-delegation-graph-required']);
  const id=text(revokeId,160),at=iso(revokedAt),why=text(reason,400);
  if(!id||!graph.grants.some(row=>row.id===id)) return fail(['existing-revoke-id-required']);
  if(!at) return fail(['valid-revocation-time-required']);
  const descendants=[]; const stack=[id];
  while(stack.length){const current=stack.pop(); if(descendants.includes(current))continue; descendants.push(current); for(const child of graph.children?.[current]||[]) stack.push(child);}
  descendants.sort();
  const grants=graph.grants.map(row=>descendants.includes(row.id)?{...row,revokedAt:at,revocationReason:why||'unspecified'}:{...row});
  const receipt={version:RECURSIVE_REVOCATION_GRAPH_VERSION,revokeId:id,revokedAt:at,reason:why||'unspecified',revokedDelegationIds:descendants,priorGraphDigest:graph.graphDigest,resultGraphDigest:hash(grants)};
  return{ok:true,status:'DELEGATION_SUBTREE_REVOKED',grants,receipt,externalEffectAuthority:'NONE',businessEffectAuthority:'NONE'};
}

export function delegationEffective({grant,at=new Date()}={}){
  const now=iso(at); if(!now||!grant) return{ok:false,status:'DELEGATION_INEFFECTIVE',reasonCodes:['valid-grant-and-clock-required']};
  if(grant.revokedAt&&Date.parse(grant.revokedAt)<=Date.parse(now)) return{ok:false,status:'DELEGATION_INEFFECTIVE',reasonCodes:['delegation-revoked']};
  if(!grant.expiresAt||Date.parse(grant.expiresAt)<=Date.parse(now)) return{ok:false,status:'DELEGATION_INEFFECTIVE',reasonCodes:['delegation-expired']};
  return{ok:true,status:'DELEGATION_EFFECTIVE',delegationId:grant.id,actions:[...grant.actions]};
}
