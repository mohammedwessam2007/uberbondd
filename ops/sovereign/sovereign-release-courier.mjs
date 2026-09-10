#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const SAFE_RELEASE=/^release-[a-f0-9]{12}-[a-f0-9]{16}$/;
const SAFE_NONCE=/^[a-f0-9]{64}$/;
const REQUIRED=['release.env','SHA256SUMS','release.sig','images.oci.tar'];
const PLACEMENT_FILE='.uberbond-courier-placement.json';
const PLACEMENT_SCHEMA='uberbond.sovereign-release-courier-placement.v1';
const MAX_ENTRIES=4096;
const MAX_BYTES=64*1024*1024*1024;
const authorityBoundary={signingAuthority:'NONE',deploymentAuthority:'NONE',businessEffectAuthority:'NONE',externalEffectAuthority:'NONE'};
const fail=(reasonCodes,extra={})=>({ok:false,status:'SOVEREIGN_RELEASE_COURIER_REFUSED',reasonCodes:[...new Set(reasonCodes.filter(Boolean))],...authorityBoundary,...extra});
async function lst(p){try{return await fs.lstat(p);}catch{return null;}}
async function regular(p){const s=await lst(p);return !!s&&s.isFile()&&!s.isSymbolicLink();}
async function directory(p){const s=await lst(p);return !!s&&s.isDirectory()&&!s.isSymbolicLink();}
async function atomic(file,body){await fs.mkdir(path.dirname(file),{recursive:true});const tmp=`${file}.tmp.${process.pid}`;await fs.writeFile(tmp,body,{mode:0o640});await fs.rename(tmp,file);}
async function inspectTree(root){let entries=0,bytes=0;const stack=[root];while(stack.length){const dir=stack.pop();for(const ent of await fs.readdir(dir,{withFileTypes:true})){entries++;if(entries>MAX_ENTRIES)return fail(['release-tree-entry-limit-exceeded']);const p=path.join(dir,ent.name);const s=await fs.lstat(p);if(s.isSymbolicLink())return fail(['release-tree-symlink-refused'],{path:p});if(s.isDirectory()){stack.push(p);continue;}if(!s.isFile())return fail(['release-tree-special-node-refused'],{path:p});bytes+=s.size;if(bytes>MAX_BYTES)return fail(['release-tree-byte-limit-exceeded']);}}return{ok:true,entries,bytes};}
async function copyTree(src,dst){await fs.mkdir(dst,{recursive:true,mode:0o750});for(const name of await fs.readdir(src)){const from=path.join(src,name),to=path.join(dst,name);const s=await fs.lstat(from);if(s.isSymbolicLink())throw new Error(`copy-time-symlink-refused:${name}`);if(s.isDirectory()){await copyTree(from,to);continue;}if(!s.isFile())throw new Error(`copy-time-special-node-refused:${name}`);await fs.copyFile(from,to);}}
async function appliedReceipt(runtimeInbox,releaseName){for(const name of await fs.readdir(runtimeInbox)){if(!name.startsWith(`APPLIED-${releaseName}-`))continue;if(await regular(path.join(runtimeInbox,name)))return name;}return null;}
function placementRecord(releaseName,nonce){return{schema:PLACEMENT_SCHEMA,releaseName,nonce,...authorityBoundary,truthBoundary:'This receipt proves only that the zero-network courier created this runtime placement. It grants no signing, deployment, business, external, customer, payment, founder-private, or ASI authority.'};}
async function readPlacement(file,releaseName,label){
  if(!await regular(file))return fail([`${label}-courier-placement-evidence-required`]);
  let parsed;try{parsed=JSON.parse(await fs.readFile(file,'utf8'));}catch{return fail([`${label}-courier-placement-evidence-malformed`]);}
  if(parsed?.schema!==PLACEMENT_SCHEMA||parsed?.releaseName!==releaseName||!SAFE_NONCE.test(String(parsed?.nonce||'')))return fail([`${label}-courier-placement-evidence-invalid`]);
  for(const [key,value] of Object.entries(authorityBoundary))if(parsed?.[key]!==value)return fail([`${label}-courier-placement-authority-invalid`]);
  return{ok:true,placement:parsed};
}
async function verifyPlacement(stateRoot,final,releaseName){
  const inside=await readPlacement(path.join(final,PLACEMENT_FILE),releaseName,'release');if(!inside.ok)return inside;
  const journal=await readPlacement(path.join(stateRoot,`${releaseName}.json`),releaseName,'journal');if(!journal.ok)return journal;
  if(inside.placement.nonce!==journal.placement.nonce)return fail(['courier-placement-evidence-mismatch']);
  return{ok:true,nonce:inside.placement.nonce};
}
function overlaps(a,b){return a===b||a.startsWith(`${b}${path.sep}`)||b.startsWith(`${a}${path.sep}`);}

export async function runSovereignReleaseCourier({env=process.env}={}){
  const sourceRoot=path.resolve(env.UBERBOND_RELEASE_COURIER_SOURCE||'/mnt/uberbond-signer-outbox');
  const runtimeInbox=path.resolve(env.UBERBOND_RELEASE_COURIER_RUNTIME_INBOX||'/var/lib/uberbond-control/inbox');
  const stateRoot=path.resolve(env.UBERBOND_RELEASE_COURIER_STATE||'/var/lib/uberbond-release-courier');
  if(overlaps(sourceRoot,runtimeInbox)||overlaps(sourceRoot,stateRoot)||overlaps(runtimeInbox,stateRoot))return fail(['courier-source-runtime-state-separation-required']);
  const marker=path.join(sourceRoot,'NEXT_RELEASE');
  if(!await regular(marker))return fail(['regular-signer-next-release-marker-required']);
  const releaseName=String(await fs.readFile(marker,'utf8')).trim();
  if(!SAFE_RELEASE.test(releaseName))return fail(['safe-release-name-required']);
  const source=path.join(sourceRoot,releaseName);
  if(!await directory(source))return fail(['signed-release-directory-required']);
  for(const name of REQUIRED)if(!await regular(path.join(source,name)))return fail([`signed-release-missing:${name}`]);
  const tree=await inspectTree(source);if(!tree.ok)return tree;
  await fs.mkdir(runtimeInbox,{recursive:true,mode:0o700});
  await fs.mkdir(stateRoot,{recursive:true,mode:0o700});
  const final=path.join(runtimeInbox,releaseName);const tmp=path.join(runtimeInbox,`.courier-${releaseName}-${process.pid}`);const runtimeMarker=path.join(runtimeInbox,'NEXT_RELEASE');
  const placementJournal=path.join(stateRoot,`${releaseName}.json`);
  if(await lst(final)){
    if(!await directory(final))return fail(['existing-runtime-release-not-directory']);
    for(const name of REQUIRED)if(!await regular(path.join(final,name)))return fail([`existing-runtime-release-missing:${name}`]);
    const copiedTree=await inspectTree(final);if(!copiedTree.ok)return fail(copiedTree.reasonCodes||['existing-runtime-release-invalid']);
    const placement=await verifyPlacement(stateRoot,final,releaseName);if(!placement.ok)return placement;
    if(await regular(runtimeMarker)){
      const queued=String(await fs.readFile(runtimeMarker,'utf8')).trim();
      if(queued!==releaseName)return fail(['runtime-inbox-pointer-conflict'],{queuedRelease:queued,releaseName});
      return{ok:true,status:'SOVEREIGN_RELEASE_ALREADY_PUBLISHED_TO_RUNTIME',releaseName,...authorityBoundary,truthBoundary:'Courier-owned placement evidence and the runtime publication marker both identify this release. This does not prove signature admission, deployment, recovery, customer, payment, life-outcome, or ASI evidence.'};
    }
    const applied=await appliedReceipt(runtimeInbox,releaseName);
    if(applied)return{ok:true,status:'SOVEREIGN_RELEASE_ALREADY_APPLIED_BY_RUNTIME',releaseName,appliedReceipt:applied,...authorityBoundary,truthBoundary:'Courier-owned placement evidence exists and a runtime APPLIED receipt identifies this release. The courier does not republish it and claims no deployment or recovery evidence beyond that existing runtime-owned receipt.'};
    await atomic(runtimeMarker,`${releaseName}\n`);
    const receipt={ok:true,status:'SOVEREIGN_RELEASE_PUBLICATION_RECOVERED_AFTER_COPY',releaseName,entries:copiedTree.entries,bytes:copiedTree.bytes,...authorityBoundary,truthBoundary:'The courier recovered only the publication edge after verifying its own isolated durable placement evidence for this copied release. Runtime signature verification, anti-replay admission, deployment and recovery remain separate authorities.'};
    await atomic(path.join(runtimeInbox,'courier-receipt.json'),`${JSON.stringify(receipt,null,2)}\n`);
    return receipt;
  }
  await fs.rm(tmp,{recursive:true,force:true});
  try{
    await copyTree(source,tmp);
    for(const name of REQUIRED)if(!await regular(path.join(tmp,name)))throw new Error(`copied-release-missing:${name}`);
    const placement=placementRecord(releaseName,randomBytes(32).toString('hex'));
    const placementBody=`${JSON.stringify(placement,null,2)}\n`;
    await atomic(path.join(tmp,PLACEMENT_FILE),placementBody);
    await atomic(placementJournal,placementBody);
    await fs.rename(tmp,final);
    await atomic(runtimeMarker,`${releaseName}\n`);
  }catch(error){await fs.rm(tmp,{recursive:true,force:true});return fail([`atomic-courier-copy-failed:${String(error?.message||error).slice(0,180)}`]);}
  const receipt={ok:true,status:'SIGNED_RELEASE_COURIERED_TO_RUNTIME_INBOX',releaseName,entries:tree.entries,bytes:tree.bytes,...authorityBoundary,truthBoundary:'Courier authority is limited to an already-signed bundle copy into the sovereign runtime inbox. Isolated durable placement evidence proves only this courier copy. Runtime signature verification, anti-replay admission, deployment and recovery remain separate authorities and require real execution evidence.'};
  await atomic(path.join(runtimeInbox,'courier-receipt.json'),`${JSON.stringify(receipt,null,2)}\n`);
  return receipt;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  runSovereignReleaseCourier().then(r=>{process.stdout.write(`${JSON.stringify(r,null,2)}\n`);if(!r.ok)process.exitCode=2;}).catch(e=>{process.stdout.write(`${JSON.stringify(fail([`unexpected:${String(e?.message||e).slice(0,180)}`]),null,2)}\n`);process.exitCode=2;});
}
