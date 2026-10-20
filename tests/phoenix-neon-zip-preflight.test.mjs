import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {deflateRawSync} from 'node:zlib';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {inspectPhoenixNeonZip} from '../src/phoenix-neon-zip-preflight.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const crcTable=new Uint32Array(256);
for(let i=0;i<256;i++){let c=i;for(let j=0;j<8;j++)c=(c&1)?0xedb88320^(c>>>1):(c>>>1);crcTable[i]=c>>>0;}
function crc32(buf){let c=0xffffffff;for(const b of buf)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function fixture(entries){
  const locals=[],central=[];let offset=0,totalCentral=0;
  for(const entry of entries){
    const name=Buffer.from(entry.name),data=Buffer.from(entry.data||''),method=entry.method??0;
    const encoded=method===8?deflateRawSync(data):data,crc=crc32(data);
    const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);
    local.writeUInt16LE(method,8);local.writeUInt32LE(crc,14);local.writeUInt32LE(encoded.length,18);
    local.writeUInt32LE(data.length,22);local.writeUInt16LE(name.length,26);
    locals.push(local,name,encoded);
    const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50,0);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);
    c.writeUInt16LE(method,10);c.writeUInt32LE(crc,16);c.writeUInt32LE(encoded.length,20);
    c.writeUInt32LE(data.length,24);c.writeUInt16LE(name.length,28);
    c.writeUInt32LE(entry.external??0,38);c.writeUInt32LE(offset,42);
    central.push(c,name);offset+=30+name.length+encoded.length;totalCentral+=46+name.length;
  }
  const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);
  end.writeUInt16LE(entries.length,10);end.writeUInt32LE(totalCentral,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...locals,...central,end]);
}
function positive(out){assert.equal(out.ok,true,JSON.stringify(out));assert.equal(out.deployed,false);assert.equal(out.releaseAuthority,'NONE');assert.equal(out.externalEffects,'NONE');}
function denied(out,reason){assert.equal(out.ok,false);assert.equal(out.reason,reason);assert.equal(out.releaseAuthority,'NONE');assert.equal(out.deployed,false);}
test('known valid root index.js with pinned content hash is structurally accepted without release authority',()=>{
  const archive=fixture([{name:'index.js',data:'export default {fetch(){return new Response("OK");}}'}]);
  const o=inspectPhoenixNeonZip(archive,{expectedSha256:sha(archive)});
  positive(o);assert.equal(o.pinnedSha256Matched,true);assert.equal(o.entrypoint,'index.js');
  assert.equal(o.entryCount,1);assert.equal(o.fileCount,1);
});
test('compressed archive with dependency folders and root index.mjs passes',()=>{
  const data='/* local deterministic test */\n'.repeat(50);
  const archive=fixture([{name:'node_modules/'},{name:'node_modules/pkg/index.js',data:'module.exports={}'},
    {name:'index.mjs',data,method:8}]);
  const o=inspectPhoenixNeonZip(archive);positive(o);assert.equal(o.entrypoint,'index.mjs');
  assert.equal(o.fileCount,2);
});
test('missing root entrypoint refuses index.cjs, nested index.js and other wrong package roots',()=>{
  for(const name of ['index.cjs','dist/index.js','src/index.mjs','main.js']){
    denied(inspectPhoenixNeonZip(fixture([{name,data:'test'}])),'NEON_ROOT_ENTRYPOINT_REQUIRED');
  }
});
test('multiple root entrypoints refuse ambiguous release',()=>{
  denied(inspectPhoenixNeonZip(fixture([{name:'index.js',data:'a'},{name:'index.mjs',data:'b'}])),
    'NEON_ROOT_ENTRYPOINT_REQUIRED');
});
test('data-corrupted, wrong pinned SHA and invalid metadata fail closed',()=>{
  const valid=fixture([{name:'index.js',data:'valid'}]);
  const changed=Buffer.from(valid);changed[30+'index.js'.length+1]^=1;
  denied(inspectPhoenixNeonZip(changed),'ZIP_PAYLOAD_CHECKSUM_OR_SIZE_FAILED');
  denied(inspectPhoenixNeonZip(valid,{expectedSha256:'b'.repeat(64)}),'PINNED_BUNDLE_SHA256_MISMATCH');
  denied(inspectPhoenixNeonZip(valid,{expectedSha256:'not-a-sha'}),'INVALID_EXPECTED_SHA256');
  denied(inspectPhoenixNeonZip(Buffer.from('not-a-zip')),'BUNDLE_BYTES_MISSING_OR_OUT_OF_BOUNDS');
});
test('archive traversal, Windows paths, secrets, unsafe names, and duplicate casefold names rejected',()=>{
  for(const name of ['../index.js','/index.js','dir/../index.js','dir\\index.js','.env','node_modules/.ssh/id_rsa']){
    denied(inspectPhoenixNeonZip(fixture([{name,data:'x'},{name:'index.js',data:'valid'}])),
      'ZIP_UNSAFE_OR_SECRET_FILENAME');
  }
  denied(inspectPhoenixNeonZip(fixture([{name:'index.js',data:'a'},{name:'INDEX.JS',data:'b'}])),'ZIP_DUPLICATE_ENTRY');
});
test('symlink and forged central records cannot supply a runnable entrypoint',()=>{
  const s=fixture([{name:'index.js',data:'link-target',external:(0o120777<<16)>>>0}]);
  denied(inspectPhoenixNeonZip(s),'ZIP_SYMLINK_REFUSED');
  const broken=fixture([{name:'index.js',data:'a'}]);broken[broken.length-22+16]=255;
  denied(inspectPhoenixNeonZip(broken),'ZIP_CENTRAL_DIRECTORY_INVALID');
  const z=fixture([{name:'index.js',data:'a'}]);z[z.length-22+8]=0;
  denied(inspectPhoenixNeonZip(z),'ZIP_CENTRAL_DIRECTORY_INVALID');
});
test('malicious declared expansion exceeds budget before decompression',()=>{
  const z=fixture([{name:'index.js',data:'a'}]);
  // Central record is located after the local 30+8+1 bytes.
  const central=39;z.writeUInt32LE(7*1024*1024,central+24);
  denied(inspectPhoenixNeonZip(z),'ZIP_DECOMPRESSION_BUDGET_EXCEEDED');
});
test('real CLI returns pass for pinned test bundle, rejects bad, creates no external effects',()=>{
  const dir=mkdtempSync(join(tmpdir(),'phoenix-neon-preflight-'));
  try{
    const good=join(dir,'good.zip'),bad=join(dir,'bad.zip');
    const encoded=fixture([{name:'index.js',data:'test'}]);
    writeFileSync(good,encoded);writeFileSync(bad,fixture([{name:'index.cjs',data:'test'}]));
    const run=(p,pin)=>spawnSync(process.execPath,['scripts/phoenix-neon-bundle-preflight.mjs',p,...(pin?[pin]:[])],
      {cwd:root,encoding:'utf8',timeout:15000,maxBuffer:20000});
    const success=run(good,sha(encoded));assert.equal(success.status,0,success.stderr);
    positive(JSON.parse(success.stdout));
    const failure=run(bad);assert.notEqual(failure.status,0);
    denied(JSON.parse(failure.stdout),'NEON_ROOT_ENTRYPOINT_REQUIRED');
  }finally{rmSync(dir,{recursive:true,force:true});}
});
