import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveWinnrMailboxAddress as resolve } from '../src/uberwinnr-adapter.mjs';
test('current full_address agrees with exact username/domain', () => {
  assert.equal(resolve({full_address:'pilot@owned.example',username:'pilot',domain:'owned.example'}),'pilot@owned.example');
  assert.equal(resolve({email:'pilot@owned.example'}),'pilot@owned.example');
  assert.equal(resolve({username:'pilot',domain:'owned.example'}),'pilot@owned.example');
});
test('conflicting and malformed identities fail closed', () => {
  for (const row of [
    {email:'pilot@owned.example',full_address:'other@owned.example'},
    {full_address:'pilot@owned.example',username:'other',domain:'owned.example'},
    {full_address:'pilot@owned.example',domain:'outside.example'},
    {full_address:' pilot@owned.example'},
    {full_address:'pilot@owned.example,other@outside.example'},
    {full_address:'pilot@owned.example',username:{}}, {username:'pilot'}, null
  ]) assert.equal(resolve(row),'');
});
test('identity accessors are never invoked', () => {
  let calls=0; const row={full_address:'pilot@owned.example'};
  Object.defineProperty(row,'email',{get(){calls++;return 'pilot@owned.example';}});
  assert.equal(resolve(row),'');assert.equal(calls,0);
});
