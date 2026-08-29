import crypto from 'node:crypto';

export const SENDER_MESH_POLICY_VERSION='uberbond.sender-infrastructure-mesh-1.0.0';
export const MESSAGE_CLASSES=Object.freeze(['TRANSACTIONAL','MARKETING']);
const HARD_SPAM_RATE=0.003;
const PREFERRED_SPAM_RATE=0.001;

function text(v,max=240){const s=String(v??'').trim();return s&&s.length<=max?s:null;}
function slug(v,max=120){const s=text(v,max);return s?s.toLowerCase().replace(/[^a-z0-9._:-]+/g,'-').replace(/^-+|-+$/g,'')||null:null;}
function fail(reasons,extra={}){return{ok:false,policyVersion:SENDER_MESH_POLICY_VERSION,status:'PAUSE_SENDER_INFRASTRUCTURE',reasonCodes:[...new Set(reasons)],businessEffectAuthority:'NONE',...extra};}
function normalizeNode(input={}){
  const id=slug(input.id); const organizationRef=text(input.organizationRef,200); const sendingDomainRef=text(input.sendingDomainRef,240); const ipPoolRef=text(input.ipPoolRef,240);
  const messageClasses=[...new Set((Array.isArray(input.messageClasses)?input.messageClasses:[]).map(v=>String(v).trim().toUpperCase()).filter(v=>MESSAGE_CLASSES.includes(v)))];
  const auth=input.authentication||{}; const reputation=input.reputation||{};
  const node={
    id, organizationRef, sendingDomainRef, ipPoolRef, messageClasses,
    authentication:{spf:auth.spf===true,dkim:auth.dkim===true,dmarc:auth.dmarc===true,rdns:auth.rdns===true,tls:auth.tls===true,aligned:auth.aligned===true},
    warmupState:String(input.warmupState||'UNWARMED').trim().toUpperCase(),
    providerPolicyRef:text(input.providerPolicyRef,240),
    dailyCapacity:Number.isSafeInteger(input.dailyCapacity)&&input.dailyCapacity>=0?input.dailyCapacity:0,
    sentToday:Number.isSafeInteger(input.sentToday)&&input.sentToday>=0?input.sentToday:0,
    reputation:{spamRate:Number.isFinite(Number(reputation.spamRate))?Number(reputation.spamRate):null,blocked:reputation.blocked===true,degraded:reputation.degraded===true},
    oneClickUnsubscribeReady:input.oneClickUnsubscribeReady===true,
    stableIdentityAttested:input.stableIdentityAttested===true
  };
  return node;
}
function nodeReasons(node,messageClass){
  const reasons=[];
  if (!node.id||!node.organizationRef||!node.sendingDomainRef||!node.providerPolicyRef) reasons.push('sender-node-core-reference-missing');
  if (!node.messageClasses.includes(messageClass)) reasons.push('message-class-not-authorized-on-node');
  for(const key of ['spf','dkim','dmarc','rdns','tls','aligned']) if(!node.authentication[key]) reasons.push(`sender-auth-${key}-required`);
  if (!node.stableIdentityAttested) reasons.push('stable-sender-identity-attestation-required');
  if (node.warmupState!=='WARM') reasons.push('sender-node-not-warm');
  if (node.reputation.blocked) reasons.push('sender-node-blocked');
  if (node.reputation.degraded) reasons.push('sender-node-degraded');
  if (node.reputation.spamRate==null) reasons.push('sender-spam-rate-unknown');
  else if (node.reputation.spamRate>=HARD_SPAM_RATE) reasons.push('sender-spam-rate-hard-stop');
  if (messageClass==='MARKETING'&&!node.oneClickUnsubscribeReady) reasons.push('one-click-unsubscribe-required-for-marketing');
  if (node.sentToday>=node.dailyCapacity) reasons.push('sender-node-capacity-exhausted');
  return reasons;
}
function score(node){
  const remaining=Math.max(0,node.dailyCapacity-node.sentToday);
  const spam=node.reputation.spamRate??1;
  const reputationBonus=spam<=PREFERRED_SPAM_RATE?1000:Math.max(0,500-Math.round(spam*100000));
  return reputationBonus+remaining;
}
export function allocateSenderInfrastructure({nodes=[],messageClass,organizationRef,rotationReason='LOAD_BALANCE_HEALTHY_CAPACITY'}={}){
  const klass=String(messageClass??'').trim().toUpperCase(); const org=text(organizationRef,200); const reason=String(rotationReason??'').trim().toUpperCase();
  if(!MESSAGE_CLASSES.includes(klass))return fail(['invalid-message-class']);
  if(!org)return fail(['organization-ref-required']);
  if(/BYPASS|EVADE|BLOCK|BAN|REPUTATION_RESET|QUOTA_EVASION/.test(reason))return fail(['sender-identity-or-reputation-evasion-prohibited']);
  const normalized=(Array.isArray(nodes)?nodes:[]).map(normalizeNode).filter(n=>n.organizationRef===org);
  const evaluated=normalized.map(node=>({node,reasons:nodeReasons(node,klass)}));
  const eligible=evaluated.filter(x=>x.reasons.length===0).map(x=>x.node).sort((a,b)=>score(b)-score(a)||a.id.localeCompare(b.id));
  if(!eligible.length)return fail(['no-healthy-authorized-sender-node'],{evaluated:evaluated.map(x=>({id:x.node.id,reasons:x.reasons}))});
  const selected=eligible[0];
  const allocation={schemaVersion:'uberbond-sender-allocation-1.0.0',messageClass:klass,organizationRef:org,senderNodeId:selected.id,sendingDomainRef:selected.sendingDomainRef,ipPoolRef:selected.ipPoolRef||null,rotationReason:reason,remainingDailyCapacity:selected.dailyCapacity-selected.sentToday,reputationState:selected.reputation.spamRate<=PREFERRED_SPAM_RATE?'HEALTHY':'WATCH',policyRef:selected.providerPolicyRef,selectionDigest:crypto.createHash('sha256').update(JSON.stringify([org,klass,selected.id,reason])).digest('hex')};
  return{ok:true,policyVersion:SENDER_MESH_POLICY_VERSION,status:'SENDER_NODE_ALLOCATED',allocation,businessEffectAuthority:'NONE'};
}
