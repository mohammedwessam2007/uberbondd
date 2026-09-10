import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, lstat, symlink, rm, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runSovereignReleaseCourier } from '../ops/sovereign/sovereign-release-courier.mjs';

async function fixture(){
  const root=await mkdtemp(path.join(tmpdir(),'uberbond-courier-'));
  const source=path.join(root,'source'),inbox=path.join(root,'inbox'),state=path.join(root,'state');
  const name='release-aaaaaaaaaaaa-bbbbbbbbbbbbbbbb';const rel=path.join(source,name);
  await mkdir(rel,{recursive:true});await mkdir(inbox,{recursive:true});await mkdir(state,{recursive:true});
  for(const f of ['release.env','SHA256SUMS','release.sig','images.oci.tar'])await writeFile(path.join(rel,f),f);
  await writeFile(path.join(source,'NEXT_RELEASE'),`${name}\n`);
  return{root,source,inbox,state,name,rel};
}
const run=f=>runSovereignReleaseCourier({env:{UBERBOND_RELEASE_COURIER_SOURCE:f.source,UBERBOND_RELEASE_COURIER_RUNTIME_INBOX:f.inbox,UBERBOND_RELEASE_COURIER_STATE:f.state}});
const placementFile=f=>path.join(f.inbox,f.name,'.uberbond-courier-placement.json');
const placementJournal=f=>path.join(f.state,`${f.name}.json`);
async function precreateCompleteForeignRelease(f){await cp(f.rel,path.join(f.inbox,f.name),{recursive:true});}

test('couriers signed bundle atomically without granting signing or deployment authority',async()=>{
  const f=await fixture();const out=await run(f);
  assert.equal(out.ok,true);assert.equal(out.status,'SIGNED_RELEASE_COURIERED_TO_RUNTIME_INBOX');assert.equal(out.signingAuthority,'NONE');assert.equal(out.deploymentAuthority,'NONE');
  assert.equal((await readFile(path.join(f.inbox,'NEXT_RELEASE'),'utf8')).trim(),f.name);assert.equal((await lstat(path.join(f.inbox,f.name))).isDirectory(),true);
  const inside=JSON.parse(await readFile(placementFile(f),'utf8'));const journal=JSON.parse(await readFile(placementJournal(f),'utf8'));
  assert.equal(inside.releaseName,f.name);assert.equal(inside.nonce,journal.nonce);assert.equal(inside.deploymentAuthority,'NONE');assert.equal(journal.signingAuthority,'NONE');
});

test('second invocation is idempotent only with authentic courier placement evidence',async()=>{
  const f=await fixture();assert.equal((await run(f)).status,'SIGNED_RELEASE_COURIERED_TO_RUNTIME_INBOX');
  const again=await run(f);assert.equal(again.ok,true);assert.equal(again.status,'SOVEREIGN_RELEASE_ALREADY_PUBLISHED_TO_RUNTIME');assert.equal(again.deploymentAuthority,'NONE');
});

test('recovers crash after bundle rename but before runtime marker publication',async()=>{
  const f=await fixture();assert.equal((await run(f)).ok,true);await rm(path.join(f.inbox,'NEXT_RELEASE'));
  const recovered=await run(f);assert.equal(recovered.ok,true);assert.equal(recovered.status,'SOVEREIGN_RELEASE_PUBLICATION_RECOVERED_AFTER_COPY');
  assert.equal((await readFile(path.join(f.inbox,'NEXT_RELEASE'),'utf8')).trim(),f.name);assert.equal(recovered.deploymentAuthority,'NONE');
});

test('does not republish a release carrying a structurally valid runtime APPLIED receipt',async()=>{
  const f=await fixture();assert.equal((await run(f)).ok,true);await rm(path.join(f.inbox,'NEXT_RELEASE'));await writeFile(path.join(f.inbox,`APPLIED-${f.name}-20260910T050000Z`),`${f.name}\n`);
  const out=await run(f);assert.equal(out.ok,true);assert.equal(out.status,'SOVEREIGN_RELEASE_ALREADY_APPLIED_BY_RUNTIME');assert.match(out.truthBoundary,/not independent proof of deployment success/i);assert.equal(await lstat(path.join(f.inbox,'NEXT_RELEASE')).then(()=>true).catch(()=>false),false);
});

test('refuses an APPLIED-looking file whose content does not identify the release',async()=>{
  const f=await fixture();assert.equal((await run(f)).ok,true);await rm(path.join(f.inbox,'NEXT_RELEASE'));await writeFile(path.join(f.inbox,`APPLIED-${f.name}-20260910T050000Z`),'\n');
  const out=await run(f);assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('runtime-applied-receipt-content-mismatch'));assert.equal(await lstat(path.join(f.inbox,'NEXT_RELEASE')).then(()=>true).catch(()=>false),false);
});

test('refuses an APPLIED-looking file without the canonical runtime timestamp shape',async()=>{
  const f=await fixture();assert.equal((await run(f)).ok,true);await rm(path.join(f.inbox,'NEXT_RELEASE'));await writeFile(path.join(f.inbox,`APPLIED-${f.name}-forged`),`${f.name}\n`);
  const out=await run(f);assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('runtime-applied-receipt-name-invalid'));assert.equal(await lstat(path.join(f.inbox,'NEXT_RELEASE')).then(()=>true).catch(()=>false),false);
});

test('refuses to overwrite a different runtime release pointer during recovery',async()=>{
  const f=await fixture();assert.equal((await run(f)).ok,true);await writeFile(path.join(f.inbox,'NEXT_RELEASE'),'release-cccccccccccc-dddddddddddddddd\n');
  const out=await run(f);assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('runtime-inbox-pointer-conflict'));
});

test('refuses pre-existing symlink at runtime release path',async()=>{
  const f=await fixture();await symlink(f.rel,path.join(f.inbox,f.name));const out=await run(f);assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('existing-runtime-release-not-directory'));
});

test('refuses pre-existing regular file at runtime release path',async()=>{
  const f=await fixture();await writeFile(path.join(f.inbox,f.name),'foreign');const out=await run(f);assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('existing-runtime-release-not-directory'));
});

test('refuses partial pre-existing runtime release directory',async()=>{
  const f=await fixture();await mkdir(path.join(f.inbox,f.name));await writeFile(path.join(f.inbox,f.name,'release.env'),'foreign');const out=await run(f);assert.equal(out.ok,false);assert.ok(out.reasonCodes.some(x=>x.startsWith('existing-runtime-release-missing:')));
});

test('refuses complete foreign runtime release without courier placement evidence',async()=>{
  const f=await fixture();await precreateCompleteForeignRelease(f);const out=await run(f);assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('release-courier-placement-evidence-required'));
  assert.equal(await lstat(path.join(f.inbox,'NEXT_RELEASE')).then(()=>true).catch(()=>false),false);
});

test('refuses malformed courier placement evidence',async()=>{
  const f=await fixture();assert.equal((await run(f)).ok,true);await writeFile(placementFile(f),'{not-json');const out=await run(f);assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('release-courier-placement-evidence-malformed'));
});

test('refuses mismatched isolated placement journal and release evidence',async()=>{
  const f=await fixture();assert.equal((await run(f)).ok,true);const journal=JSON.parse(await readFile(placementJournal(f),'utf8'));journal.nonce='f'.repeat(64);await writeFile(placementJournal(f),`${JSON.stringify(journal)}\n`);
  const out=await run(f);assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('courier-placement-evidence-mismatch'));
});

test('refuses placement evidence that attempts to grant authority',async()=>{
  const f=await fixture();assert.equal((await run(f)).ok,true);const inside=JSON.parse(await readFile(placementFile(f),'utf8'));inside.deploymentAuthority='GRANTED';await writeFile(placementFile(f),`${JSON.stringify(inside)}\n`);
  const out=await run(f);assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('release-courier-placement-authority-invalid'));
});

test('refuses source runtime or provenance-state overlap',async()=>{
  const f=await fixture();
  const out=await runSovereignReleaseCourier({env:{UBERBOND_RELEASE_COURIER_SOURCE:f.source,UBERBOND_RELEASE_COURIER_RUNTIME_INBOX:f.inbox,UBERBOND_RELEASE_COURIER_STATE:path.join(f.inbox,'state')}});
  assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('courier-source-runtime-state-separation-required'));
});

test('refuses unsafe marker names',async()=>{const f=await fixture();await writeFile(path.join(f.source,'NEXT_RELEASE'),'../escape\n');const out=await run(f);assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('safe-release-name-required'));});

test('refuses symlink anywhere in signed bundle',async()=>{const f=await fixture();await symlink('/etc/passwd',path.join(f.rel,'evil'));const out=await run(f);assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('release-tree-symlink-refused'));});

test('service is zero-network, cannot write signer outbox, and isolates provenance state',async()=>{
  const service=await readFile(new URL('../ops/sovereign/uberbond-release-courier.service',import.meta.url),'utf8');
  assert.match(service,/RestrictAddressFamilies=AF_UNIX/);assert.match(service,/IPAddressDeny=any/);assert.match(service,/ReadOnlyPaths=\/mnt\/uberbond-signer-outbox/);assert.match(service,/UBERBOND_RELEASE_COURIER_STATE=\/var\/lib\/uberbond-release-courier/);assert.match(service,/ReadWritePaths=\/var\/lib\/uberbond-control\/inbox \/var\/lib\/uberbond-release-courier/);assert.doesNotMatch(service,/UBERBOND_RELEASE_SIGNING_KEY|uberbondctl|deploy/);
});

test('installer provisions courier-owned provenance state',async()=>{
  const installer=await readFile(new URL('../ops/sovereign/install-release-courier.sh',import.meta.url),'utf8');
  assert.match(installer,/STATE_ROOT="\/var\/lib\/uberbond-release-courier"/);assert.match(installer,/install -d -o uberbond-release-courier -g uberbond-release-courier -m 0700/);assert.match(installer,/UBERBOND_RELEASE_COURIER_STATE=\$\{STATE_ROOT\}/);
});

test('courier path watches only the signer publication marker',async()=>{const unit=await readFile(new URL('../ops/sovereign/uberbond-release-courier.path',import.meta.url),'utf8');assert.match(unit,/PathChanged=\/mnt\/uberbond-signer-outbox\/NEXT_RELEASE/);assert.match(unit,/Unit=uberbond-release-courier\.service/);});
