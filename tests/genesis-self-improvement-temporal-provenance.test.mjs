import test from 'node:test';
import assert from 'node:assert/strict';
import { compileGenesisSelfImprovementAdmission } from '../src/genesis-self-improvement-bridge.mjs';

test('future-dated donor observation cannot enter causal self-improvement provenance',()=>{
  const out=compileGenesisSelfImprovementAdmission({
    evaluatedAt:'2026-09-09T04:00:00.000Z',
    now:'2026-09-09T05:00:00.000Z',
    donors:[{source:{observedAt:'2026-09-09T04:00:00.001Z'}}]
  });
  assert.equal(out.ok,false);
  assert.ok(out.reasonCodes.includes('future-dated-donor-evidence-prohibited'));
  assert.equal(out.writeAuthority,'NONE');
  assert.equal(out.selfModificationAuthority,'NONE');
  assert.equal(out.asiStatus,'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED');
});

test('future evaluation clock cannot legalize future donor evidence',()=>{
  const out=compileGenesisSelfImprovementAdmission({
    evaluatedAt:'2026-09-10T00:00:00.000Z',
    now:'2026-09-09T05:00:00.000Z',
    donors:[{source:{observedAt:'2026-09-09T23:00:00.000Z'}}]
  });
  assert.equal(out.ok,false);
  assert.ok(out.reasonCodes.includes('future-genesis-evaluation-time-prohibited'));
});

test('invalid evaluation time fails before GENESIS compilation',()=>{
  const out=compileGenesisSelfImprovementAdmission({evaluatedAt:'not-a-time',donors:[],now:'2026-09-09T05:00:00.000Z'});
  assert.equal(out.ok,false);
  assert.ok(out.reasonCodes.includes('valid-genesis-evaluation-time-required'));
});

test('invalid verifier time fails closed before GENESIS compilation',()=>{
  const out=compileGenesisSelfImprovementAdmission({evaluatedAt:'2026-09-09T04:00:00.000Z',donors:[],now:'not-a-time'});
  assert.equal(out.ok,false);
  assert.ok(out.reasonCodes.includes('valid-genesis-verifier-time-required'));
});
