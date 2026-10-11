import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source=readFileSync(new URL('../worker.mjs',import.meta.url),'utf8');
test('worker registers SIGTERM before advertising startup readiness',()=>{
 const sig=source.indexOf("process.on('SIGTERM'");
 const ready=source.indexOf('console.log(`UberBond worker');
 assert.ok(sig>=0 && ready>sig,'readiness printed before SIGTERM listener creates race');
});
test('SIGINT also registered before ready and workerPromise remains awaited',()=>{
 const sig=source.indexOf("process.on('SIGINT'");
 const ready=source.indexOf('console.log(`UberBond worker');
 assert.ok(sig>=0 && ready>sig);
 assert.match(source.slice(ready),/await workerPromise/);
});
