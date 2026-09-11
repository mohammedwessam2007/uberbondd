import test from 'node:test';
import assert from 'node:assert/strict';
import { compileHealthRecommendationBoundary } from '../src/health-recommendation-boundary.mjs';

const base=()=>({recommendationClass:'GENERAL_INFORMATION',evidenceRefs:['evidence:guideline'],uncertaintyStated:true,cautionStated:true});

test('health recommendations require evidence caution and explicit uncertainty',()=>{
  const out=compileHealthRecommendationBoundary(base());
  assert.equal(out.ok,true);assert.equal(out.status,'HEALTH_INFORMATION_BOUNDARY_READY');assert.equal(out.medicalActionAuthority,'NONE');
});

test('personal diagnosis or treatment cannot self-authorize and requires professional review',()=>{
  const out=compileHealthRecommendationBoundary({...base(),recommendationClass:'DIAGNOSIS_OR_TREATMENT'});
  assert.equal(out.ok,true);assert.equal(out.status,'PROFESSIONAL_REVIEW_REQUIRED');assert.equal(out.professionalReviewRequired,true);assert.equal(out.medicalActionAuthority,'NONE');
});

test('missing health evidence or caution is refused rather than guessed',()=>{
  const out=compileHealthRecommendationBoundary({recommendationClass:'WELLNESS_PLANNING',evidenceRefs:[],uncertaintyStated:false,cautionStated:false});
  assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('health-evidence-required'));assert.ok(out.reasonCodes.includes('health-uncertainty-must-be-stated'));assert.ok(out.reasonCodes.includes('health-caution-must-be-stated'));
});
