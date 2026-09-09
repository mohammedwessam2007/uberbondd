import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const RECURSIVE_GOVERNANCE_PRINCIPALS_VERSION='uberbond.recursive-governance-principals.v1';
const SHA256=/^(?:sha256:)?[0-9a-f]{64}$/;
const ROLES=Object.freeze(['PROPOSER','EVALUATOR','HOLDOUT','APPROVER','DEPLOYER','MONITOR','EVIDENCE_STORE','ROLLBACK','CANON_WRITER','SECURITY_POLICY']);
const INDEPENDENT_ROLES=new Set(['EVALUATOR','HOLDOUT','MONITOR','EVIDENCE_STORE','ROLLBACK','SECURITY_POLICY']);
const BUILDER_ROLES=new Set(['PROPOSER','APPROVER','DEPLOYER','CANON_WRITER']);
const text=(v,max=500)=>{const s=String(v??'').trim();return s&&s.length<=max?s:null;};
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const digest=v=>`sha256:${crypto.createHash('sha256').update(JSON.stringify(stable(v))).digest('hex')}`;
const fail=(reasons,extra={})=>({ok:false,status:'RECURSIVE_GOVERNANCE_PRINCIPAL_CONTROL_REFUSED',reasonCodes:[...new Set(reasons)],businessEffectAuthority:'NONE',externalEffectLedger:structuredClone(ZERO_EXTERNAL_EFFECTS),...extra});
function normalizeRole(raw={}){
  const credentialFingerprint=text(raw.credentialFingerprint,80)?.toLowerCase()||null;
  return{
    principalId:text(raw.principalId,200),
    credentialFingerprint:SHA256.test(credentialFingerprint||'')?credentialFingerprint:null,
    custodyDomain:text(raw.custodyDomain,200)?.toLowerCase()||null,
    controlDomain:text(raw.controlDomain,200)?.toLowerCase()||null
  };
}
const identityKey=role=>role?.principalId&&role?.credentialFingerprint?`${role.principalId.toLowerCase()}|${role.credentialFingerprint}`:null;
const credentialKey=role=>role?.credentialFingerprint||null;

export function verifyRecursiveGovernancePrincipals({generations=[]}={}){
  if(!Array.isArray(generations)||generations.length===0)return fail(['at-least-one-generation-required']);
  const reasons=[];
  const normalized=generations.map((g,index)=>({
    generationId:text(g?.generationId,200)||`index:${index}`,
    verifierTrustEpoch:text(g?.verifierTrustEpoch,100)?.toLowerCase()||null,
    verifierTrustTransitionRef:text(g?.verifierTrustTransitionRef,500),
    controls:Object.fromEntries(ROLES.map(role=>[role,normalizeRole(g?.principalControls?.[role])]))
  }));

  for(const gen of normalized){
    for(const role of ROLES){
      const c=gen.controls[role];
      if(!c.principalId||!c.credentialFingerprint||!c.custodyDomain||!c.controlDomain)reasons.push(`complete-principal-control-required:${gen.generationId}:${role}`);
    }
    if(!SHA256.test(gen.verifierTrustEpoch||''))reasons.push(`verifier-trust-epoch-required:${gen.generationId}`);
    const builderIdentities=new Set([...BUILDER_ROLES].map(role=>identityKey(gen.controls[role])).filter(Boolean));
    const builderCredentials=new Set([...BUILDER_ROLES].map(role=>credentialKey(gen.controls[role])).filter(Boolean));
    const builderCustody=new Set([...BUILDER_ROLES].map(role=>gen.controls[role]?.custodyDomain).filter(Boolean));
    for(const role of INDEPENDENT_ROLES){
      const c=gen.controls[role];
      if(builderIdentities.has(identityKey(c)))reasons.push(`independent-role-shares-builder-principal:${gen.generationId}:${role}`);
      if(builderCredentials.has(credentialKey(c)))reasons.push(`independent-role-shares-builder-credential:${gen.generationId}:${role}`);
      if(builderCustody.has(c?.custodyDomain))reasons.push(`independent-role-shares-builder-custody:${gen.generationId}:${role}`);
    }
    if(identityKey(gen.controls.EVALUATOR)===identityKey(gen.controls.HOLDOUT))reasons.push(`evaluator-and-holdout-control-must-be-distinct:${gen.generationId}`);
    if(identityKey(gen.controls.MONITOR)===identityKey(gen.controls.EVIDENCE_STORE))reasons.push(`monitor-and-evidence-store-control-must-be-distinct:${gen.generationId}`);
    if(identityKey(gen.controls.ROLLBACK)===identityKey(gen.controls.SECURITY_POLICY))reasons.push(`rollback-and-security-policy-control-must-be-distinct:${gen.generationId}`);
  }

  for(let i=1;i<normalized.length;i+=1){
    const cur=normalized[i];
    const ancestors=normalized.slice(0,i);
    const ancestorBuilderIdentities=new Set(ancestors.flatMap(g=>[...BUILDER_ROLES].map(role=>identityKey(g.controls[role]))).filter(Boolean));
    const ancestorBuilderCredentials=new Set(ancestors.flatMap(g=>[...BUILDER_ROLES].map(role=>credentialKey(g.controls[role]))).filter(Boolean));
    const ancestorBuilderCustody=new Set(ancestors.flatMap(g=>[...BUILDER_ROLES].map(role=>g.controls[role]?.custodyDomain)).filter(Boolean));
    for(const role of INDEPENDENT_ROLES){
      const c=cur.controls[role];
      if(ancestorBuilderIdentities.has(identityKey(c)))reasons.push(`ancestor-builder-cannot-control-descendant-independent-role:${cur.generationId}:${role}`);
      if(ancestorBuilderCredentials.has(credentialKey(c)))reasons.push(`ancestor-builder-credential-cannot-control-descendant-independent-role:${cur.generationId}:${role}`);
      if(ancestorBuilderCustody.has(c?.custodyDomain))reasons.push(`ancestor-builder-custody-cannot-control-descendant-independent-role:${cur.generationId}:${role}`);
    }
    const prev=normalized[i-1];
    if(cur.verifierTrustEpoch!==prev.verifierTrustEpoch&&!cur.verifierTrustTransitionRef)reasons.push(`verifier-trust-root-transition-evidence-required:${cur.generationId}`);
  }

  if(reasons.length)return fail(reasons,{generations:normalized});
  const receipt={version:RECURSIVE_GOVERNANCE_PRINCIPALS_VERSION,generationIds:normalized.map(g=>g.generationId),verifierTrustEpochs:normalized.map(g=>g.verifierTrustEpoch),principalControlDigests:normalized.map(g=>digest(g.controls)),lineageDepth:normalized.length};
  return{ok:true,status:'RECURSIVE_GOVERNANCE_PRINCIPAL_CONTROL_VERIFIED',receipt,receiptDigest:digest(receipt),businessEffectAuthority:'NONE',externalEffectLedger:structuredClone(ZERO_EXTERNAL_EFFECTS),truthBoundary:'Principal, credential and custody separation is structurally verified for the declared generations. This is not runtime custody evidence and grants no self-modification, deployment or external-effect authority.'};
}
