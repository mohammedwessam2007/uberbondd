import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanupMutationSandbox } from '../scripts/mutation-war.mjs';

test('cleanup re-enumerates a transient ENOTEMPTY failure and removes the real tree', async () => {
  const parent=mkdtempSync(join(tmpdir(), 'ub-cleanup-'));
  const target=join(parent, 'gitobjects');
  mkdirSync(target, { recursive:true });
  writeFileSync(join(target, 'proof'), 'source-backed');
  let attempts=0, waited=0;
  const { rm } = await import('node:fs/promises');
  await cleanupMutationSandbox(parent, {
    remove:async (path, opts) => {
      attempts++;
      if (attempts <= 2) throw Object.assign(new Error('temporary nested Git object race'), {code:'ENOTEMPTY'});
      await rm(path, opts);
    },
    pause: async ms => {waited += ms;},
    maxAttempts:4
  });
  assert.equal(attempts,3);
  assert.ok(waited>0);
  assert.equal(existsSync(parent),false);
});

test('nonretryable cleanup failure still rejects without silently passing', async () => {
  const fatal=Object.assign(new Error('denied'), {code:'EACCES'});
  let calls=0;
  await assert.rejects(cleanupMutationSandbox('/not-touched',{
    remove:async()=>{calls++;throw fatal;},pause:async()=>{throw new Error('pause not allowed');}
  }),e=>e===fatal);
  assert.equal(calls,1);
});

test('persistent concurrent writes exhaust the bounded retry budget and fail closed', async () => {
  let calls=0, waits=0;
  await assert.rejects(cleanupMutationSandbox('/not-touched',{
    remove:async()=>{calls++;throw Object.assign(new Error('nested objects still busy'),{code:'ENOTEMPTY'});},
    pause:async()=>{waits++;},
    maxAttempts:3
  }),{code:'ENOTEMPTY'});
  assert.equal(calls,3);
  assert.equal(waits,2);
});
