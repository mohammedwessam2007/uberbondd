import crypto from 'node:crypto';

export const EXTERNAL_PROOF_ROUTER_VERSION='uberbond.external-proof-router.v1';
export const EXTERNAL_PROOF_CLASSES=Object.freeze(['SOURCE_INTERNAL','RUNTIME_PHYSICAL','PROVIDER_ACCEPTANCE','BANK_PAYMENT','CUSTOMER_ACCEPTANCE','OWNER_IDENTITY','OWNER_CUSTODY','LEGAL_CLEARANCE','ELAPSED_TIME','REAL_WORLD_OBSERVATION']);
const EXTERNAL=new Set(EXTERNAL_PROOF_CLASSES.filter(x=>x!=='SOURCE_INTERNAL'));
const text=(v,n=800)=>{const s=String(v??'').trim();return s&&s.length<=n?s:null;};
const refs=a=>[...new Set((Array.isArray(a)?a:[]).map(v=>text(v,1000)).filter(Boolean))];
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const fail=(codes,extra={})=>({ok:false,status:'EXTERNAL_PROOF_ROUTER_REFUSED',reasonCodes:[...new Set(codes.filter(Boolean))],externalEffectAuthority:'NONE',businessEffectAuthority:'NONE',...extra});

export function routeMissingProofs({requirements=[]}={}){
  const rows=[];const reasons=[];
  for(const raw of Array.isArray(requirements)?requirements:[]){
    const id=text(raw?.id,200),proofClass=text(raw?.proofClass,80)?.toUpperCase(),description=text(raw?.description,800),evidenceRefs=refs(raw?.evidenceRefs);
    if(!id||!description){reasons.push('proof-requirement-id-and-description-required');continue;}
    if(!EXTERNAL_PROOF_CLASSES.includes(proofClass)){reasons.push(`valid-proof-class-required:${id}`);continue;}
    const satisfied=raw.satisfied===true&&evidenceRefs.length>0;
    const route=satisfied?'CLOSED':proofClass==='SOURCE_INTERNAL'?'INTERNAL_CLOSABLE':'EXTERNAL_OR_OWNER_ONLY';
    rows.push({id,description,proofClass,evidenceRefs,satisfied,route,ownerActionAllowed:!satisfied&&['OWNER_IDENTITY','OWNER_CUSTODY','LEGAL_CLEARANCE'].includes(proofClass),machineMayPrepare:!satisfied,proofMayBeSynthesized:false});
  }
  if(reasons.length)return fail(reasons);
  const open=rows.filter(row=>!row.satisfied),internal=open.filter(row=>row.route==='INTERNAL_CLOSABLE'),external=open.filter(row=>row.route==='EXTERNAL_OR_OWNER_ONLY');
  const packet={schemaVersion:EXTERNAL_PROOF_ROUTER_VERSION,requirements:rows,counts:{total:rows.length,closed:rows.length-open.length,internalClosable:internal.length,externalOrOwnerOnly:external.length},internalQueue:internal.map(row=>row.id),externalQueue:external.map(row=>({id:row.id,proofClass:row.proofClass,ownerActionAllowed:row.ownerActionAllowed})),status:open.length===0?'ALL_PROOF_REQUIREMENTS_SATISFIED':internal.length?'INTERNAL_PROOF_WORK_REMAINS':'EXTERNAL_OR_OWNER_ONLY'};
  packet.packetDigest=`sha256:${hash(packet)}`;
  return{ok:true,...packet,truthBoundary:'ROUTING_CLASSIFIES_WHERE_MISSING_PROOF_MUST_COME_FROM__IT_NEVER_CREATES_THE_PROOF',externalEffectAuthority:'NONE',businessEffectAuthority:'NONE'};
}

export function canInternalEngineeringClose(requirement={}){
  const proofClass=text(requirement.proofClass,80)?.toUpperCase();
  return proofClass==='SOURCE_INTERNAL';
}
