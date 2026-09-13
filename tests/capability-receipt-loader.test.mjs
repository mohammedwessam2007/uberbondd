import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadCapabilityReceipts } from '../src/capability-receipt-loader.mjs';

function temp(){return fs.mkdtempSync(path.join(os.tmpdir(),'ub-cap-receipts-'));}

test('missing receipt file is empty not fabricated',()=>{const root=temp();const r=loadCapabilityReceipts({rootDir:root});assert.equal(r.ok,true);assert.equal(r.status,'CAPABILITY_RECEIPTS_ABSENT');assert.deepEqual(r.receipts,[]);});

test('recognized bounded receipt file loads exactly',()=>{const root=temp(),dir=path.join(root,'artifacts/capability-reality');fs.mkdirSync(dir,{recursive:true});const receipts=[{id:'messaging-provider-redundancy'}];fs.writeFileSync(path.join(dir,'observed.json'),JSON.stringify({schemaVersion:'uberbond.capability-reality.receipts.v1',receipts}));const r=loadCapabilityReceipts({rootDir:root});assert.equal(r.ok,true);assert.deepEqual(r.receipts,receipts);});

test('invalid schema and path escape fail closed',()=>{const root=temp(),dir=path.join(root,'artifacts/capability-reality');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'observed.json'),JSON.stringify({schemaVersion:'wrong',receipts:[]}));assert.equal(loadCapabilityReceipts({rootDir:root}).ok,false);assert.equal(loadCapabilityReceipts({rootDir:root,relativePath:'../outside.json'}).ok,false);});
