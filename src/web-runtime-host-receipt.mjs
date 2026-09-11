import crypto from 'node:crypto';

export const WEB_RUNTIME_HOST_RECEIPT_VERSION='uberbond.web-runtime-host.v1';
const SHA40=/^[0-9a-f]{40}$/;
const SHA256=/^sha256:[0-9a-f]{64}$/;
const RECEIPT_KEYS=Object.freeze(['businessEffectAuthority','command','externalEffectAuthority','observed','ok','reasonCodes','receiptDigest','schemaVersion','sourceCommit','status','truthBoundary']);
const OBSERVED_KEYS=Object.freeze(['cleanupOk','discoveryDisabled','healthBodyDigest','healthHttpStatus','healthOk','independentHost','isolatedStateObserved','outboundDisabled','portReleased','primaryHost','primaryRouteMutated','processRole','shutdownObserved','storeBackend','version']);
const TRUTH_BOUNDARY='This receipt proves that the exact source release booted and served healthy on a distinct named independent runtime with isolated state and outbound/discovery disabled, then shut down cleanly without mutating the primary route. It closes only WEB_RUNTIME_HOST runtime proof. It does not prove deployment-provider independence, cross-provider cutover, production traffic, customer effects, or business effects.';
const digest=value=>`sha256:${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
const exactKeys=(value,expected)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join('\0')===[...expected].sort().join('\0');
const text=(value,max=500)=>{const s=String(value??'').trim();return s&&s.length<=max?s:null;};

export function webRuntimeHostReceiptPreimage(receipt={}){return {ok:receipt.ok,schemaVersion:receipt.schemaVersion,status:receipt.status,reasonCodes:receipt.reasonCodes,sourceCommit:receipt.sourceCommit,observed:receipt.observed,command:receipt.command,businessEffectAuthority:receipt.businessEffectAuthority,externalEffectAuthority:receipt.externalEffectAuthority,truthBoundary:receipt.truthBoundary};}

export function verifyWebRuntimeHostReceiptIntegrity(receipt={}){
  if(!exactKeys(receipt,RECEIPT_KEYS)||receipt.ok!==true||receipt.schemaVersion!==WEB_RUNTIME_HOST_RECEIPT_VERSION||receipt.status!=='WEB_RUNTIME_HOST_REHEARSAL_PASSED')return false;
  if(!Array.isArray(receipt.reasonCodes)||receipt.reasonCodes.length!==0||!SHA40.test(String(receipt.sourceCommit||'').toLowerCase()))return false;
  const o=receipt.observed;if(!exactKeys(o,OBSERVED_KEYS))return false;
  if(!text(o.primaryHost,160)||!text(o.independentHost,160)||String(o.primaryHost).trim().toLowerCase()===String(o.independentHost).trim().toLowerCase())return false;
  if(o.healthHttpStatus!==200||o.healthOk!==true||o.processRole!=='web'||!text(o.storeBackend,80)||!text(o.version,160)||!SHA256.test(String(o.healthBodyDigest||'')))return false;
  for(const field of ['outboundDisabled','discoveryDisabled','isolatedStateObserved','shutdownObserved','portReleased','cleanupOk'])if(o[field]!==true)return false;
  if(o.primaryRouteMutated!==false)return false;
  if(!text(receipt.command,1000)||receipt.businessEffectAuthority!=='NONE'||receipt.externalEffectAuthority!=='NONE'||receipt.truthBoundary!==TRUTH_BOUNDARY||!SHA256.test(String(receipt.receiptDigest||'')))return false;
  return receipt.receiptDigest===digest(webRuntimeHostReceiptPreimage(receipt));
}

export function compileWebRuntimeHostReceipt(input={}){
  const reasons=[];
  const sourceCommit=String(input.sourceCommit||'').trim().toLowerCase();
  const primaryHost=text(input.primaryHost,160),independentHost=text(input.independentHost,160),processRole=text(input.processRole,80),storeBackend=text(input.storeBackend,80),version=text(input.version,160),command=text(input.command,1000);
  const healthBodyDigest=String(input.healthBodyDigest||'').trim().toLowerCase();
  if(!SHA40.test(sourceCommit))reasons.push('exact-source-commit-required');
  if(!primaryHost||!independentHost)reasons.push('named-primary-and-independent-hosts-required');
  if(primaryHost&&independentHost&&primaryHost.toLowerCase()===independentHost.toLowerCase())reasons.push('independent-host-must-differ-from-primary-host');
  if(Number(input.healthHttpStatus)!==200||input.healthOk!==true)reasons.push('healthy-http-runtime-required');
  if(processRole!=='web')reasons.push('web-process-role-required');
  if(!storeBackend||!version||!SHA256.test(healthBodyDigest))reasons.push('health-state-binding-required');
  if(input.outboundDisabled!==true||input.discoveryDisabled!==true)reasons.push('external-distribution-must-remain-disabled');
  if(input.isolatedStateObserved!==true)reasons.push('isolated-runtime-state-required');
  if(input.shutdownObserved!==true||input.portReleased!==true)reasons.push('independent-runtime-shutdown-and-release-required');
  if(input.primaryRouteMutated!==false)reasons.push('primary-route-must-remain-untouched');
  if(input.cleanupOk!==true)reasons.push('isolated-runtime-cleanup-required');
  if(!command)reasons.push('executed-command-required');
  const ok=reasons.length===0;
  const receipt={ok,schemaVersion:WEB_RUNTIME_HOST_RECEIPT_VERSION,status:ok?'WEB_RUNTIME_HOST_REHEARSAL_PASSED':'WEB_RUNTIME_HOST_REHEARSAL_REFUSED',reasonCodes:reasons,sourceCommit:SHA40.test(sourceCommit)?sourceCommit:null,observed:{cleanupOk:input.cleanupOk===true,discoveryDisabled:input.discoveryDisabled===true,healthBodyDigest:SHA256.test(healthBodyDigest)?healthBodyDigest:null,healthHttpStatus:Number.isSafeInteger(Number(input.healthHttpStatus))?Number(input.healthHttpStatus):null,healthOk:input.healthOk===true,independentHost,isolatedStateObserved:input.isolatedStateObserved===true,outboundDisabled:input.outboundDisabled===true,portReleased:input.portReleased===true,primaryHost,primaryRouteMutated:input.primaryRouteMutated===true,processRole,shutdownObserved:input.shutdownObserved===true,storeBackend,version},command,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',truthBoundary:TRUTH_BOUNDARY};
  if(ok)receipt.receiptDigest=digest(webRuntimeHostReceiptPreimage(receipt));
  return receipt;
}
