import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  clearUberLitTypeSafeKey,
  inspectUberLitTypeSafeKey,
  readUberLitTypeSafeKey,
  storeUberLitTypeSafeKey
} from '../src/uberlit-typesafe-secret.mjs';

test('stores TypeSafe key only as mode-0600 UberLit runtime secret and never returns it',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'uberlit-jev-secret-'));
  const key='ts_test_'+('a'.repeat(40));
  const receipt=storeUberLitTypeSafeKey({apiKey:key,runtimeRoot:root});
  assert.equal(receipt.ok,true);
  assert.equal(JSON.stringify(receipt).includes(key),false);
  const file=path.join(root,'secrets','typesafe-api-key');
  assert.equal(fs.statSync(file).mode & 0o777,0o600);
  assert.equal(readUberLitTypeSafeKey({runtimeRoot:root}),key);
  const state=inspectUberLitTypeSafeKey({runtimeRoot:root});
  assert.equal(state.ok,true);
  assert.equal(state.source,'UBERLIT_PROTECTED_RUNTIME_SECRET');
  assert.equal(state.keyReturned,false);
  clearUberLitTypeSafeKey({runtimeRoot:root});
  assert.equal(readUberLitTypeSafeKey({runtimeRoot:root}),null);
  fs.rmSync(root,{recursive:true,force:true});
});

test('refuses world-readable TypeSafe secret files',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'uberlit-jev-secret-'));
  const dir=path.join(root,'secrets');
  fs.mkdirSync(dir,{recursive:true});
  const file=path.join(dir,'typesafe-api-key');
  fs.writeFileSync(file,'ts_test_'+('b'.repeat(40))+'\n',{mode:0o644});
  assert.equal(readUberLitTypeSafeKey({runtimeRoot:root}),null);
  fs.rmSync(root,{recursive:true,force:true});
});
