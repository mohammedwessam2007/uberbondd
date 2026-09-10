import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, lstat, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runSovereignReleaseCourier } from '../ops/sovereign/sovereign-release-courier.mjs';

async function fixture(){
  const root=await mkdtemp(path.join(tmpdir(),'uberbond-courier-'));
  const source=path.join(root,'source'),inbox=path.join(root,'inbox');
  const name='release-aaaaaaaaaaaa-bbbbbbbbbbbbbbbb';const rel=path.join(source,name);
  await mkdir(rel,{recursive:true});await mkdir(inbox,{recursive:true});
  for(const f of ['release.env','SHA256SUMS','release.sig','images.oci.tar'])await writeFile(path.join(rel,f),f);
  await writeFile(path.join(source,'NEXT_RELEASE'),`${name}\n`);
  return{root,source,inbox,name,rel};
}
const run=f=>runSovereignReleaseCourier({env:{UBERBOND_RELEASE_COURIER_SOURCE:f.source,UBERBOND_RELEASE_COURIER_RUNTIME_INBOX:f.inbox}});

test('couriers signed bundle atomically without granting signing or deployment authority',async()=>{
  const f=await fixture();const out=await run(f);
  assert.equal(out.ok,true);assert.equal(out.status,'SIGNED_RELEASE_COURIERED_TO_RUNTIME_INBOX');assert.equal(out.signingAuthority,'NONE');assert.equal(out.deploymentAuthority,'NONE');
  assert.equal((await readFile(path.join(f.inbox,'NEXT_RELEASE'),'utf8')).trim(),f.name);assert.equal((await lstat(path.join(f.inbox,f.name))).isDirectory(),true);
});

test('recovers crash after bundle rename but before runtime marker publication',async()=>{
  const f=await fixture();assert.equal((await run(f)).ok,true);await rm(path.join(f.inbox,'NEXT_RELEASE'));
  const recovered=await run(f);assert.equal(recovered.ok,true);assert.equal(recovered.status,'SOVEREIGN_RELEASE_PUBLICATION_RECOVERED_AFTER_COPY');
  assert.equal((await readFile(path.join(f.inbox,'NEXT_RELEASE'),'utf8')).trim(),f.name);assert.equal(recovered.deploymentAuthority,'NONE');
});

test('does not republish a release carrying a runtime APPLIED receipt',async()=>{
  const f=await fixture();assert.equal((await run(f)).ok,true);await rm(path.join(f.inbox,'NEXT_RELEASE'));await writeFile(path.join(f.inbox,`APPLIED-${f.name}-20260910T050000Z`),`${f.name}\n`);
  const out=await run(f);assert.equal(out.ok,true);assert.equal(out.status,'SOVEREIGN_RELEASE_ALREADY_APPLIED_BY_RUNTIME');assert.equal(await lstat(path.join(f.inbox,'NEXT_RELEASE')).then(()=>true).catch(()=>false),false);
});

test('refuses to overwrite a different runtime release pointer during recovery',async()=>{
  const f=await fixture();assert.equal((await run(f)).ok,true);await writeFile(path.join(f.inbox,'NEXT_RELEASE'),'release-cccccccccccc-dddddddddddddddd\n');
  const out=await run(f);assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('runtime-inbox-pointer-conflict'));
});

test('refuses unsafe marker names',async()=>{const f=await fixture();await writeFile(path.join(f.source,'NEXT_RELEASE'),'../escape\n');const out=await run(f);assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('safe-release-name-required'));});

test('refuses symlink anywhere in signed bundle',async()=>{const f=await fixture();await symlink('/etc/passwd',path.join(f.rel,'evil'));const out=await run(f);assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('release-tree-symlink-refused'));});

test('refuses source and runtime inbox overlap',async()=>{const f=await fixture();const out=await runSovereignReleaseCourier({env:{UBERBOND_RELEASE_COURIER_SOURCE:f.source,UBERBOND_RELEASE_COURIER_RUNTIME_INBOX:path.join(f.source,'nested')}});assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('courier-source-destination-separation-required'));});

test('service is zero-network and cannot write signer outbox',async()=>{
  const service=await readFile(new URL('../ops/sovereign/uberbond-release-courier.service',import.meta.url),'utf8');
  assert.match(service,/RestrictAddressFamilies=AF_UNIX/);assert.match(service,/IPAddressDeny=any/);assert.match(service,/ReadOnlyPaths=\/mnt\/uberbond-signer-outbox/);assert.match(service,/ReadWritePaths=\/var\/lib\/uberbond-control\/inbox/);assert.doesNotMatch(service,/UBERBOND_RELEASE_SIGNING_KEY|uberbondctl|deploy/);
});

test('courier path watches only the signer publication marker',async()=>{const unit=await readFile(new URL('../ops/sovereign/uberbond-release-courier.path',import.meta.url),'utf8');assert.match(unit,/PathChanged=\/mnt\/uberbond-signer-outbox\/NEXT_RELEASE/);assert.match(unit,/Unit=uberbond-release-courier\.service/);});
