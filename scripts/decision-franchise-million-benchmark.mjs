import crypto from 'node:crypto';
import { executeSequentialDecisionFranchiseFanout, modelFanoutReferenceEconomics } from '../src/decision-franchise-batch.mjs';
import { semanticHash } from '../src/semantic-closure-kernel.mjs';

const h=x=>crypto.createHash('sha256').update(String(x)).digest('hex');
const count=2_352_942;
const spec={
 schemaVersion:'uberbond.decision-franchise.spec.v1',taskClass:'CANONICAL_RECURRING_SOURCE_DECISION',
 qualityContractHash:h('opus-5.5-quality-contract'),sideEffectClass:'NONE',relevantKeys:['state'],
 policy:{domain:[{state:'A'},{state:'B'}],rows:[{input:{state:'A'},output:{decision:'A'}},{input:{state:'B'},output:{decision:'B'}}]}
};
const record={
 kind:'DECISION_FRANCHISE',status:'ACTIVE',id:'df:'+semanticHash(spec),spec,
 crownRevision:'opus-5.5-r1',sourceDependencies:{policy:h('policy-state')},invalidators:{drift:false},
 closureArtifactHash:h('artifact'),closureContextHash:h('context'),proofClass:'E3',
 evidenceRef:'benchmark://synthetic-e3-fixture',expiresAt:'2099-01-01T00:00:00Z',mintedAt:'2026-09-30T20:00:00Z'
};
const trustPin=semanticHash(record);
const currentContext={crownRevision:'opus-5.5-r1',sourceHashes:{policy:h('policy-state')},invalidators:{drift:false}};
const started=Date.now();
const receipt=executeSequentialDecisionFranchiseFanout({
 record,trustPin,currentContext,count,taskIdPrefix:'benchmark-',
 now:Date.parse('2026-09-30T20:00:00Z'),
 taskFactory:i=>({taskId:'benchmark-'+i,taskClass:spec.taskClass,qualityContractHash:spec.qualityContractHash,sideEffectClass:'NONE',payload:{state:i%2?'B':'A',consumerNonce:i}})
});
const economics=modelFanoutReferenceEconomics({executionReceipt:receipt,directOpusUnitUsd:.425,actualAllInEnvelopeUsd:30});
console.log(JSON.stringify({
 schemaVersion:'uberbond.decision-franchise-million-benchmark.v1',
 benchmarkOnly:true,syntheticTaskClass:true,elapsedMs:Date.now()-started,receipt,economics
},null,2));
