import test from 'node:test';
import assert from 'node:assert/strict';
import { getPhoenixWaveStatus, listPhoenixWaveProposals, compilePhoenixProposalMission } from '../src/phoenix-ten-wave-mission-compiler.mjs';
import { runPhoenixCosCommand } from '../scripts/phoenix-cos-operator.mjs';

const counts=new Map([[3,320],[4,256],[5,204],[6,120],[7,120],[8,160],[9,180],[10,200]]);
const zero=r=>{
  assert.equal(r.externalEffectAuthority,'NONE');
  assert.equal(r.businessEffectAuthority,'NONE');
  assert.equal(r.externalEffectLedger.providerCalls,0);
  assert.equal(r.externalEffectLedger.messages,0);
  assert.equal(r.externalEffectLedger.deployments,0);
  assert.equal(r.externalEffectLedger.spendCents,0);
};

test('source-backed wave summary preserves 1560 proposals and acknowledges missing 1–2 originals',()=>{
  const s=getPhoenixWaveStatus();
  assert.equal(s.ok,true);
  assert.equal(s.recoveredWaveCount,8);
  assert.deepEqual(s.originalWaveSpecsMissing,[1,2]);
  assert.equal(s.recoveredProposals,1560);
  assert.equal(s.publicRepositoryUrls,243);
  assert.equal(s.supplierApprovalCount,0);
  assert.equal(s.waves.length,10);
  assert.equal(s.waves.slice(2).reduce((x,v)=>x+v.count,0),1560);
  assert.ok(s.waves.slice(2).every(w=>/^[a-f0-9]{64}$/.test(w.canonicalSha256)));
  zero(s);
});

test('every original proposal ID in all recovered waves is accessible in bounded pages',()=>{
  const ids=new Set();
  let total=0;
  for(const [wave,count] of counts){
    let offset=0;
    while(offset<count){
      const out=listPhoenixWaveProposals(wave,{offset,limit:50});
      assert.equal(out.ok,true,JSON.stringify(out));
      assert.equal(out.total,count);
      assert.equal(out.proposals.length,Math.min(50,count-offset));
      for(const row of out.proposals){
        assert.equal(ids.has(row.id),false,row.id);
        ids.add(row.id);
        assert.match(row.sourcePointer,/^\/(?:capabilities|candidates)\/\d+$/);
        assert.equal(row.truthClass,'PROPOSED_RESEARCH_ONLY');
      }
      zero(out);
      total+=out.proposals.length;
      offset+=out.proposals.length;
      assert.equal(out.nextOffset,offset<count?offset:null);
    }
  }
  assert.equal(total,1560);
  assert.equal(ids.size,1560);
});

test('compile original acceptance into bounded non-executable implementation contracts',()=>{
  for(const id of ['phoenix-capability-0001','phoenix-wave4-0001','phoenix-wave5-0001',
    'phoenix-wave6-0001','phoenix-wave7-0001','phoenix-wave8-0001','phoenix-wave9-0001','phoenix-wave10-0200']){
    const out=compilePhoenixProposalMission(id);
    assert.equal(out.ok,true,id+': '+JSON.stringify(out));
    assert.equal(out.proposal.originalId,id);
    assert.ok(out.proposal.originalAcceptanceRequirement.length>15);
    assert.equal(out.proposal.canExecuteNow,false);
    assert.equal(out.proposal.canPromoteNow,false);
    assert.equal(out.proposal.trustClass,'RESEARCH_PROPOSAL_NOT_CAPABILITY');
    assert.match(out.contractDigest,/^sha256:[a-f0-9]{64}$/);
    assert.ok(out.proposal.requiredEvidence.length>=5);
    assert.ok(out.proposal.nativeBaselines.every(x=>x.overlapSignal==='LEXICAL_ONLY_NO_SEMANTIC_EQUIVALENCE'));
    zero(out);
  }
});

test('CoS commands do not invent Wave 1–2 designs or promote suppliers',()=>{
  const s=runPhoenixCosCommand(['waves']);assert.equal(s.ok,true);zero(s);
  const w=runPhoenixCosCommand(['wave','4','250','10']);assert.equal(w.ok,true);assert.equal(w.proposals.length,6);zero(w);
  const m=runPhoenixCosCommand(['mission','phoenix-wave4-0001']);assert.equal(m.ok,true);assert.equal(m.proposal.canExecuteNow,false);zero(m);
  for(const args of [
    ['wave','1'],['wave','2'],['wave','3','-1','10'],['wave','3','0','100'],
    ['wave','3','0','hello'],['mission','phoenix-wave4-9999'],
    ['mission','phoenix-capability-0000'],['mission','./../../etc/passwd'],
    ['mission','phoenix-wave4-0001','--execute']
  ]){
    const denied=runPhoenixCosCommand(args);
    assert.equal(denied.ok,false,JSON.stringify(args));
    zero(denied);
  }
});
