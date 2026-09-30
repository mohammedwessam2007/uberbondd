import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  createSemanticClosureChecker, semanticProgramHash,
  mintCertifiedCoverageFromClosure
} from '../src/semantic-closure-kernel.mjs';
import {
  sourceDigest, buildExactAnchors, residualPacketHash,
  verifyCertifiedFrontierResidual
} from '../src/certified-frontier-residual.mjs';

const h=x=>crypto.createHash('sha256').update(String(x)).digest('hex');
const now=Date.parse('2026-09-30T20:00:00Z');

function setup({leafKind='REALITY'}={}){
  const source='alpha beta gamma delta';
  const qualityContractHash=h('quality-v1'), obligationHash=h('obligation-v1');
  const packet={
    schemaVersion:'uberbond.certified-frontier-residual.v1',
    sourceHash:sourceDigest(source),
    qualityContractHash,
    obligationHash,
    evidence:buildExactAnchors(source,[{id:'e1',startByte:0,endByte:10},{id:'e2',startByte:11,endByte:22}]),
    candidate:'verified candidate'
  };
  const packetHash=residualPacketHash(packet);
  const coverageValue={complete:true,sourceHash:packet.sourceHash,qualityContractHash,obligationHash,packetHash};
  const authority={
    id:'coverage-source',kind:leafKind,status:'ACTIVE',scope:'TEST',qualityContractHash,
    crownRevision:'opus-5.5-r1',verifiedAt:'2026-09-30T19:00:00Z',expiresAt:'2026-10-01T00:00:00Z',
    sourceHashes:{source:h('source-state')},invalidators:['drift'],evidenceRef:'proof://coverage-source',value:coverageValue
  };
  const artifact={
    scope:'TEST',qualityContractHash,
    nodes:[
      {id:'leaf',kind:leafKind,authorityId:authority.id,dependencies:[],value:coverageValue},
      {id:'derived',kind:'DERIVATION',opcode:'IDENTITY',dependencies:['leaf'],params:{},value:coverageValue}
    ],
    claims:[{id:'coverage',nodeId:'derived',value:coverageValue}]
  };
  const context={
    scope:'TEST',crownRevision:'opus-5.5-r1',qualityContractHash,
    sourceHashes:{source:h('source-state')},invalidators:{drift:false},
    requiredClaimIds:['coverage'],authorizedProgramHash:semanticProgramHash(artifact)
  };
  const checker=createSemanticClosureChecker({authorityRecords:[authority]});
  const closure=checker({artifact,context,now});
  return {source,packet,packetHash,artifact,context,closure};
}

test('live E1 closure mints coverage and unlocks certified residual',()=>{
  const f=setup();
  assert.equal(f.closure.ok,true);
  const minted=mintCertifiedCoverageFromClosure({
    artifact:f.artifact,closure:f.closure,context:f.context,coverageClaimId:'coverage',
    sourceHash:f.packet.sourceHash,obligationHash:f.packet.obligationHash,packetHash:f.packetHash,
    evidenceRef:'proof://e1-coverage',expiresAt:'2026-10-01T00:00:00Z',now
  });
  assert.equal(minted.ok,true);assert.equal(minted.authority.proofClass,'E1');
  const verified=verifyCertifiedFrontierResidual({
    source:f.source,packet:f.packet,coverageAuthority:minted.authority,
    currentCoverageContext:f.context,now
  });
  assert.equal(verified.ok,true);assert.equal(verified.mayOmitOriginalSourceFromCrown,true);
});

test('serialized closure cannot mint authority',()=>{
  const f=setup();
  const forged=structuredClone(f.closure);
  const minted=mintCertifiedCoverageFromClosure({
    artifact:f.artifact,closure:forged,context:f.context,coverageClaimId:'coverage',
    sourceHash:f.packet.sourceHash,obligationHash:f.packet.obligationHash,packetHash:f.packetHash,
    evidenceRef:'proof://forged',expiresAt:'2026-10-01T00:00:00Z',now
  });
  assert.equal(minted.ok,false);assert.ok(minted.reasons.includes('live-semantic-closure-provenance-required'));
});

test('direct Crown leaf cannot mint E0-E4 coverage',()=>{
  const f=setup({leafKind:'CROWN'});
  assert.equal(f.closure.ok,true);
  const minted=mintCertifiedCoverageFromClosure({
    artifact:f.artifact,closure:f.closure,context:f.context,coverageClaimId:'coverage',
    sourceHash:f.packet.sourceHash,obligationHash:f.packet.obligationHash,packetHash:f.packetHash,
    evidenceRef:'proof://crown',expiresAt:'2026-10-01T00:00:00Z',now
  });
  assert.equal(minted.ok,false);assert.ok(minted.reasons.includes('e0-e4-only-coverage-proof-required'));
});

test('dependency drift invalidates previously minted coverage',()=>{
  const f=setup();
  const minted=mintCertifiedCoverageFromClosure({
    artifact:f.artifact,closure:f.closure,context:f.context,coverageClaimId:'coverage',
    sourceHash:f.packet.sourceHash,obligationHash:f.packet.obligationHash,packetHash:f.packetHash,
    evidenceRef:'proof://e1-coverage',expiresAt:'2026-10-01T00:00:00Z',now
  });
  assert.equal(minted.ok,true);
  const drifted={...f.context,sourceHashes:{source:h('changed')}};
  const verified=verifyCertifiedFrontierResidual({
    source:f.source,packet:f.packet,coverageAuthority:minted.authority,
    currentCoverageContext:drifted,now
  });
  assert.equal(verified.ok,false);assert.ok(verified.reasons.includes('coverage-dependency-drift'));
});

test('Crown succession and invalidator drift both fail closed',()=>{
  const f=setup();
  const minted=mintCertifiedCoverageFromClosure({
    artifact:f.artifact,closure:f.closure,context:f.context,coverageClaimId:'coverage',
    sourceHash:f.packet.sourceHash,obligationHash:f.packet.obligationHash,packetHash:f.packetHash,
    evidenceRef:'proof://e1-coverage',expiresAt:'2026-10-01T00:00:00Z',now
  });
  const changed={...f.context,crownRevision:'opus-successor',invalidators:{drift:true}};
  const verified=verifyCertifiedFrontierResidual({
    source:f.source,packet:f.packet,coverageAuthority:minted.authority,
    currentCoverageContext:changed,now
  });
  assert.equal(verified.ok,false);
  assert.ok(verified.reasons.includes('coverage-crown-revision-drift'));
  assert.ok(verified.reasons.includes('coverage-invalidator-fired-or-drifted'));
});
