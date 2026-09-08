import test from 'node:test';
import assert from 'node:assert/strict';
import { compileSovereignRecoveryCharter, admitSovereignRecovery } from '../src/sovereign-root-recovery.mjs';

const now='2026-09-09T00:30:00.000Z';
const factor=(id,type,custody,provider='OFFLINE',over={})=>({factorId:id,factorType:type,custodyDomain:custody,providerDomain:provider,evidenceRef:`factor://${id}`,ownerControlled:type!=='TRUSTED_HUMAN_ATTESTATION',...over});
function charter(over={}){return compileSovereignRecoveryCharter({sovereignId:'mohamed',authorityEpoch:'epoch-7',charterRef:'charter://sovereign/7',minFactors:2,factors:[factor('hardware','HARDWARE_KEY','physical-safe','OFFLINE'),factor('offline','OFFLINE_RECOVERY_CODE','sealed-archive','OFFLINE-2')],...over});}
const obs=(id,digest,verifier,over={})=>({factorId:id,evidenceRef:`observed://${id}`,verifierId:verifier,observedAt:now,charterDigest:digest,passed:true,secretMaterialPersisted:false,...over});

test('valid charter requires independent threshold factors and grants no authority',()=>{const c=charter();assert.equal(c.ok,true);assert.equal(c.charter.minFactors,2);assert.equal(c.businessEffectAuthority,'NONE');assert.match(c.charterDigest,/^sha256:[0-9a-f]{64}$/);});

test('one recovery artifact can never be a sovereign root',()=>{const c=charter({minFactors:1,factors:[factor('one','OFFLINE_RECOVERY_CODE','drawer')]});assert.equal(c.ok,false);assert.ok(c.reasonCodes.includes('recovery-threshold-must-be-at-least-two'));});

test('threshold factors must span independent custody domains',()=>{const c=charter({factors:[factor('a','HARDWARE_KEY','same'),factor('b','OFFLINE_RECOVERY_CODE','same')]});assert.equal(c.ok,false);assert.ok(c.reasonCodes.includes('threshold-factors-must-span-independent-custody-domains'));});

test('recovery cannot depend on one provider account/domain',()=>{const c=charter({factors:[factor('a','HARDWARE_KEY','safe-a','provider-one'),factor('b','INDEPENDENT_ACCOUNT_ATTESTATION','safe-b','provider-one')]});assert.equal(c.ok,false);assert.ok(c.reasonCodes.includes('recovery-cannot-depend-on-one-provider-domain'));});

test('secret material cannot enter the durable charter',()=>{const c=charter({factors:[factor('a','HARDWARE_KEY','safe-a','offline-a',{secretMaterialIncluded:true}),factor('b','OFFLINE_RECOVERY_CODE','safe-b','offline-b')]});assert.equal(c.ok,false);assert.ok(c.reasonCodes.includes('secret-material-must-not-enter-recovery-charter:a'));});

test('revoked factor cannot remain in active charter',()=>{const c=charter({factors:[factor('a','HARDWARE_KEY','safe-a','offline-a',{revoked:true}),factor('b','OFFLINE_RECOVERY_CODE','safe-b','offline-b')]});assert.equal(c.ok,false);assert.ok(c.reasonCodes.includes('revoked-factor-cannot-enter-active-charter:a'));});

test('trusted human factor requires explicit consent reference',()=>{const c=charter({factors:[factor('a','HARDWARE_KEY','safe-a','offline-a'),factor('person','TRUSTED_HUMAN_ATTESTATION','human-domain','human',{ownerControlled:false})]});assert.equal(c.ok,false);assert.ok(c.reasonCodes.includes('trusted-human-factor-requires-consent-reference:person'));});

test('recovery may restore only the same sovereign identity',()=>{const c=charter();const r=admitSovereignRecovery({charterResult:c,recoveringSovereignId:'someone-else',authorityEpoch:'epoch-7',now,observations:[obs('hardware',c.charterDigest,'v1'),obs('offline',c.charterDigest,'v2')]});assert.equal(r.ok,false);assert.ok(r.reasonCodes.includes('recovery-may-only-restore-the-same-sovereign-identity'));});

test('stale authority epoch cannot recover current sovereignty',()=>{const c=charter();const r=admitSovereignRecovery({charterResult:c,recoveringSovereignId:'mohamed',authorityEpoch:'epoch-6',now,observations:[obs('hardware',c.charterDigest,'v1'),obs('offline',c.charterDigest,'v2')]});assert.equal(r.ok,false);assert.ok(r.reasonCodes.includes('recovery-authority-epoch-mismatch'));});

test('duplicate factor cannot satisfy threshold twice',()=>{const c=charter();const r=admitSovereignRecovery({charterResult:c,recoveringSovereignId:'mohamed',authorityEpoch:'epoch-7',now,observations:[obs('hardware',c.charterDigest,'v1'),obs('hardware',c.charterDigest,'v2')]});assert.equal(r.ok,false);assert.ok(r.reasonCodes.includes('duplicate-recovery-factor-observation:hardware'));assert.ok(r.reasonCodes.includes('recovery-threshold-not-met'));});

test('one verifier cannot manufacture multi-factor independence',()=>{const c=charter();const r=admitSovereignRecovery({charterResult:c,recoveringSovereignId:'mohamed',authorityEpoch:'epoch-7',now,observations:[obs('hardware',c.charterDigest,'v1'),obs('offline',c.charterDigest,'v1')]});assert.equal(r.ok,false);assert.ok(r.reasonCodes.includes('threshold-recovery-requires-independent-verifiers'));});

test('observations bind to exact charter digest and freshness window',()=>{const c=charter();const stale='2026-09-08T20:00:00.000Z';const r=admitSovereignRecovery({charterResult:c,recoveringSovereignId:'mohamed',authorityEpoch:'epoch-7',now,observations:[obs('hardware','sha256:'+'f'.repeat(64),'v1'),obs('offline',c.charterDigest,'v2',{observedAt:stale})]});assert.equal(r.ok,false);assert.ok(r.reasonCodes.includes('recovery-factor-charter-binding-mismatch:hardware'));assert.ok(r.reasonCodes.includes('recovery-factor-observation-stale:offline'));});

test('recovery verifier may not persist factor secrets',()=>{const c=charter();const r=admitSovereignRecovery({charterResult:c,recoveringSovereignId:'mohamed',authorityEpoch:'epoch-7',now,observations:[obs('hardware',c.charterDigest,'v1',{secretMaterialPersisted:true}),obs('offline',c.charterDigest,'v2')]});assert.equal(r.ok,false);assert.ok(r.reasonCodes.includes('recovery-verification-must-not-persist-secret-material:hardware'));});

test('successful threshold recovery restores eligibility only, never successor/private/effect authority',()=>{const c=charter();const r=admitSovereignRecovery({charterResult:c,recoveringSovereignId:'mohamed',authorityEpoch:'epoch-7',now,observations:[obs('hardware',c.charterDigest,'v1'),obs('offline',c.charterDigest,'v2')]});assert.equal(r.ok,true);assert.equal(r.status,'SOVEREIGN_RECOVERY_ADMISSIBLE_FOR_SEPARATE_CREDENTIAL_ROTATION');assert.equal(r.receipt.privateStateAccess,'NONE');assert.equal(r.receipt.successorAuthority,'NONE');assert.equal(r.businessEffectAuthority,'NONE');assert.match(r.truthBoundary,/does not rotate credentials/);});
