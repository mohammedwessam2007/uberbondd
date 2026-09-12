import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const script=path.join(root,'scripts','revenue-method-exchange.mjs');

function run(config){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'uberbond-rme-'));
  const file=path.join(dir,'config.json');
  fs.writeFileSync(file,JSON.stringify(config));
  return spawnSync(process.execPath,[script,'--config',file],{cwd:root,encoding:'utf8'});
}

test('operator refuses any config that claims external-effect authority',()=>{
  const r=run({schema:'uberbond.revenue-method-exchange.config.v1',mode:'PAPER_CANARY_SELECTION',externalEffectAuthority:'AUTHORIZED',methods:[]});
  assert.notEqual(r.status,0);
  assert.match(`${r.stderr}${r.stdout}`,/external-effect-authority-refused/);
});

test('operator accepts paper-canary mode while retaining zero external-effect authority',()=>{
  const r=run({schema:'uberbond.revenue-method-exchange.config.v1',mode:'PAPER_CANARY_SELECTION',externalEffectAuthority:'NONE',forecastTruth:'HYPOTHESIS_NOT_REVENUE',methods:[]});
  assert.equal(r.status,0,`${r.stderr}${r.stdout}`);
  const receipt=JSON.parse(r.stdout);
  assert.equal(receipt.externalEffectAuthority,'NONE');
  assert.equal(receipt.forecastTruth,'HYPOTHESIS_NOT_REVENUE');
  assert.deepEqual(receipt.canaries,[]);
});
