import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {runOutreachRealityDoctor} from '../scripts/outreach-reality-doctor.mjs';
const resolver={resolveMx:async()=>[{exchange:'mta.example',priority:10}],resolveTxt:async h=>h.startsWith('_dmarc.')?[["v=DMARC1; p=quarantine"]]:[["v=spf1 -all"]],resolveCname:async()=>[]};
const paths=()=>{const d=fs.mkdtempSync(path.join(os.tmpdir(),'ubr-'));return {evidence:path.join(d,'e.json'),candidates:path.join(d,'c.ndjson'),corpus:path.join(d,'x.ndjson'),bundle:path.join(d,'b.json')};};
test('fails closed when production artifacts are absent',async()=>{const r=await runOutreachRealityDoctor({paths:paths(),resolver,now:new Date('2026-09-16T00:00:00Z')});assert.equal(r.state,'WAIT_EXTERNAL_REALITY');assert.ok(r.blockers.includes('runtime-evidence-file-missing'));assert.ok(r.blockers.includes('precleared-candidates-file-missing'));assert.equal(r.automaticSendAuthority,false);});
test('never grants spend or external-effect authority',async()=>{const r=await runOutreachRealityDoctor({paths:paths(),resolver});assert.equal(r.automaticSpendAuthority,false);assert.equal(r.externalEffectAuthority,'NONE');});
