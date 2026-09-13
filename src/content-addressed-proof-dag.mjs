import crypto from 'node:crypto';

export const CONTENT_ADDRESSED_PROOF_DAG_VERSION='uberbond.content-addressed-proof-dag.v1';
const text=(v,n=2000)=>{const s=String(v??'').trim();return s&&s.length<=n?s:null;};
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const uniq=a=>[...new Set((Array.isArray(a)?a:[]).map(v=>text(v,500)).filter(Boolean))];
const fail=(codes,extra={})=>({ok:false,status:'PROOF_DAG_REFUSED',reasonCodes:[...new Set(codes.filter(Boolean))],externalEffectAuthority:'NONE',businessEffectAuthority:'NONE',...extra});

function normalizeProof(raw={}){
  const id=text(raw.id,200),kind=text(raw.kind,120),evidenceRef=text(raw.evidenceRef,1000);
  const parents=uniq(raw.parents).sort();
  const synthetic=raw.synthetic===true;
  const sourceClass=(text(raw.sourceClass,80)||'UNKNOWN').toUpperCase();
  const payloadDigest=text(raw.payloadDigest,80)?.toLowerCase()||null;
  return{id,kind,evidenceRef,parents,synthetic,sourceClass,payloadDigest,observed:raw.observed===true,verifierRef:text(raw.verifierRef,500)};
}

export function compileProofDag({proofs=[]}={}){
  const reasons=[];const rows=(Array.isArray(proofs)?proofs:[]).map(normalizeProof);const byId=new Map();
  for(const row of rows){
    if(!row.id) reasons.push('proof-id-required');
    else if(byId.has(row.id)) reasons.push(`duplicate-proof-id:${row.id}`);
    else byId.set(row.id,row);
    if(!row.kind) reasons.push(`proof-kind-required:${row.id||'unknown'}`);
    if(!row.evidenceRef) reasons.push(`evidence-ref-required:${row.id||'unknown'}`);
    if(!['OBSERVED','SYNTHETIC','DERIVED','EXTERNAL','PRIVATE','SYSTEM'].includes(row.sourceClass)) reasons.push(`valid-source-class-required:${row.id||'unknown'}`);
    if(row.synthetic && row.sourceClass==='OBSERVED') reasons.push(`synthetic-proof-cannot-be-observed-class:${row.id||'unknown'}`);
  }
  for(const row of rows) for(const parent of row.parents) if(!byId.has(parent)) reasons.push(`proof-parent-missing:${row.id}:${parent}`);
  const visiting=new Set(),visited=new Set();
  const visit=id=>{
    if(visited.has(id))return;
    if(visiting.has(id)){reasons.push(`proof-cycle:${id}`);return;}
    visiting.add(id);for(const p of byId.get(id)?.parents||[])visit(p);visiting.delete(id);visited.add(id);
  };
  for(const id of byId.keys())visit(id);
  if(reasons.length)return fail(reasons);

  const memo=new Map();
  const address=id=>{
    if(memo.has(id))return memo.get(id);
    const row=byId.get(id);const parentAddresses=row.parents.map(address).sort();
    const digest=`sha256:${hash({kind:row.kind,evidenceRef:row.evidenceRef,parents:parentAddresses,synthetic:row.synthetic,sourceClass:row.sourceClass,payloadDigest:row.payloadDigest,observed:row.observed,verifierRef:row.verifierRef})}`;
    memo.set(id,digest);return digest;
  };
  const nodes=rows.map(row=>({...row,address:address(row.id),parentAddresses:row.parents.map(address).sort()})).sort((a,b)=>a.id.localeCompare(b.id));
  const dagDigest=`sha256:${hash(nodes.map(n=>[n.id,n.address]))}`;
  return{ok:true,status:'PROOF_DAG_COMPILED',version:CONTENT_ADDRESSED_PROOF_DAG_VERSION,nodes,dagDigest,externalEffectAuthority:'NONE',businessEffectAuthority:'NONE'};
}

export function inspectProofAncestry({dag,proofId}={}){
  if(!dag?.ok||dag.status!=='PROOF_DAG_COMPILED')return fail(['valid-proof-dag-required']);
  const byId=new Map(dag.nodes.map(n=>[n.id,n]));const target=byId.get(text(proofId,200));
  if(!target)return fail(['existing-proof-id-required']);
  const ids=[];const stack=[target.id];
  while(stack.length){const id=stack.pop();if(ids.includes(id))continue;ids.push(id);for(const p of byId.get(id)?.parents||[])stack.push(p);}
  ids.sort();const ancestry=ids.map(id=>byId.get(id));
  const syntheticAncestors=ancestry.filter(n=>n.synthetic||n.sourceClass==='SYNTHETIC').map(n=>n.id);
  return{ok:true,status:'PROOF_ANCESTRY_INSPECTED',proofId:target.id,proofAddress:target.address,ancestry,syntheticAncestorIds:syntheticAncestors,containsSyntheticAncestry:syntheticAncestors.length>0,externalEffectAuthority:'NONE',businessEffectAuthority:'NONE'};
}

export function assertObservedProof({dag,proofId}={}){
  const ancestry=inspectProofAncestry({dag,proofId});if(!ancestry.ok)return ancestry;
  const target=ancestry.ancestry.find(n=>n.id===proofId);
  const reasons=[];
  if(target?.observed!==true)reasons.push('target-proof-must-be-observed');
  if(ancestry.containsSyntheticAncestry)reasons.push('synthetic-ancestry-visible-and-not-admissible-as-observed-proof');
  return reasons.length?fail(reasons,{proofId,syntheticAncestorIds:ancestry.syntheticAncestorIds}):{ok:true,status:'OBSERVED_PROOF_ANCESTRY_CLEAN',proofId,proofAddress:target.address,externalEffectAuthority:'NONE',businessEffectAuthority:'NONE'};
}
