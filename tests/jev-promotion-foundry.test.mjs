import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JEV_CALIBRATION_SCHEMA } from '../src/jev-calibration-vault.mjs';
import { compileJevPromotionCandidates } from '../src/jev-promotion-foundry.mjs';

const row=(index,{outcome='ACCEPT'}={})=>({
  observationId:'obs-'+index,
  observedAt:new Date(Date.parse('2026-10-01T00:00:00Z')+index*15*60_000).toISOString(),
  qualityClass:'Q_FRONTIER_INTERACTIVE',
  jevModel:'typesafe/jev-1.13',
  jevModelRevision:'typesafe/jev-1.13-20260917',
  jevAnswers:{
    task_shape:{type:'choice',choice:'research',confidence:.9},
    source_compression_value:{type:'score',score:2,confidence:.9},
    independent_challenge:{type:'noul',noul:.2},
    hard_reasoning:{type:'score',score:2,confidence:.9},
    crown_necessity:{type:'noul',noul:.95}
  },
  selectedWriterId:'solPro',
  writerModel:'openai/gpt-6.1-sol-pro',
  crownModel:'anthropic/claude-opus-5.5',
  crownModelRevision:'anthropic/claude-opus-5.5-20260921',
  crownOutcome:outcome==='ACCEPT'?'CROWN_ACCEPTED_BUILDER':
    outcome==='PATCH'?'CROWN_PATCHED_BUILDER':'CROWN_REWROTE',
  acceptedWithoutMutation:outcome==='ACCEPT',
  patchRequired:outcome==='PATCH',
  rewriteRequired:outcome==='REWRITE',
  costsMicrousd:{jev:42,writer:13000,critic:0,crown:2000}
});

const state=rows=>({
  schemaVersion:JEV_CALIBRATION_SCHEMA,
  observations:rows,
  promotionState:'SHADOW',
  crownSuppressionAuthority:'NONE',
  updatedAt:rows.at(-1)?.observedAt??null
});

test('100+ stable zero-mutation Crown-supervised outcomes become certification-ready but never self-promote',()=>{
  const out=compileJevPromotionCandidates(state(Array.from({length:120},(_,i)=>row(i))));
  assert.equal(out.ok,true);
  assert.equal(out.status,'JEV_ZERO_LOSS_DOMAIN_READY_FOR_CANONICAL_CERTIFICATION');
  assert.equal(out.readyDomainCount,1);
  assert.equal(out.providerCallsPerformed,0);
  assert.equal(out.spendUsd,0);
  assert.equal(out.automaticPromotionAuthorized,false);
  assert.equal(out.crownSuppressionAuthority,'NONE');
  const c=out.candidates[0];
  assert.equal(c.rawObservationCount,120);
  assert.equal(c.observationCount,120);
  assert.equal(c.uniqueRequestCount,120);
  assert.equal(c.duplicateObservationCount,0);
  assert.ok(c.temporalSpanMs>=24*60*60*1000);
  assert.equal(c.observedRegressions,0);
  assert.equal(c.readyForCanonicalSealedCertification,true);
  assert.equal(c.status,'READY_FOR_CANONICAL_SEALED_CERTIFICATION');
  assert.equal(c.stableWindows.length,3);
  assert.equal(c.stableWindows.every(x=>x.count>=20&&x.zeroLoss),true);
  assert.equal(c.taskDomain.writerModel,'openai/gpt-6.1-sol-pro');
  assert.equal(c.taskDomain.crownModel,'anthropic/claude-opus-5.5');
  assert.ok(c.modeledPostCertificationCompressionFactor>1);
  assert.ok(c.modeledPostCertificationSavingsPercent>0);
  assert.equal(c.crownSuppressionAuthority,'NONE');
  assert.equal(c.automaticPromotionAuthorized,false);
});

test('one Crown patch permanently freezes that exact JEV domain signature for zero-loss certification',()=>{
  const rows=Array.from({length:120},(_,i)=>row(i));
  rows[73]=row(73,{outcome:'PATCH'});
  const out=compileJevPromotionCandidates(state(rows));
  const c=out.candidates[0];
  assert.equal(c.readyForCanonicalSealedCertification,false);
  assert.equal(c.status,'FROZEN_OBSERVED_REGRESSION');
  assert.equal(c.observedRegressions,1);
  assert.ok(c.certificationBlockers.includes('observed-crown-mutation-regression-present'));
  assert.equal(c.crownSuppressionAuthority,'NONE');
});

test('small clean samples remain shadow evidence and cannot become authority',()=>{
  const out=compileJevPromotionCandidates(state(Array.from({length:99},(_,i)=>row(i))));
  const c=out.candidates[0];
  assert.equal(c.status,'ACCUMULATING_CROWN_SUPERVISION');
  assert.equal(c.readyForCanonicalSealedCertification,false);
  assert.ok(c.certificationBlockers.includes('minimum-distinct-crown-supervised-outcomes-not-met'));
  assert.equal(out.crownSuppressionAuthority,'NONE');
});

test('missing exact model revisions blocks certification even with 100 clean outcomes',()=>{
  const rows=Array.from({length:120},(_,i)=>({...row(i),crownModelRevision:null}));
  const out=compileJevPromotionCandidates(state(rows));
  const c=out.candidates[0];
  assert.equal(c.readyForCanonicalSealedCertification,false);
  assert.ok(c.certificationBlockers.includes('crown-model-revision-unbound'));
});


test('duplicate retries cannot manufacture the minimum evidence count and worst duplicate outcome wins',()=>{
  const rows=Array.from({length:120},(_,i)=>({...row(i),requestFingerprint:'same-request'}));
  rows[119]={...rows[119],crownOutcome:'CROWN_PATCHED_BUILDER',acceptedWithoutMutation:false,patchRequired:true};
  const out=compileJevPromotionCandidates(state(rows));
  const c=out.candidates[0];
  assert.equal(c.rawObservationCount,120);
  assert.equal(c.uniqueRequestCount,1);
  assert.equal(c.duplicateObservationCount,119);
  assert.equal(c.observedRegressions,1);
  assert.equal(c.readyForCanonicalSealedCertification,false);
  assert.ok(c.certificationBlockers.includes('minimum-distinct-crown-supervised-outcomes-not-met'));
  assert.ok(c.certificationBlockers.includes('duplicate-request-observations-excluded-from-evidence-count'));
  assert.ok(c.certificationBlockers.includes('observed-crown-mutation-regression-present'));
});

test('100 distinct wins compressed into too little wall-clock time remain non-promotable',()=>{
  const rows=Array.from({length:120},(_,i)=>({...row(i),observedAt:new Date(Date.parse('2026-10-01T00:00:00Z')+i*60_000).toISOString()}));
  const out=compileJevPromotionCandidates(state(rows));
  const c=out.candidates[0];
  assert.equal(c.uniqueRequestCount,120);
  assert.equal(c.readyForCanonicalSealedCertification,false);
  assert.ok(c.certificationBlockers.includes('minimum-temporal-coverage-not-met'));
});
test('server promotion foundry is read-only and explicitly cannot suppress Crown',()=>{
  const source=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
  assert.match(source,/\/api\/admin\/infinite-opus\/jev-promotion-foundry/);
  const start=source.indexOf("'/api/admin/infinite-opus/jev-promotion-foundry'");
  assert.ok(start>0);
  const window=source.slice(start,start+2200);
  assert.match(window,/paidInferenceTriggered:false/);
  assert.match(window,/automaticPromotionAuthorized:false/);
  assert.match(window,/crownSuppressionAuthority:'NONE'/);
  assert.match(window,/cannot self-promote/);
  assert.match(window,/cannot suppress Crown/);
});
