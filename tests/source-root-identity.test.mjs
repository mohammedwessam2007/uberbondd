import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { resolveExactSourceIdentity } from '../src/source-root-identity.mjs';

const fakeExec=(responses)=>((bin,args,options)=>{
  const key=args.join(' ');
  if(!(key in responses))throw Object.assign(new Error(`unexpected:${key}`),{code:'ENOENT'});
  return responses[key];
});

test('explicit exact sha is accepted without consulting parent git state',()=>{
  let calls=0;
  const r=resolveExactSourceIdentity({rootDir:'/tmp/child',explicitCommit:'a'.repeat(40),exec:()=>{calls++;throw new Error('must-not-run');}});
  assert.equal(r.ok,true);
  assert.equal(r.sourceCommit,'a'.repeat(40));
  assert.equal(calls,0);
});

test('source root refuses a parent repository top level',()=>{
  const root=path.resolve('/tmp/workspace/export');
  const r=resolveExactSourceIdentity({rootDir:root,exec:fakeExec({'rev-parse --show-toplevel':'/tmp/workspace\n','rev-parse HEAD':'b'.repeat(40)+'\n'})});
  assert.equal(r.ok,false);
  assert.equal(r.status,'SOURCE_IDENTITY_REFUSED');
  assert.ok(r.reasonCodes.includes('git-top-level-must-equal-source-root'));
});

test('exact git top level accepts a sha40 head',()=>{
  const root=path.resolve('/tmp/workspace/export');
  const r=resolveExactSourceIdentity({rootDir:root,exec:fakeExec({'rev-parse --show-toplevel':root+'\n','rev-parse HEAD':'c'.repeat(40)+'\n'})});
  assert.equal(r.ok,true);
  assert.equal(r.status,'SOURCE_IDENTITY_GIT_ROOT_VERIFIED');
  assert.equal(r.sourceCommit,'c'.repeat(40));
});

test('invalid explicit commit fails closed',()=>{
  const r=resolveExactSourceIdentity({rootDir:'/tmp/x',explicitCommit:'main'});
  assert.equal(r.ok,false);
  assert.ok(r.reasonCodes.includes('explicit-source-commit-must-be-sha40'));
});
