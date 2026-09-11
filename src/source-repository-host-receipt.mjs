import crypto from 'node:crypto';

export const SOURCE_REPOSITORY_HOST_RECEIPT_VERSION='uberbond.source-repository-host.v1';
const SHA40=/^[0-9a-f]{40}$/;
const SHA256=/^sha256:[0-9a-f]{64}$/;
const RECEIPT_KEYS=Object.freeze(['businessEffectAuthority','commands','externalEffectAuthority','observed','ok','reasonCodes','receiptDigest','schemaVersion','sourceCommit','status','truthBoundary']);
const OBSERVED_KEYS=Object.freeze(['bundleDigest','cleanupOk','cutoverExitCode','cutoverStateDigest','exportExitCode','independentHost','originalTree','primaryHost','restoreExitCode','restoredCommit','restoredTree','rollbackExitCode','rollbackStateDigest','trackedFileCount']);
const TRUTH_BOUNDARY='This receipt proves one exact-source repository export, byte-identical Git-tree restore, execution from the restored copy, and rollback execution from the original copy on a distinct named runtime location. It does not prove deployment-provider independence, future backup availability, credential custody, customer outcomes, or any external business effect.';
const ZERO='NONE';
const digest=value=>`sha256:${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
const exactKeys=(value,expected)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join('\0')===[...expected].sort().join('\0');
const text=(value,max=500)=>{const s=String(value??'').trim();return s&&s.length<=max?s:null;};
const int=value=>Number.isSafeInteger(Number(value))?Number(value):null;

export function sourceRepositoryHostReceiptPreimage(receipt={}){
  return {ok:receipt.ok,schemaVersion:receipt.schemaVersion,status:receipt.status,reasonCodes:receipt.reasonCodes,sourceCommit:receipt.sourceCommit,observed:receipt.observed,commands:receipt.commands,businessEffectAuthority:receipt.businessEffectAuthority,externalEffectAuthority:receipt.externalEffectAuthority,truthBoundary:receipt.truthBoundary};
}

export function verifySourceRepositoryHostReceiptIntegrity(receipt={}){
  if(!exactKeys(receipt,RECEIPT_KEYS)||receipt.ok!==true||receipt.schemaVersion!==SOURCE_REPOSITORY_HOST_RECEIPT_VERSION||receipt.status!=='SOURCE_REPOSITORY_HOST_REHEARSAL_PASSED')return false;
  if(!Array.isArray(receipt.reasonCodes)||receipt.reasonCodes.length!==0||!SHA40.test(String(receipt.sourceCommit||'').toLowerCase()))return false;
  const o=receipt.observed;if(!exactKeys(o,OBSERVED_KEYS))return false;
  if(!text(o.primaryHost,160)||!text(o.independentHost,160)||String(o.primaryHost).trim().toLowerCase()===String(o.independentHost).trim().toLowerCase())return false;
  if(!SHA256.test(String(o.bundleDigest||''))||!SHA40.test(String(o.originalTree||''))||!SHA40.test(String(o.restoredTree||'')))return false;
  if(String(o.restoredCommit||'').toLowerCase()!==String(receipt.sourceCommit).toLowerCase()||String(o.originalTree).toLowerCase()!==String(o.restoredTree).toLowerCase())return false;
  if(!SHA256.test(String(o.cutoverStateDigest||''))||o.cutoverStateDigest!==o.rollbackStateDigest)return false;
  if(o.exportExitCode!==0||o.restoreExitCode!==0||o.cutoverExitCode!==0||o.rollbackExitCode!==0||o.cleanupOk!==true||!Number.isSafeInteger(o.trackedFileCount)||o.trackedFileCount<=0)return false;
  if(!Array.isArray(receipt.commands)||receipt.commands.length!==4||receipt.commands.some(command=>!text(command,1000)))return false;
  if(receipt.businessEffectAuthority!==ZERO||receipt.externalEffectAuthority!==ZERO||receipt.truthBoundary!==TRUTH_BOUNDARY||!SHA256.test(String(receipt.receiptDigest||'')))return false;
  return receipt.receiptDigest===digest(sourceRepositoryHostReceiptPreimage(receipt));
}

export function compileSourceRepositoryHostReceipt(input={}){
  const reasons=[];
  const sourceCommit=String(input.sourceCommit||'').trim().toLowerCase();
  const primaryHost=text(input.primaryHost,160),independentHost=text(input.independentHost,160);
  const originalTree=String(input.originalTree||'').trim().toLowerCase(),restoredTree=String(input.restoredTree||'').trim().toLowerCase(),restoredCommit=String(input.restoredCommit||'').trim().toLowerCase();
  const bundleDigest=String(input.bundleDigest||'').trim().toLowerCase();
  const cutoverStateDigest=String(input.cutoverStateDigest||'').trim().toLowerCase(),rollbackStateDigest=String(input.rollbackStateDigest||'').trim().toLowerCase();
  const exportExitCode=int(input.exportExitCode),restoreExitCode=int(input.restoreExitCode),cutoverExitCode=int(input.cutoverExitCode),rollbackExitCode=int(input.rollbackExitCode),trackedFileCount=int(input.trackedFileCount);
  const commands=Array.isArray(input.commands)?input.commands.map(v=>text(v,1000)).filter(Boolean):[];
  if(!SHA40.test(sourceCommit))reasons.push('exact-source-commit-required');
  if(!primaryHost||!independentHost)reasons.push('named-primary-and-independent-hosts-required');
  if(primaryHost&&independentHost&&primaryHost.toLowerCase()===independentHost.toLowerCase())reasons.push('independent-host-must-differ-from-primary-host');
  if(!SHA256.test(bundleDigest))reasons.push('git-bundle-digest-required');
  if(!SHA40.test(originalTree)||!SHA40.test(restoredTree)||originalTree!==restoredTree)reasons.push('byte-identical-git-tree-restore-required');
  if(restoredCommit!==sourceCommit)reasons.push('restored-commit-must-match-exact-source');
  if(exportExitCode!==0)reasons.push('source-export-must-succeed');
  if(restoreExitCode!==0)reasons.push('source-restore-must-succeed');
  if(cutoverExitCode!==0)reasons.push('restored-copy-cutover-execution-must-succeed');
  if(rollbackExitCode!==0)reasons.push('original-copy-rollback-execution-must-succeed');
  if(!SHA256.test(cutoverStateDigest)||cutoverStateDigest!==rollbackStateDigest)reasons.push('cutover-and-rollback-state-must-match');
  if(!Number.isSafeInteger(trackedFileCount)||trackedFileCount<=0)reasons.push('nonempty-tracked-source-required');
  if(input.cleanupOk!==true)reasons.push('temporary-restore-cleanup-required');
  if(commands.length!==4)reasons.push('exact-executed-command-chain-required');
  const ok=reasons.length===0;
  const receipt={ok,schemaVersion:SOURCE_REPOSITORY_HOST_RECEIPT_VERSION,status:ok?'SOURCE_REPOSITORY_HOST_REHEARSAL_PASSED':'SOURCE_REPOSITORY_HOST_REHEARSAL_REFUSED',reasonCodes:reasons,sourceCommit:SHA40.test(sourceCommit)?sourceCommit:null,observed:{bundleDigest:SHA256.test(bundleDigest)?bundleDigest:null,cleanupOk:input.cleanupOk===true,cutoverExitCode,cutoverStateDigest:SHA256.test(cutoverStateDigest)?cutoverStateDigest:null,exportExitCode,independentHost,originalTree:SHA40.test(originalTree)?originalTree:null,primaryHost,restoreExitCode,restoredCommit:SHA40.test(restoredCommit)?restoredCommit:null,restoredTree:SHA40.test(restoredTree)?restoredTree:null,rollbackExitCode,rollbackStateDigest:SHA256.test(rollbackStateDigest)?rollbackStateDigest:null,trackedFileCount},commands,businessEffectAuthority:ZERO,externalEffectAuthority:ZERO,truthBoundary:TRUTH_BOUNDARY};
  if(ok)receipt.receiptDigest=digest(sourceRepositoryHostReceiptPreimage(receipt));
  return receipt;
}
