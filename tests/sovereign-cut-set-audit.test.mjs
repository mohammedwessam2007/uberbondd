import test from 'node:test';
import assert from 'node:assert/strict';
import { compileSovereignCutSetAudit, SOVEREIGN_CUT_IDS } from '../src/sovereign-cut-set-audit.mjs';

const sourceBodies=Object.fromEntries(SOVEREIGN_CUT_IDS.map(id=>[`src/${id}.mjs`,`MECHANISM_${id} RECOVERY_${id}`]));
function cut(id,index){
  const cutClass=index<4?'INTERNAL_ENGINEERING':index<6?'RUNTIME_PROOF':index<8?'EXTERNAL_PROVIDER':'OWNER_CUSTODY';
  return{
    cutId:id,cutClass,failureMode:`loss of ${id}`,
    mitigationRefs:[`src/${id}.mjs`],testRefs:[`tests/${id}.test.mjs`],recoveryRefs:[`recovery:${id}`],alternativeRefs:[`alternative:${id}`],
    sourceMechanismComplete:cutClass==='INTERNAL_ENGINEERING',runtimeObserved:false,externalObserved:false,ownerEnrollmentObserved:false,
    runtimeProofRequirement:cutClass==='RUNTIME_PROOF'?`observe real runtime surviving ${id}`:null,
    externalEvidenceRequirement:cutClass==='EXTERNAL_PROVIDER'?`observe authorized provider alternative for ${id}`:null,
    ownerActionBoundary:cutClass==='OWNER_CUSTODY'?`owner enrolls independent custody for ${id}`:null,
    providerIndependenceClaim:false,
    truthBoundary:`source proof does not manufacture real ${id} survival`,resumeTrigger:`new evidence for ${id}`,
    sourceMarkers:[{path:`src/${id}.mjs`,mustContain:[`MECHANISM_${id}`],mustNotContain:[`BYPASS_${id}`]}]
  };
}
const cuts=()=>SOVEREIGN_CUT_IDS.map(cut);

test('all internal single-point failure mechanisms may close while runtime/external/owner proof remains explicit',()=>{const out=compileSovereignCutSetAudit({cuts:cuts(),sourceBodies});assert.equal(out.ok,true,JSON.stringify(out));assert.equal(out.status,'SOVEREIGN_CUT_SET_AUDIT_CURRENT');assert.deepEqual(out.unresolvedInternalCuts,[]);assert.equal(out.runtimeProofRequiredCuts.length,2);assert.equal(out.externalProviderCuts.length,2);assert.equal(out.ownerCustodyCuts.length,2);assert.equal(out.businessEffectAuthority,'NONE');});
test('cut denominator cannot shrink to make survivability look complete',()=>{const rows=cuts().slice(0,-1);const out=compileSovereignCutSetAudit({cuts:rows,sourceBodies});assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes(`cut-missing:${SOVEREIGN_CUT_IDS.at(-1)}`));});
test('internal source cut requires mechanism test recovery and alternative',()=>{const rows=cuts();rows[0]={...rows[0],mitigationRefs:[],testRefs:[],recoveryRefs:[],alternativeRefs:[],sourceMechanismComplete:false};const out=compileSovereignCutSetAudit({cuts:rows,sourceBodies});assert.equal(out.ok,false);assert.ok(out.unresolvedInternalCuts.includes(rows[0].cutId));const rs=out.cuts[0].reasonCodes;for(const reason of ['internal-cut-mitigation-required','internal-cut-test-required','internal-cut-recovery-or-refusal-required','internal-cut-alternative-required','internal-cut-source-mechanism-incomplete'])assert.ok(rs.includes(reason));});
test('runtime claim cannot turn observed without a real evidence reference',()=>{const rows=cuts();rows[4]={...rows[4],runtimeObserved:true,runtimeEvidenceRef:null};const out=compileSovereignCutSetAudit({cuts:rows,sourceBodies});assert.equal(out.ok,false);assert.ok(out.cuts[4].reasonCodes.includes('runtime-observation-evidence-reference-required'));});
test('provider independence claim requires a named alternative and observed provider evidence requires reference',()=>{const rows=cuts();rows[6]={...rows[6],alternativeRefs:[],providerIndependenceClaim:true,externalObserved:true,externalEvidenceRef:null};const out=compileSovereignCutSetAudit({cuts:rows,sourceBodies});assert.equal(out.ok,false);const rs=out.cuts[6].reasonCodes;assert.ok(rs.includes('provider-independence-needs-named-alternative'));assert.ok(rs.includes('external-observation-evidence-reference-required'));});
test('owner custody cannot be declared enrolled from source alone',()=>{const rows=cuts();rows[8]={...rows[8],ownerEnrollmentObserved:true,ownerEvidenceRef:null};const out=compileSovereignCutSetAudit({cuts:rows,sourceBodies});assert.equal(out.ok,false);assert.ok(out.cuts[8].reasonCodes.includes('owner-enrollment-evidence-reference-required'));});
test('removing a source recovery marker reopens the cut',()=>{const bodies={...sourceBodies,[`src/${SOVEREIGN_CUT_IDS[1]}.mjs`]:'MECHANISM_ONLY'};const out=compileSovereignCutSetAudit({cuts:cuts(),sourceBodies:bodies});assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes(`cut-audit-gap:${SOVEREIGN_CUT_IDS[1]}`));});
