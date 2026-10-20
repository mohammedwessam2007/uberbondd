import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compileUberWarm2ZeroPaidCronGate} from '../src/uberwarm2-zero-paid-cycle-gate.mjs';

const monitor=()=>({status:'BLOCKED_FOR_SENDING',database:{recovery:false,ledger_present:true},
  provider:{status:'UBERWARM2_WINNR_LIVE_INVENTORY_OBSERVED',accountRead:true,
    providerReceiptDigestsPresent:true},sendAuthority:'NONE',sends:0,
  blockers:['independent-sender-consent-and-placement-gates-required']});
const environment=()=>({UBERWARM_CADENCE_ENABLED:'true',UBERWARM_ONE_SHOT_EXECUTION_ALLOWED:'true',
  UBERWARM_ONE_SHOT_PROBE_ID:'private-seed-1',UBERWARM_ONE_SHOT_SENDER:'sender@owned.example',
  UBERWARM_ONE_SHOT_RECIPIENT:'recipient@consented.example',
  UBERWARM_ONE_SHOT_EVIDENCE_PATH:'/protected/exact-manifest.json',
  UBERWARM_ONE_SHOT_APPROVAL_VERIFICATION_KEY:'a'.repeat(32),
  UBERWARM_ONE_SHOT_WINNR_USER_ID:'provider-id',WINNR_API_TOKEN:'fake-test-token',
  DATABASE_URL:'postgres://dummy.invalid/never-used',OUTBOUND_ENABLED:'false',UBERWARM_SEND_ENABLED:'false'});
const execute=(m=monitor(),env=environment())=>compileUberWarm2ZeroPaidCronGate({monitor:m,environment:env});

test('default, empty, or partial config can never schedule a provider submission',()=>{
  for(const env of [undefined,{}, {UBERWARM_CADENCE_ENABLED:'true'},
    {UBERWARM_ONE_SHOT_EXECUTION_ALLOWED:'true'}]){
    const r=compileUberWarm2ZeroPaidCronGate({monitor:monitor(),environment:env});
    assert.equal(r.status,'UBERWARM2_ONE_SHOT_CADENCE_HELD');
    assert.equal(r.providerSubmissions,0);assert.equal(r.spendCents,0);
  }
});
test('all gates only authorizes a second protected preflight, not a send',()=>{
  const r=execute();assert.equal(r.status,'UBERWARM2_ONE_SHOT_CADENCE_ELIGIBLE_FOR_PROTECTED_PREFLIGHT');
  assert.equal(r.providerSubmissions,0);assert.equal(r.automaticRetryAuthorized,false);
});
test('independent monitor failure and false-positive readiness cannot schedule',()=>{
  for(const patch of [{status:'INFRASTRUCTURE_CHECK_FAILED'},{sendAuthority:'SOME'},
    {sends:1},{database:{recovery:true,ledger_present:true}},
    {provider:{...monitor().provider,providerReceiptDigestsPresent:false}},
    {blockers:['operational-receipt-persistence-failed']}]){
    const r=execute({...monitor(),...patch});
    assert.equal(r.status,'UBERWARM2_ONE_SHOT_CADENCE_HELD');
  }
});
test('commercial mode and unbound or unsafe sender/recipient are refused',()=>{
  for(const patch of [{OUTBOUND_ENABLED:'true'},{UBERWARM_SEND_ENABLED:'true'},
    {UBERWARM_ONE_SHOT_PROBE_ID:'x; rm -rf /'},
    {UBERWARM_ONE_SHOT_RECIPIENT:'sender@owned.example'},
    {UBERWARM_ONE_SHOT_EVIDENCE_PATH:'../../fixture.json'},
    {UBERWARM_ONE_SHOT_APPROVAL_VERIFICATION_KEY:'short'},
    {WINNR_API_TOKEN:''}]){
    const r=execute(monitor(),{...environment(),...patch});
    assert.equal(r.status,'UBERWARM2_ONE_SHOT_CADENCE_HELD');
  }
});
test('Railway cron image includes guarded wrapper and original one-shot; no vendor warmer',()=>{
  const image=readFileSync(new URL('../Dockerfile.uberwarm-one-shot',import.meta.url),'utf8');
  const wrapper=readFileSync(new URL('../scripts/uberwarm2-zero-paid-cycle.mjs',import.meta.url),'utf8');
  assert.match(image,/COPY scripts\/uberwarm2-live-read-doctor\.mjs scripts\/uberwarm2-railway-read-monitor\.mjs scripts\/uberwarm2-zero-paid-cycle\.mjs/);
  assert.match(image,/COPY operator-tools\/uberwarm2-execute-approved-once.mjs/);
  assert.match(wrapper,/uberwarm2-railway-read-monitor\.mjs/);
  assert.match(wrapper,/uberwarm2-execute-approved-once\.mjs/);
  assert.match(wrapper,/FROM public\.uberwarm2_seed_probe_claims WHERE probe_id=\$1/);
  assert.doesNotMatch(wrapper,/\/warming.*POST|auto.reply|warming.*purchase/i);
});
