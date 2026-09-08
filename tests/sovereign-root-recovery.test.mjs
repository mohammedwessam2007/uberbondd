import test from 'node:test';
import assert from 'node:assert/strict';
import { compileSovereignRecoveryCharter, admitSovereignRecovery } from '../src/sovereign-root-recovery.mjs';

const now='2026-09-09T00:30:00.000Z';
const factor=(id,type,custody,provider='OFFLINE',over={})=>({factorId:id,factorType:type,custodyDomain:custody,providerDomain:provider,evidenceRef:`factor://${id}`,ownerControlled:!['TRUSTED_HUMAN_ATTESTATION','OWNER_LIVENESS_ATTESTATION'].includes(type),...over});
function charter(over={}){return compileSovereignRecoveryCharter({sovereignId:'mohamed',authorityEpoch:'epoch-7',charterRef:'charter://sovereign/7',minFactors:2,factors:[factor('hardware','HARDWARE_KEY','physical-safe','OFFLINE-A'),factor('offline','OFFLINE_RECOVERY_CODE','sealed-archive','OFFLINE-B'),factor('liveness','OWNER_LIVENESS_ATTESTATION','identity-verifier','IDENTITY-PROVIDER')],...over});}
const obs=(id,digest,verifier,over={})=>({factorId:id,evidenceRef:`observed://${id}`,factorStateRef:`state://${id}/active`,verifierId:verifier,observedAt:now,charterDigest:digest,passed:true,factorStillActive:true,identityMatch:id==='liveness'||id==='person',secretMaterialPersisted:false,...over});
const successObs=c=>[obs('hardware',c.charterDigest,'v1'),obs('liveness',c.charterDigest,'v2')];

test('valid charter requires independent diverse factors including identity proof and grants no authority',()=>{const c=charter();assert.equal(c.ok,true);assert.equal(c.charter.minFactors,2);assert.ok(c.charter.factors.some(row=>row.factorType==='OWNER_LIVENESS_ATTESTATION'));assert.equal(c.businessEffectAuthority,'NONE');assert.match(c.charterDigest,/^sha256:[0-9a-f]{64}$/);});

test('one recovery artifact can never be a sovereign root',()=>{const c=charter({minFactors:1,factors:[factor('one','OFFLINE_RECOVERY_CODE','drawer')]});assert.equal(c.ok,false);assert.ok(c.reasonCodes.includes('recovery-threshold-must-be-at-least-two'));});

test('charter without identity-bound proof route is refused',()=>{const c=charter({factors:[factor('a','HARDWARE_KEY','safe-a','offline-a'),factor('b','OFFLINE_RECOVERY_CODE','safe-b','offline-b')]});assert.equal(c.ok,false);assert.ok(c.reasonCodes.includes('identity-bound-recovery-factor-required'));});

test('charter requires factor-type diversity',()=>{const c=charter({factors:[factor('a','OWNER_LIVENESS_ATTESTATION','safe-a','provider-a'),factor('b','OWNER_LIVENESS_ATTESTATION','safe-b','provider-b')]});assert.equal(c.ok,false);assert.ok(c.reasonCodes.includes('recovery-requires-factor-type-diversity'));});

test('threshold factors must span independent custody domains',()=>{const c=charter({factors:[factor('a','HARDWARE_KEY','same','offline-a'),factor('b','OWNER_LIVENESS_ATTESTATION','same','provider-b')]});assert.equal(c.ok,false);assert.ok(c.reasonCodes.includes('threshold-factors-must-span-independent-custody-domains'));});

test('recovery cannot depend on one provider account/domain',()=>{const c=charter({factors:[factor('a','HARDWARE_KEY','safe-a','provider-one'),factor('b','OWNER_LIVENESS_ATTESTATION','safe-b','provider-one')]});assert.equal(c.ok,false);assert.ok(c.reasonCodes.includes('recovery-cannot-depend-on-one-provider-domain'));});

test('secret material cannot enter the durable charter',()=>{const c=charter({factors:[factor('a','HARDWARE_KEY','safe-a','offline-a',{secretMaterialIncluded:true}),factor('b','OWNER_LIVENESS_ATTESTATION','safe-b','provider-b')]});assert.equal(c.ok,false);assert.ok(c.reasonCodes.includes('secret-material-must-not-enter-recovery-charter:a'));});

test('revoked factor cannot remain in active charter',()=>{const c=charter({factors:[factor('a','HARDWARE_KEY','safe-a','offline-a',{revoked:true}),factor('b','OWNER_LIVENESS_ATTESTATION','safe-b','provider-b')]});assert.equal(c.ok,false);assert.ok(c.reasonCodes.includes('revoked-factor-cannot-enter-active-charter:a'));});

test('trusted human factor requires explicit consent reference',()=>{const c=charter({factors:[factor('a','HARDWARE_KEY','safe-a','offline-a'),factor('person','TRUSTED_HUMAN_ATTESTATION','human-domain','human',{ownerControlled:false})]});assert.equal(c.ok,false);assert.ok(c.reasonCodes.includes('trusted-human-factor-requires-consent-reference:person'));});

test('recovery may restore only the same sovereign identity',()=>{const c=charter();const r=admitSovereignRecovery({charterResult:c,recoveringSovereignId:'someone-else',authorityEpoch:'epoch-7',now,observations:successObs(c)});assert.equal(r.ok,false);assert.ok(r.reasonCodes.includes('recovery-may-only-restore-the-same-sovereign-identity'));});

test('stale authority epoch cannot recover current sovereignty',()=>{const c=charter();const r=admitSovereignRecovery({charterResult:c,recoveringSovereignId:'mohamed',authorityEpoch:'epoch-6',now,observations:successObs(c)});assert.equal(r.ok,false);assert.ok(r.reasonCodes.includes('recovery-authority-epoch-mismatch'));});

test('duplicate factor cannot satisfy threshold twice',()=>{const c=charter();const r=admitSovereignRecovery({charterResult:c,recoveringSovereignId:'mohamed',authorityEpoch:'epoch-7',now,observations:[obs('liveness',c.charterDigest,'v1'),obs('liveness',c.charterDigest,'v2')]});assert.equal(r.ok,false);assert.ok(r.reasonCodes.includes('duplicate-recovery-factor-observation:liveness'));assert.ok(r.reasonCodes.includes('recovery-threshold-not-met'));});

test('one verifier cannot manufacture multi-factor independence',()=>{const c=charter();const r=admitSovereignRecovery({charterResult:c,recoveringSovereignId:'mohamed',authorityEpoch:'epoch-7',now,observations:[obs('hardware',c.charterDigest,'v1'),obs('liveness',c.charterDigest,'v1')]});assert.equal(r.ok,false);assert.ok(r.reasonCodes.includes('threshold-recovery-requires-independent-verifiers'));});

test('two possession factors cannot recover sovereignty without fresh identity proof',()=>{const c=charter();const r=admitSovereignRecovery({charterResult:c,recoveringSovereignId:'mohamed',authorityEpoch:'epoch-7',now,observations:[obs('hardware',c.charterDigest,'v1'),obs('offline',c.charterDigest,'v2')]});assert.equal(r.ok,false);assert.ok(r.reasonCodes.includes('fresh-identity-bound-recovery-proof-required'));});

test('identity-bound factor must affirm the same sovereign identity',()=>{const c=charter();const r=admitSovereignRecovery({charterResult:c,recoveringSovereignId:'mohamed',authorityEpoch:'epoch-7',now,observations:[obs('hardware',c.charterDigest,'v1'),obs('liveness',c.charterDigest,'v2',{identityMatch:false})]});assert.equal(r.ok,false);assert.ok(r.reasonCodes.includes('identity-bound-factor-did-not-match-sovereign:liveness'));});

test('factor active-state evidence is mandatory and revoked-at-recovery factor is refused',()=>{const c=charter();const missing=admitSovereignRecovery({charterResult:c,recoveringSovereignId:'mohamed',authorityEpoch:'epoch-7',now,observations:[obs('hardware',c.charterDigest,'v1',{factorStateRef:null}),obs('liveness',c.charterDigest,'v2')]});assert.equal(missing.ok,false);assert.ok(missing.reasonCodes.includes('recovery-factor-evidence-state-and-verifier-required:hardware'));const revoked=admitSovereignRecovery({charterResult:c,recoveringSovereignId:'mohamed',authorityEpoch:'epoch-7',now,observations:[obs('hardware',c.charterDigest,'v1',{factorStillActive:false}),obs('liveness',c.charterDigest,'v2')]});assert.equal(revoked.ok,false);assert.ok(revoked.reasonCodes.includes('recovery-factor-no-longer-active:hardware'));});

test('observations bind to exact charter digest and freshness window',()=>{const c=charter();const stale='2026-09-08T20:00:00.000Z';const r=admitSovereignRecovery({charterResult:c,recoveringSovereignId:'mohamed',authorityEpoch:'epoch-7',now,observations:[obs('hardware','sha256:'+'f'.repeat(64),'v1'),obs('liveness',c.charterDigest,'v2',{observedAt:stale})]});assert.equal(r.ok,false);assert.ok(r.reasonCodes.includes('recovery-factor-charter-binding-mismatch:hardware'));assert.ok(r.reasonCodes.includes('recovery-factor-observation-stale:liveness'));});

test('recovery verifier may not persist factor secrets',()=>{const c=charter();const r=admitSovereignRecovery({charterResult:c,recoveringSovereignId:'mohamed',authorityEpoch:'epoch-7',now,observations:[obs('hardware',c.charterDigest,'v1',{secretMaterialPersisted:true}),obs('liveness',c.charterDigest,'v2')]});assert.equal(r.ok,false);assert.ok(r.reasonCodes.includes('recovery-verification-must-not-persist-secret-material:hardware'));});

test('successful threshold recovery restores eligibility only, never successor/private/effect authority',()=>{const c=charter();const r=admitSovereignRecovery({charterResult:c,recoveringSovereignId:'mohamed',authorityEpoch:'epoch-7',now,observations:successObs(c)});assert.equal(r.ok,true);assert.equal(r.status,'SOVEREIGN_RECOVERY_ADMISSIBLE_FOR_SEPARATE_CREDENTIAL_ROTATION');assert.deepEqual(r.receipt.factorTypes,['HARDWARE_KEY','OWNER_LIVENESS_ATTESTATION']);assert.equal(r.receipt.privateStateAccess,'NONE');assert.equal(r.receipt.successorAuthority,'NONE');assert.equal(r.businessEffectAuthority,'NONE');assert.match(r.truthBoundary,/does not rotate credentials/);});
