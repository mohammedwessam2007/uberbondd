import test from 'node:test';
import assert from 'node:assert/strict';
import { semanticHash } from '../src/semantic-closure-kernel.mjs';
import { JEV_APPLICABILITY_PASSPORT_SCHEMA, verifyJevApplicabilityPassport, planCertifiedJevEvidenceGate } from '../src/jev-applicability-passport.mjs';

const NOW=Date.parse('2026-09-30T18:30:00Z');
const DEP=semanticHash({source:'provider-screening-schema-v1'});
const passport=()=>({
  schemaVersion:JEV_APPLICABILITY_PASSPORT_SCHEMA,
  circuitId:'jev.source-relevance.provider-screening.v1',
  semanticPurpose:'SOURCE_CHUNK_RELEVANCE',
  taskArchetype:'PROVIDER_SCREENING',
  model:'typesafe/jev-1.13',
  validInputDomain:{maxSharedStateTokens:32000,questionType:'noul',sourceClass:'PUBLIC_PROVIDER_EVIDENCE'},
  excludedStates:['OCR_UNKNOWN','UNPARSED_BINARY','SOURCE_AUTHENTICITY_UNKNOWN'],
  crownReferenceModel:'anthropic/claude-opus-5.5',
  crownReferenceRevision:'opus-5.5-reference-r1',
  evidenceDate:'2026-09-30T18:00:00Z',
  pairedHoldoutCount:500,
  pairedRegressions:0,
  falsePositiveEvidenceRef:'fixture://fp',
  falseNegativeEvidenceRef:'fixture://fn',
  calibrationEvidenceRef:'fixture://calibration',
  sourceDependencies:{schema:DEP},
  freshnessTtlMs:24*60*60*1000,
  driftTriggers:['model_revision','source_schema','task_contract'],
  auditRate:.05,
  decompileAction:'FREEZE_DECOMPILE_CROWN_REVALIDATE',
  certificatePointer:'fixture://canonical-certificate',\n  promotionState:'BOUNDED_REFLEX'
});
const context=()=>({
  taskArchetype:'PROVIDER_SCREENING',
  sourceDependencies:{schema:DEP},
  driftState:{model_revision:false,source_schema:false,task_contract:false}
});
const trusted=p=>({[p.circuitId]:semanticHash(p)});

test('current zero-regression Jev passport admits bounded source relevance gate',()=>{
 const p=passport(),v=verifyJevApplicabilityPassport({
  passport:p,trustedPassportHashes:trusted(p),context:context(),now:NOW,
  expectedPurpose:'SOURCE_CHUNK_RELEVANCE',expectedTaskArchetype:'PROVIDER_SCREENING',expectedModel:'typesafe/jev-1.13'
 });
 assert.equal(v.ok,true);
 assert.equal(v.authority,'Q_CERTIFIED_BOUNDED');
 const plan=planCertifiedJevEvidenceGate({
  passport:p,trustedPassportHashes:trusted(p),context:context(),now:NOW,
  sourceTokens:200000,chunkTokens:30000,expectedRelevantTokens:5000
 });
 assert.equal(plan.ok,true);
 assert.equal(plan.chunkCount,7);
 assert.equal(plan.outputLaw,'JEV_DECIDES_RELEVANCE_ONLY__EXACT_CODE_COPIES_SOURCE_BYTES__NO_SUMMARY_AUTHORITY');
});

for(const [label,mutate] of [
 ['regression',p=>p.pairedRegressions=1],
 ['not-promoted',p=>p.promotionState='SHADOW'],
 ['stale',p=>p.evidenceDate='2026-09-20T00:00:00Z'],
 ['wrong-model',p=>p.model='typesafe/jev-other'],
 ['missing-fn-evidence',p=>delete p.falseNegativeEvidenceRef],
 ['unsafe-decompile',p=>p.decompileAction='IGNORE_DRIFT']
]) test('Jev passport fails closed: '+label,()=>{
 const p=passport();p.promotionState='BOUNDED_REFLEX';mutate(p);
 const v=verifyJevApplicabilityPassport({
  passport:p,trustedPassportHashes:trusted(p),context:context(),now:NOW,
  expectedPurpose:'SOURCE_CHUNK_RELEVANCE',expectedTaskArchetype:'PROVIDER_SCREENING',expectedModel:'typesafe/jev-1.13'
 });
 assert.equal(v.ok,false);
});

test('passport hash mutation is detected independently',()=>{
 const p=passport();p.promotionState='BOUNDED_REFLEX';const pins=trusted(p);p.auditRate=.2;
 assert.equal(verifyJevApplicabilityPassport({
  passport:p,trustedPassportHashes:pins,context:context(),now:NOW,
  expectedPurpose:'SOURCE_CHUNK_RELEVANCE',expectedTaskArchetype:'PROVIDER_SCREENING',expectedModel:'typesafe/jev-1.13'
 }).ok,false);
});

test('unknown drift state decompiles rather than silently keeping Jev authority',()=>{
 const p=passport();p.promotionState='BOUNDED_REFLEX';
 const c=context();delete c.driftState.source_schema;
 const v=verifyJevApplicabilityPassport({
  passport:p,trustedPassportHashes:trusted(p),context:c,now:NOW,
  expectedPurpose:'SOURCE_CHUNK_RELEVANCE',expectedTaskArchetype:'PROVIDER_SCREENING',expectedModel:'typesafe/jev-1.13'
 });
 assert.equal(v.ok,false);
 assert.equal(v.decompileAction,'FREEZE_DECOMPILE_CROWN_REVALIDATE');
});
