import test from 'node:test';
import assert from 'node:assert/strict';
import {compileDelegationGraph,revokeDelegationSubtree,delegationEffective} from '../src/recursive-revocation-graph.mjs';

const grants=()=>[
  {id:'root',actions:['READ','WRITE','DEPLOY'],expiresAt:'2026-09-13T12:00:00Z'},
  {id:'child-a',parentId:'root',actions:['READ','WRITE'],expiresAt:'2026-09-13T11:00:00Z'},
  {id:'grandchild',parentId:'child-a',actions:['READ'],expiresAt:'2026-09-13T10:00:00Z'},
  {id:'child-b',parentId:'root',actions:['READ'],expiresAt:'2026-09-13T11:30:00Z'}
];

test('compiles attenuation-only acyclic delegation graph',()=>{
  const out=compileDelegationGraph({grants:grants()});
  assert.equal(out.ok,true);
  assert.deepEqual(out.children.root,['child-a','child-b']);
  assert.deepEqual(out.children['child-a'],['grandchild']);
  assert.match(out.graphDigest,/^[0-9a-f]{64}$/);
  assert.equal(out.externalEffectAuthority,'NONE');
});

test('rejects authority widening and expiry extension',()=>{
  const widened=grants();
  widened[1]={...widened[1],actions:['READ','PURCHASE']};
  const a=compileDelegationGraph({grants:widened});
  assert.equal(a.ok,false);
  assert.ok(a.reasonCodes.includes('delegation-may-only-attenuate:child-a'));

  const extended=grants();
  extended[1]={...extended[1],expiresAt:'2026-09-13T13:00:00Z'};
  const b=compileDelegationGraph({grants:extended});
  assert.equal(b.ok,false);
  assert.ok(b.reasonCodes.includes('delegation-may-not-outlive-parent:child-a'));
});

test('rejects delegation cycles',()=>{
  const cycle=[
    {id:'a',parentId:'b',actions:['READ'],expiresAt:'2026-09-13T10:00:00Z'},
    {id:'b',parentId:'a',actions:['READ'],expiresAt:'2026-09-13T10:00:00Z'}
  ];
  const out=compileDelegationGraph({grants:cycle});
  assert.equal(out.ok,false);
  assert.ok(out.reasonCodes.some(code=>code.startsWith('delegation-cycle:')));
});

test('revocation cascades only through descendants and preserves siblings and ancestors',()=>{
  const graph=compileDelegationGraph({grants:grants()});
  const out=revokeDelegationSubtree({graph,revokeId:'child-a',revokedAt:'2026-09-13T09:00:00Z',reason:'compromise'});
  assert.equal(out.ok,true);
  assert.deepEqual(out.receipt.revokedDelegationIds,['child-a','grandchild']);
  const byId=Object.fromEntries(out.grants.map(row=>[row.id,row]));
  assert.equal(byId.root.revokedAt,null);
  assert.equal(byId['child-b'].revokedAt,null);
  assert.equal(byId['child-a'].revokedAt,'2026-09-13T09:00:00.000Z');
  assert.equal(byId.grandchild.revokedAt,'2026-09-13T09:00:00.000Z');
  assert.notEqual(out.receipt.priorGraphDigest,out.receipt.resultGraphDigest);
});

test('effective check refuses revoked and expired grants',()=>{
  const graph=compileDelegationGraph({grants:grants()});
  const revoked=revokeDelegationSubtree({graph,revokeId:'child-a',revokedAt:'2026-09-13T09:00:00Z'});
  const child=revoked.grants.find(row=>row.id==='child-a');
  assert.equal(delegationEffective({grant:child,at:'2026-09-13T09:30:00Z'}).ok,false);
  const root=revoked.grants.find(row=>row.id==='root');
  assert.equal(delegationEffective({grant:root,at:'2026-09-13T09:30:00Z'}).ok,true);
  assert.equal(delegationEffective({grant:root,at:'2026-09-13T12:30:00Z'}).ok,false);
});
