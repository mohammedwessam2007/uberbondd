#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
const root=process.cwd();
const carrier=path.join(root,'artifacts','inevitability-v9-carrier');
const manifest=JSON.parse(fs.readFileSync(path.join(carrier,'MANIFEST.json'),'utf8'));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const fail=m=>{throw new Error(`V9_CARRIER_FAILURE: ${m}`)};
const blobs=[];
for(let i=1;i<=manifest.partCount;i++){
  const name=`part-${String(i).padStart(4,'0')}.brpart.b64`;
  const text=fs.readFileSync(path.join(carrier,'parts',name),'utf8').trim();
  blobs.push(Buffer.from(text,'base64'));
}
const compressed=Buffer.concat(blobs);
if(compressed.length!==manifest.compressedBytes)fail(`compressed bytes expected=${manifest.compressedBytes} got=${compressed.length}`);
if(sha(compressed)!==manifest.compressedSha256)fail('compressed SHA-256 mismatch');
const raw=zlib.brotliDecompressSync(compressed);
if(raw.length!==manifest.canonicalBytes)fail(`canonical bytes expected=${manifest.canonicalBytes} got=${raw.length}`);
if(sha(raw)!==manifest.canonicalSha256)fail('canonical SHA-256 mismatch');
const s=raw.toString('utf8');
const lines=s.length===0?0:s.split('\n').length-(s.endsWith('\n')?1:0);
if(lines!==manifest.canonicalLines)fail(`canonical lines expected=${manifest.canonicalLines} got=${lines}`);
const dest=path.join(root,manifest.materializedPath);
fs.mkdirSync(path.dirname(dest),{recursive:true});
if(fs.existsSync(dest)){
  const old=fs.readFileSync(dest);
  if(sha(old)!==manifest.canonicalSha256)fail('refuse overwrite of mismatched canonical source');
}else fs.writeFileSync(dest,raw);
console.log(JSON.stringify({status:'LOSSLESS_V9_MATERIALIZED',path:manifest.materializedPath,bytes:raw.length,lines,sha256:sha(raw),parts:manifest.partCount},null,2));
