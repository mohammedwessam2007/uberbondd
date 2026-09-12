import test from 'node:test';
import assert from 'node:assert/strict';
import { isHostileTestTitle, isRecoveryTestTitle } from '../src/semantic-test-title-evidence.mjs';

test('canonical negative-invariant language is recognized as hostile evidence',()=>{
  for(const title of [
    'a prediction never becomes a value, however strong the evidence',
    'capability is not authority, and the list of things that are not says so',
    'prediction does not create authority',
    'a declaration may not widen authority',
    'a worker must not inherit founder-private context'
  ]) assert.equal(isHostileTestTitle(title),true,title);
});

test('positive happy-path titles do not become hostile falsifiers',()=>{
  for(const title of [
    'a valid delegation authorizes the named action',
    'the matrix compiles every canonical row',
    'a current receipt preserves its source identity'
  ]) assert.equal(isHostileTestTitle(title),false,title);
});

test('existing refusal vocabulary remains recognized',()=>{
  for(const title of ['invalid input is refused','unauthorized send is blocked','stale receipt fails closed']) {
    assert.equal(isHostileTestTitle(title),true,title);
  }
});

test('recovery evidence classification remains separate and recognizes checkpoint replay semantics',()=>{
  for(const title of [
    'restart reconciles an uncertain occurrence',
    'provider call ceiling checkpoints partial partition progress instead of dropping it',
    'the second attempt is bounded to hangs, and its verdict is final',
    'seed dry run is deterministic across reruns'
  ]) assert.equal(isRecoveryTestTitle(title),true,title);
  assert.equal(isRecoveryTestTitle('capability is not authority'),false);
  assert.equal(isRecoveryTestTitle('the matrix is deterministic'),false);
});
