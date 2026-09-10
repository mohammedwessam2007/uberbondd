#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SAFE_RELEASE=/^release-[a-f0-9]{12}-[a-f0-9]{16}$/;
const REQUIRED=['release.env','SHA256SUMS','release.sig','images.oci.tar'];
const MAX_ENTRIES=4096;
const MAX_BYTES=64*1024*1024*1024;
const fail=(reasonCodes,extra={})=>({ok:false,status:'SOVEREIGN_RELEASE_COURIER_REFUSED',reasonCodes:[...new Set(reasonCodes.filter(Boolean))],signingAuthority:'NONE',deploymentAuthority:'NONE',businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',...extra});
async function lst(p){try{return await fs.lstat(p);}catch{return null;}}
async function regular(p){const s=await lst(p);return !!s&&s.isFile()&&!s.isSymbolicLink();}
async function directory(p){const s=await lst(p);return !!s&&s.isDirectory()&&!s.isSymbolicLink();}
async function atomic(file,body){await fs.mkdir(path.dirname(file),{recursive:true});const tmp=`${file}.tmp.${process.pid}`;await fs.writeFile(tmp,body,{mode:0o640});await fs.rename(tmp,file);}
async function inspectTree(root){let entries=0,bytes=0;const stack=[root];while(stack.length){const dir=stack.pop();for(const ent of await fs.readdir(dir,{withFileTypes:true})){entries++;if(entries>MAX_ENTRIES)return fail(['release-tree-entry-limit-exceeded']);const p=path.join(dir,ent.name);const s=await fs.lstat(p);if(s.isSymbolicLink())return fail(['release-tree-symlink-refused'],{path:p});if(s.isDirectory()){stack.push(p);continue;}if(!s.isFile())return fail(['release-tree-special-node-refused'],{path:p});bytes+=s.size;if(bytes>MAX_BYTES)return fail(['release-tree-byte-limit-exceeded']);}}return{ok:true,entries,bytes};}
async function copyTree(src,dst){await fs.mkdir(dst,{recursive:true,mode:0o750});for(const name of await fs.readdir(src)){const from=path.join(src,name),to=path.join(dst,name);const s=await fs.lstat(from);if(s.isSymbolicLink())throw new Error(`copy-time-symlink-refused:${name}`);if(s.isDirectory()){await copyTree(from,to);continue;}if(!s.isFile())throw new Error(`copy-time-special-node-refused:${name}`);await fs.copyFile(from,to);}}

export async function runSovereignReleaseCourier({env=process.env}={}){
  const sourceRoot=path.resolve(env.UBERBOND_RELEASE_COURIER_SOURCE||'/mnt/uberbond-signer-outbox');
  const runtimeInbox=path.resolve(env.UBERBOND_RELEASE_COURIER_RUNTIME_INBOX||'/var/lib/uberbond-control/inbox');
  if(sourceRoot===runtimeInbox||runtimeInbox.startsWith(`${sourceRoot}${path.sep}`)||sourceRoot.startsWith(`${runtimeInbox}${path.sep}`))return fail(['courier-source-destination-separation-required']);
  const marker=path.join(sourceRoot,'NEXT_RELEASE');
  if(!await regular(marker))return fail(['regular-signer-next-release-marker-required']);
  const releaseName=String(await fs.readFile(marker,'utf8')).trim();
  if(!SAFE_RELEASE.test(releaseName))return fail(['safe-release-name-required']);
  const source=path.join(sourceRoot,releaseName);
  if(!await directory(source))return fail(['signed-release-directory-required']);
  for(const name of REQUIRED)if(!await regular(path.join(source,name)))return fail([`signed-release-missing:${name}`]);
  const tree=await inspectTree(source);if(!tree.ok)return tree;
  await fs.mkdir(runtimeInbox,{recursive:true,mode:0o700});
  const final=path.join(runtimeInbox,releaseName);const tmp=path.join(runtimeInbox,`.courier-${releaseName}-${process.pid}`);
  if(await lst(final))return{ok:true,status:'SOVEREIGN_RELEASE_ALREADY_IN_RUNTIME_INBOX',releaseName,signingAuthority:'NONE',deploymentAuthority:'NONE',businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',truthBoundary:'Presence in the runtime inbox does not prove signature admission, deployment, recovery, customer, payment, life-outcome, or ASI evidence.'};
  await fs.rm(tmp,{recursive:true,force:true});
  try{await copyTree(source,tmp);for(const name of REQUIRED)if(!await regular(path.join(tmp,name)))throw new Error(`copied-release-missing:${name}`);await fs.rename(tmp,final);await atomic(path.join(runtimeInbox,'NEXT_RELEASE'),`${releaseName}\n`);}catch(error){await fs.rm(tmp,{recursive:true,force:true});return fail([`atomic-courier-copy-failed:${String(error?.message||error).slice(0,180)}`]);}
  const receipt={ok:true,status:'SIGNED_RELEASE_COURIERED_TO_RUNTIME_INBOX',releaseName,entries:tree.entries,bytes:tree.bytes,signingAuthority:'NONE',deploymentAuthority:'NONE',businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',truthBoundary:'Courier authority is limited to an already-signed bundle copy into the sovereign runtime inbox. Runtime signature verification, anti-replay admission, deployment and recovery remain separate authorities and require real execution evidence.'};
  await atomic(path.join(runtimeInbox,'courier-receipt.json'),`${JSON.stringify(receipt,null,2)}\n`);
  return receipt;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  runSovereignReleaseCourier().then(r=>{process.stdout.write(`${JSON.stringify(r,null,2)}\n`);if(!r.ok)process.exitCode=2;}).catch(e=>{process.stdout.write(`${JSON.stringify(fail([`unexpected:${String(e?.message||e).slice(0,180)}`]),null,2)}\n`);process.exitCode=2;});
}
