#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {GENESIS_IMPLEMENTATION_EVIDENCE} from '../src/genesis-implementation-evidence-v2.mjs';
import {routeFrontierCapabilityClosures} from '../src/frontier-capability-closure-router.mjs';

export const GENESIS_PARTIAL_RUNTIME_PROOF_VERSION='uberbond.genesis-partial-runtime-proof.v1';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sha256=data=>`sha256:${crypto.createHash('sha256').update(data).digest('hex')}`;
const fileDigest=rel=>sha256(fs.readFileSync(path.join(root,rel)));
const args=new Map();for(let i=2;i<process.argv.length;i++){const arg=process.argv[i];if(!arg.startsWith('--'))continue;args.set(arg,process.argv[i+1]?.startsWith('--')?true:process.argv[++i]??true);}

const entries=Object.entries(GENESIS_IMPLEMENTATION_EVIDENCE).map(([id,value])=>({id,...value}));
const routed=routeFrontierCapabilityClosures({entries:entries.filter(row=>row.maturity==='PARTIAL_PRIMITIVE')});
if(!routed.ok){console.error(JSON.stringify(routed));process.exit(2);}
const queue=routed.queues.internalRuntimeEvidence;
const byTest=new Map();
for(const row of queue){
  for(const testFile of row.tests){
    if(!testFile.startsWith('tests/')||testFile.includes('..')) continue;
    const list=byTest.get(testFile)||[];list.push(row);byTest.set(testFile,list);
  }
}
const testReceipts=[];
for(const [testFile,capabilities] of [...byTest.entries()].sort((a,b)=>a[0].localeCompare(b[0]))){
  const abs=path.join(root,testFile);
  if(!fs.existsSync(abs)){testReceipts.push({testFile,ok:false,reasonCodes:['declared-test-file-missing'],capabilityIds:capabilities.map(c=>c.id)});continue;}
  const run=spawnSync(process.execPath,['--test',testFile],{cwd:root,encoding:'utf8',timeout:120000,env:{...process.env,UBERBOND_EFFECT_MODE:'ZERO_EXTERNAL_EFFECTS'}});
  const sourceFiles=[...new Set(capabilities.flatMap(c=>c.sources))].filter(rel=>fs.existsSync(path.join(root,rel))).sort();
  testReceipts.push({
    testFile,
    ok:run.status===0,
    exitCode:run.status,
    capabilityIds:capabilities.map(c=>c.id).sort((a,b)=>Number(a)-Number(b)),
    testDigest:fileDigest(testFile),
    sourceDigests:Object.fromEntries(sourceFiles.map(rel=>[rel,fileDigest(rel)])),
    stdoutDigest:sha256(run.stdout||''),
    stderrDigest:sha256(run.stderr||''),
    signal:run.signal||null
  });
}
const failed=testReceipts.filter(r=>!r.ok);
const coveredIds=[...new Set(testReceipts.filter(r=>r.ok).flatMap(r=>r.capabilityIds))].sort((a,b)=>Number(a)-Number(b));
const expectedIds=queue.map(r=>r.id).sort((a,b)=>Number(a)-Number(b));
const missingIds=expectedIds.filter(id=>!coveredIds.includes(id));
const receipt={
  ok:failed.length===0&&missingIds.length===0,
  status:failed.length||missingIds.length?'GENESIS_PARTIAL_RUNTIME_PROOF_REFUSED':'GENESIS_PARTIAL_RUNTIME_PROOF_PASSED',
  schemaVersion:GENESIS_PARTIAL_RUNTIME_PROOF_VERSION,
  capabilityCount:expectedIds.length,
  provenCapabilityCount:coveredIds.length,
  capabilityIds:coveredIds,
  missingCapabilityIds:missingIds,
  testFileCount:testReceipts.length,
  testReceipts,
  closureQueuesDigest:routed.queuesDigest,
  externalEffectAuthority:'NONE',
  businessEffectAuthority:'NONE',
  truthBoundary:'THIS RECEIPT PROVES ONLY THAT THE DECLARED ZERO-EFFECT INTERNAL TEST PATHS EXECUTED SUCCESSFULLY AGAINST THE HASHED SOURCE/TEST BYTES. IT DOES NOT PROMOTE MATURITY, PROVE EXTERNAL VALUE, OR CREATE AUTHORITY.'
};
receipt.receiptDigest=sha256(JSON.stringify(receipt));
const json=JSON.stringify(receipt,null,2)+'\n';
const out=args.get('--out');if(typeof out==='string'){const dest=path.resolve(root,out);if(!dest.startsWith(root+path.sep))throw new Error('output-must-stay-under-repository-root');fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,json);}
process.stdout.write(json);
if(!receipt.ok)process.exitCode=2;
