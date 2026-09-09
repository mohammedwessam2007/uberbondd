import test from 'node:test';
import assert from 'node:assert/strict';
import { compileComposedEffectAuthorityAudit, COMPOSITION_IDS } from '../src/composed-effect-authority-audit.mjs';

const sourceBodies=Object.fromEntries(COMPOSITION_IDS.map(id=>[`src/${id}.mjs`,`GUARD_${id} SAFE_${id}`]));
const declaration=(id,index)=>({
  compositionId:id,
  mode:index<3?'DIRECT_EFFECT_SINK':index<6?'NON_SINK_WITH_DOWNSTREAM_GATE':index===6?'READ_ONLY_SURFACE':'EXTERNAL_AUTHORITY_BOUNDARY',
  entrypointRefs:[`src/${id}.mjs`],
  terminalSinkRefs:index===6||index>=7?[]:[`sink:${id}`],
  authorityBindingFields:index<3?['intentDigest','authorizationDigest']:[],
  failClosed:index<3,
  uncertaintyDoesNotAuthorizeRetry:index<3,
  externalMutationAuthority:index>=6?'NONE':null,
  readOnlyInvariant:index===6?'read only':null,
  nextAuthorityGate:index>=7?'EXTERNAL_GATE':null,
  authorityLaw:`law:${id}`,
  sourceMarkers:[{path:`src/${id}.mjs`,mustContain:[`GUARD_${id}`],mustNotContain:[`BYPASS_${id}`]}]
});
const declarations=()=>COMPOSITION_IDS.map(declaration);

test('all nine compositions can prove one authority cut-set without inventing runtime evidence',()=>{const out=compileComposedEffectAuthorityAudit({declarations:declarations(),sourceBodies});assert.equal(out.ok,true,JSON.stringify(out));assert.equal(out.status,'ALL_DECLARED_EFFECT_SINKS_AUTHORITY_BOUND');assert.equal(out.counts.required,9);assert.equal(out.businessEffectAuthority,'NONE');});
test('a missing composition fails the denominator instead of silently shrinking scope',()=>{const rows=declarations().slice(1);const out=compileComposedEffectAuthorityAudit({declarations:rows,sourceBodies});assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes(`composition-missing:${COMPOSITION_IDS[0]}`));});
test('direct effect sink cannot exist without exact authority bindings and fail-closed retry law',()=>{const rows=declarations();rows[0]={...rows[0],authorityBindingFields:[],failClosed:false,uncertaintyDoesNotAuthorizeRetry:false};const out=compileComposedEffectAuthorityAudit({declarations:rows,sourceBodies});assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes(`composition-authority-gap:${COMPOSITION_IDS[0]}`));const row=out.compositions.find(r=>r.compositionId===COMPOSITION_IDS[0]);assert.ok(row.reasonCodes.includes('exact-authority-binding-fields-required'));assert.ok(row.reasonCodes.includes('direct-effect-sink-must-fail-closed'));assert.ok(row.reasonCodes.includes('uncertainty-must-not-authorize-retry'));});
test('read-only browser class fails if remote mutation authority or action marker appears',()=>{const rows=declarations();const id=COMPOSITION_IDS[6];rows[6]={...rows[6],externalMutationAuthority:'BROWSER_WRITE'};let out=compileComposedEffectAuthorityAudit({declarations:rows,sourceBodies});assert.equal(out.ok,false);assert.ok(out.compositions.find(r=>r.compositionId===id).reasonCodes.includes('read-only-surface-mutation-authority-must-be-none'));rows[6]={...declaration(id,6),sourceMarkers:[{path:`src/${id}.mjs`,mustContain:[`GUARD_${id}`],mustNotContain:[`SAFE_${id}`]}]};out=compileComposedEffectAuthorityAudit({declarations:rows,sourceBodies});assert.equal(out.ok,false);assert.ok(out.compositions.find(r=>r.compositionId===id).reasonCodes.some(r=>r.includes('prohibited-source-marker-present')));});
test('external authority boundary must name the next real gate and retain zero mutation authority',()=>{const rows=declarations();const id=COMPOSITION_IDS[8];rows[8]={...rows[8],nextAuthorityGate:null,externalMutationAuthority:'CREDENTIAL_ROTATION'};const out=compileComposedEffectAuthorityAudit({declarations:rows,sourceBodies});assert.equal(out.ok,false);const reasons=out.compositions.find(r=>r.compositionId===id).reasonCodes;assert.ok(reasons.includes('external-boundary-next-authority-gate-required'));assert.ok(reasons.includes('external-boundary-mutation-authority-must-be-none'));});
test('removing one source guard fails closed even when declaration still claims safety',()=>{const bodies={...sourceBodies,[`src/${COMPOSITION_IDS[4]}.mjs`]:'SAFE_ONLY'};const out=compileComposedEffectAuthorityAudit({declarations:declarations(),sourceBodies:bodies});assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes(`composition-authority-gap:${COMPOSITION_IDS[4]}`));});
