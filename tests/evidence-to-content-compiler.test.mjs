import test from 'node:test';
import assert from 'node:assert/strict';
import {compileEvidenceContentPack} from '../src/evidence-to-content-compiler.mjs';
const base={topic:'Why lead-path evidence matters',audienceRef:'aud:agencies',offerRef:'offer:lead-path',claimPolicyRef:'claims:v1',evidenceRefs:['evidence:1','evidence:2'],contradictionRefs:['contradiction:1'],formats:['SEO_AEO_BRIEF','VIDEO_SCRIPT_BRIEF','LINKEDIN_POST_BRIEF']};
test('compiles multiple source-bound content tasks',()=>{const r=compileEvidenceContentPack(base);assert.equal(r.ok,true);assert.equal(r.pack.tasks.length,3);assert.equal(r.publicationAuthority,'NONE');});
test('refuses content with no evidence',()=>{const r=compileEvidenceContentPack({...base,evidenceRefs:[]});assert.ok(r.reasonCodes.includes('source-evidence-required'));});
test('refuses auto publication',()=>{const r=compileEvidenceContentPack({...base,autoPublish:true});assert.ok(r.reasonCodes.includes('automatic-publication-not-authorized'));});
test('refuses fabricated commercial claim',()=>{const r=compileEvidenceContentPack({...base,estimatedRevenueClaim:'lost $50k'});assert.ok(r.reasonCodes.includes('fabricated-or-estimated-commercial-claim-prohibited'));});
test('outbound insight remains canonical-outreach input only',()=>{const r=compileEvidenceContentPack({...base,formats:['OUTBOUND_INSIGHT']});assert.match(r.pack.tasks[0].constraints.join(' '),/canonical outreach engine/i);});
