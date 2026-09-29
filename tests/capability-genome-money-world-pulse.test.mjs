import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const script='scripts/capability-genome-money-world-pulse.mjs';
function run(args=[], extra={}) {
 const env={...process.env,UBERBOND_CAPABILITY_GENOME_NETWORK_READS:'0',UBERBOND_CAPABILITY_GENOME_CORPUS_DIR:'',...extra};
 const r=spawnSync(process.execPath,[script,...args],{env,encoding:'utf8'});
 assert.equal(r.error,undefined);return {code:r.status,result:JSON.parse(r.stdout)};
}
test('World Capability Genome pulse defaults to bounded plan only without promotion',()=>{
 const {code,result}=run();assert.equal(code,0);assert.equal(result.status,'MONEY_WORLD_CAPABILITY_PULSE_PLAN_ONLY');assert.equal(result.promotionAuthority,'NONE');assert.equal(result.maxProviderCalls,80);
});
test('World Capability Genome pulse refuses unauthorized execution and malformed budgets cannot escape bounds',()=>{
 const refused=run(['--execute-github']);assert.equal(refused.code,2);assert.equal(refused.result.status,'MONEY_WORLD_CAPABILITY_NETWORK_READS_NOT_AUTHORIZED_ON_HOST');
 const {result}=run(['--query-batch-size=NaN','--max-provider-calls=Infinity','--window-days=-20']);assert.equal(result.queryBatchSize,10);assert.equal(result.maxProviderCalls,80);assert.equal(result.windowDays,1);
});
test('World Capability Genome pulse restart preserves cooldown state and performs no premature search',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'money-world-pulse-'));
 try {const state={nextEligibleAt:'2999-01-01T00:00:00Z',queryCursor:4};const p=path.join(dir,'money-world-harvest-state.json');fs.writeFileSync(p,JSON.stringify(state));
 const env={UBERBOND_CAPABILITY_GENOME_NETWORK_READS:'1',UBERBOND_CAPABILITY_GENOME_CORPUS_DIR:dir};
 for(let i=0;i<2;i++){const r=run(['--execute-github'],env);assert.equal(r.code,0);assert.equal(r.result.status,'MONEY_WORLD_CAPABILITY_PULSE_NOT_DUE');assert.equal(r.result.state.queryCursor,4);}
 assert.deepEqual(JSON.parse(fs.readFileSync(p)),state);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
