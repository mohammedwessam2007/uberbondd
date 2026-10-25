import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assessRailwayZeroSpendEvidence as check, EXPECTED_WORKSPACE, EXPECTED_REPOSITORY } from '../src/railway-zero-spend-preflight.mjs';

const NOW = Date.parse('2026-10-25T03:00:00Z');
const SHA = 'a'.repeat(40);
const good = () => ({
  workspaceId: EXPECTED_WORKSPACE, repository: EXPECTED_REPOSITORY, sourceSha: SHA,
  projectId: null, observedAt: new Date(NOW).toISOString(),
  billingReadFromAuthenticatedProvider: true, billingEvidenceRef: 'provider-read://receipt-20261025',
  plan: 'Free', planActive: true, projectCreationPermitted: true,
  remainingCreditUsd: 1, existingUsageUsd: 0, projectedWorstCaseUsd: 0.5,
  zeroOverageEnforcedByProvider: true, noNewPaidSubscription: true,
  noBillableVolume: true, railwayAgentDisabled: true,
  nonproductionPrivate: true, publicIngress: false, webWorkerSeparated: true, outboundDisabled: true,
  neonPgVersion: 16,
  neonProjectId: 'misty-moon-35132124', neonBranchId: 'br-orange-wave-baqrfil7',
  neonDatabaseName: 'uberbond_render_rescue', neonSourceParityVerified: true,
  neonRoleName: 'uberbond_readonly', neonRoleScopeVerified: true,
  neonReadOnlyRoleVerified: true,
  originalKeyReferenceOnly: true, secretValueObserved: false,
  neonFreePlanVerified: true, neonUsageReadFromAuthenticatedProvider: true,
  neonMonthlyCuHourAllowance: 100, neonUsedCuHours: 3.52,
  neonProjectedCuHours: 80, neonHealthProbeDatabaseFree: true
});
const run = (e,opts={}) => check(e,{now:NOW,expectedSha:SHA,...opts});
const has = (e,code) => assert.ok(run(e).reasons.includes(code), JSON.stringify(run(e)));

test('missing account evidence holds and never grants authority', () => {
  const r=run(null); assert.equal(r.status,'HOLD');assert.equal(r.deploymentPermitted,false);assert.equal(r.spendingPermitted,false);
});
test('hypothetically complete evidence still does NOT authorize any deployment or spend', () => {
  const r=run(good());assert.equal(r.evidenceComplete,true);assert.equal(r.deploymentPermitted,false);
  assert.equal(r.resourceCreationPermitted,false);assert.equal(r.releaseAuthority,'NONE');
});
test('wrong workspace refused',()=>has({...good(),workspaceId:'wrong'},'WRONG_WORKSPACE'));
test('wrong repository refused',()=>has({...good(),repository:'old/repo'},'WRONG_REPOSITORY'));
test('historical failed projects refused',()=>{
  for(const id of ['1048d0ce-ef29-4654-8425-c2d4a9122ff7','41689b51-8922-4246-a095-a2fdd8fe77f3'])has({...good(),projectId:id},'FAILED_HISTORICAL_PROJECT_NOT_SOURCE');
});
test('unpinned source and mismatched head refused',()=>{
  has({...good(),sourceSha:'123'},'UNPINNED_OR_STALE_SOURCE');
  has({...good(),sourceSha:'b'.repeat(40)},'UNPINNED_OR_STALE_SOURCE');
});
test('stale, future and malformed evidence refused',()=>{
  for(const observedAt of ['2026-10-25T01:00:00Z','2026-10-25T04:00:00Z','garbage'])has({...good(),observedAt},'STALE_OR_INVALID_ACCOUNT_EVIDENCE');
});
test('self assertion without provider receipt refused',()=>{
  has({...good(),billingReadFromAuthenticatedProvider:false},'AUTHENTICATED_BILLING_RECEIPT_REQUIRED');
  has({...good(),billingEvidenceRef:'https://secrets.example'},'AUTHENTICATED_BILLING_RECEIPT_REQUIRED');
});
test('expired trial, blocked creation and paid plan refused',()=>{
  for(const patch of [{plan:'Trial'},{plan:'Hobby'},{planActive:false},{projectCreationPermitted:false}])has({...good(),...patch},'FREE_PLAN_NOT_ACTIVATED');
});
test('missing or inadequate credit margin refused',()=>{
  for(const patch of [{remainingCreditUsd:undefined},{remainingCreditUsd:'1'},{projectedWorstCaseUsd:2.5},{existingUsageUsd:0.5},{projectedWorstCaseUsd:-1}])has({...good(),...patch},'CREDIT_MARGIN_NOT_PROVEN');
});
test('no guaranteed zero overage is a hard blocker',()=>has({...good(),zeroOverageEnforcedByProvider:false},'ZERO_OVERAGE_ENFORCEMENT_UNVERIFIED'));
test('paid subscription, volume or agent exposure refused',()=>{
  for(const patch of [{noNewPaidSubscription:false},{noBillableVolume:false},{railwayAgentDisabled:false}])has({...good(),...patch},'PAID_RESOURCE_EXPOSURE');
});
test('public ingress, shared roles and outbound network refused',()=>{
  for(const patch of [{nonproductionPrivate:false},{publicIngress:true},{webWorkerSeparated:false},{outboundDisabled:false}])has({...good(),...patch},'RUNTIME_ISOLATION_UNVERIFIED');
});
test('Neon PG mismatch, privileged role, key movement refused',()=>{
  for(const patch of [{neonPgVersion:18},{neonReadOnlyRoleVerified:false},{originalKeyReferenceOnly:false},{secretValueObserved:true}])has({...good(),...patch},'NEON_OR_KEY_BOUNDARY_UNVERIFIED');
});
test('secret-bearing input is refused without echoing values',()=>{
  const r=run({...good(),DATABASE_URL:'postgresql://private:password@host/db'});
  assert.ok(r.reasons.includes('SECRET_BEARING_INPUT_REFUSED'));
  assert.equal(JSON.stringify(r).includes('private'),false);
});
test('CLI refuses missing evidence, never exits zero',()=>{
  const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
  const out=spawnSync(process.execPath,[join(root,'scripts/railway-zero-spend-preflight.mjs')],{encoding:'utf8'});
  assert.equal(out.status,2);assert.equal(JSON.parse(out.stdout).status,'HOLD');
});
test('CLI refuses deployment even for syntactically complete evidence',()=>{
  const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
  const dir=mkdtempSync(join(tmpdir(),'railway-gate-'));
  try{
    const p=join(dir,'evidence.json');writeFileSync(p,JSON.stringify({...good(),observedAt:new Date().toISOString()}));
    const out=spawnSync(process.execPath,[join(root,'scripts/railway-zero-spend-preflight.mjs'),p,SHA],{encoding:'utf8'});
    assert.equal(out.status,2);assert.equal(JSON.parse(out.stdout).deploymentPermitted,false);
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('CLI refuses unpinned source and wrong pinned SHA',()=>{
  const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
  const dir=mkdtempSync(join(tmpdir(),'railway-sha-'));
  try {
    const p=join(dir,'evidence.json');writeFileSync(p,JSON.stringify({...good(),observedAt:new Date().toISOString()}));
    for(const extra of [[],['b'.repeat(40)]]){
      const out=spawnSync(process.execPath,[join(root,'scripts/railway-zero-spend-preflight.mjs'),p,...extra],{encoding:'utf8'});
      assert.equal(out.status,2);assert.equal(JSON.parse(out.stdout).evidenceComplete,false);
    }
  } finally {rmSync(dir,{recursive:true,force:true});}
});


test('library caller must supply a valid exact expected SHA, not merely a plausible source SHA', () => {
  for (const opts of [{}, {expectedSha:null}, {expectedSha:'bad'}]) {
    const r=check(good(),{now:NOW,...opts});
    assert.ok(r.reasons.includes('UNPINNED_OR_STALE_SOURCE'));
    assert.equal(r.evidenceComplete,false);
  }
});

test('camelCase and mixed-case credential field names fail closed', () => {
  for (const key of ['apiKey','accessToken','dbPassword','clientSecret','connectionString','privateKey','authorization','Cookie','DATABASE_URL','credentials']) {
    const r=run({...good(),[key]:'dummy-not-a-real-secret'});
    assert.ok(r.reasons.includes('SECRET_BEARING_INPUT_REFUSED'),key);
    assert.equal(r.evidenceComplete,false);
    assert.equal(JSON.stringify(r).includes('dummy-not-a-real-secret'),false);
  }
});

test('unrecognized metadata and nested evidence are refused rather than silently trusted', () => {
  has({...good(),notes:'arbitrary metadata'},'UNEXPECTED_EVIDENCE_FIELD');
  has({...good(),extra:{privateData:'not-allowed'}},'UNEXPECTED_EVIDENCE_FIELD');
  has({...good(),billingEvidenceRef:{ref:'provider-read://receipt-20261025'}},'NESTED_EVIDENCE_FIELD_REFUSED');
  has({...good(),remainingCreditUsd:[1]},'NESTED_EVIDENCE_FIELD_REFUSED');
});

test('inherited evidence cannot satisfy the flat evidence contract', () => {
  const inherited=Object.create(good());
  const r=run(inherited);
  assert.ok(r.reasons.includes('EVIDENCE_OBJECT_REQUIRED'));
  assert.equal(r.evidenceComplete,false);
});


test('Neon free compute requires authenticated quota evidence and DB-free liveness', () => {
  for (const patch of [
    {neonFreePlanVerified:false},
    {neonUsageReadFromAuthenticatedProvider:false},
    {neonHealthProbeDatabaseFree:false},
    {neonMonthlyCuHourAllowance:undefined},
    {neonMonthlyCuHourAllowance:200},
    {neonUsedCuHours:undefined},
    {neonProjectedCuHours:undefined},
    {neonUsedCuHours:-1},
    {neonProjectedCuHours:-1}
  ]) has({...good(),...patch},'NEON_FREE_COMPUTE_BUDGET_UNVERIFIED');
});

test('Neon always-awake 0.25 CU exceeds monthly free compute', () => {
  const continuousHours=24*30;
  const alwaysAwakeCuHours=continuousHours*0.25;
  assert.equal(alwaysAwakeCuHours,180);
  has({...good(),neonProjectedCuHours:alwaysAwakeCuHours},'NEON_FREE_COMPUTE_BUDGET_UNVERIFIED');
  has({...good(),neonProjectedCuHours:92},'NEON_FREE_COMPUTE_BUDGET_UNVERIFIED');
});

test('bounded Neon usage remains evidence-only, never deploy authority', () => {
  const r=run(good());
  assert.equal(r.evidenceComplete,true);
  assert.equal(r.deploymentPermitted,false);
  assert.equal(r.resourceCreationPermitted,false);
  assert.equal(r.spendingPermitted,false);
});

// Source identity and role scope are distinct from PG version and role-read-only claims.
test('wrong Neon project, branch or unobserved database is refused', () => {
  for (const patch of [
    {neonProjectId:'other-project'}, {neonProjectId:undefined},
    {neonBranchId:'br-other'}, {neonBranchId:undefined},
    {neonDatabaseName:'unverified_db'}, {neonDatabaseName:undefined}
  ]) has({...good(),...patch},'NEON_SOURCE_IDENTITY_OR_ROLE_SCOPE_UNVERIFIED');
});
test('owner role, missing scope proof and absent parity refuse', () => {
  for (const patch of [
    {neonRoleName:'uberbond_render_rescue_owner'}, {neonRoleName:'bad-name'},
    {neonRoleName:undefined}, {neonRoleScopeVerified:false},
    {neonSourceParityVerified:false}
  ]) has({...good(),...patch},'NEON_SOURCE_IDENTITY_OR_ROLE_SCOPE_UNVERIFIED');
});
test('source identity remains only evidence, never deployment permission', () => {
  const r=run(good());
  assert.equal(r.evidenceComplete,true);
  assert.equal(r.deploymentPermitted,false);
  assert.equal(r.resourceCreationPermitted,false);
});
