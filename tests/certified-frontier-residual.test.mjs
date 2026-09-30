import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { sourceDigest, buildExactAnchors, residualPacketHash, verifyCertifiedFrontierResidual, crownResidualMessages } from '../src/certified-frontier-residual.mjs';

const h=x=>crypto.createHash('sha256').update(x).digest('hex');
const now=Date.parse('2026-09-30T20:00:00Z');
function fixture(){
 const source='alpha beta gamma delta';
 const evidence=buildExactAnchors(source,[{id:'a',startByte:0,endByte:10},{id:'b',startByte:11,endByte:22}]);
 const packet={schemaVersion:'uberbond.certified-frontier-residual.v1',sourceHash:sourceDigest(source),qualityContractHash:h('quality'),obligationHash:h('obligation'),evidence,candidate:'candidate'};
 const authority={kind:'CERTIFIED_COVERAGE',status:'ACTIVE',sourceHash:packet.sourceHash,qualityContractHash:packet.qualityContractHash,obligationHash:packet.obligationHash,packetHash:residualPacketHash(packet),evidenceRef:'proof://coverage/1',expiresAt:'2026-10-01T00:00:00Z'};
 return {source,packet,authority};
}
test('exact source-bound packet plus independent coverage authority may use residual Crown context',()=>{
 const {source,packet,authority}=fixture();
 const v=verifyCertifiedFrontierResidual({source,packet,coverageAuthority:authority,now});
 assert.equal(v.ok,true);assert.equal(v.mayOmitOriginalSourceFromCrown,true);
 const messages=crownResidualMessages({packet,verification:v});
 assert.equal(messages.length,2);assert.ok(!messages.some(m=>m.content.includes('alpha beta gamma delta')));
});
test('tampered excerpt fails closed to full-context Crown',()=>{
 const {source,packet,authority}=fixture();packet.evidence[0].excerpt='tampered';
 const v=verifyCertifiedFrontierResidual({source,packet,coverageAuthority:authority,now});
 assert.equal(v.ok,false);assert.equal(v.status,'FULL_CONTEXT_CROWN_REQUIRED');assert.equal(v.mayOmitOriginalSourceFromCrown,false);
});
test('coverage authority cannot be reused after packet mutation',()=>{
 const {source,packet,authority}=fixture();packet.candidate='different';
 const v=verifyCertifiedFrontierResidual({source,packet,coverageAuthority:authority,now});
 assert.equal(v.ok,false);assert.ok(v.reasons.includes('coverage-authority-binding-mismatch'));
});
test('expired coverage authority fails closed',()=>{
 const {source,packet,authority}=fixture();authority.expiresAt='2026-09-30T19:59:59Z';
 const v=verifyCertifiedFrontierResidual({source,packet,coverageAuthority:authority,now});
 assert.equal(v.ok,false);assert.ok(v.reasons.includes('coverage-authority-expired'));
});
