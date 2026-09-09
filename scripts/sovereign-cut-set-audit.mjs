#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileSovereignCutSetAudit } from '../src/sovereign-cut-set-audit.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=path=>readFileSync(join(root,path),'utf8');
const paths=[
  'src/supplier-exit-drill.mjs','tests/supplier-exit-drill.test.mjs',
  'src/deploy-restart-recovery-receipt.mjs','tests/deploy-restart-recovery-receipt.test.mjs','tests/provider-neutral-runtime-acceptance.test.mjs',
  'src/model-provider-doctor.mjs','tests/agent-model-failover-hostile.test.mjs',
  'src/omnia-v9/integrations/external-effect-dispatcher.mjs','src/omnia-v9/integrations/providers/gmail-effect-adapter.mjs','src/omnia-v9/integrations/providers/postal-effect-adapter.mjs',
  'src/paypal-payment-truth-core.mjs','tests/paypal-payment-truth.test.mjs',
  'src/relay-vercel-api-executor.mjs','tests/relay-vercel-api-executor.test.mjs',
  'src/century-grade-continuity.mjs','src/sovereign-root-recovery.mjs','tests/sovereign-root-recovery.test.mjs'
];
const sourceBodies=Object.fromEntries(paths.map(path=>[path,read(path)]));
const cuts=[
  {
    cutId:'SOURCE_REPOSITORY_HOST',cutClass:'RUNTIME_PROOF',failureMode:'Loss or corruption of the current repository host or checkout.',
    mitigationRefs:['src/supplier-exit-drill.mjs'],testRefs:['tests/supplier-exit-drill.test.mjs'],recoveryRefs:['EXPORT','RESTORE','CUTOVER','ROLLBACK'],alternativeRefs:['OWNED_LOCAL_EXPORT','AUTHORIZED_PROVIDER_CUTOVER'],
    runtimeProofRequirement:'Observe a current exact-source export, byte-identical restore, cutover and rollback on an independent authorized location before claiming host survival.',runtimeObserved:false,
    truthBoundary:'Local portability machinery is implemented; a current independent repository-host cutover is not inferred.',resumeTrigger:'new exact-source independent-host drill receipt',
    sourceMarkers:[{path:'src/supplier-exit-drill.mjs',mustContain:["DRILL_STEPS = Object.freeze(['EXPORT', 'RESTORE', 'CUTOVER', 'ROLLBACK'])",'restored-state-does-not-match-export','original-not-reachable-after-rollback','AUTHORIZED_PROVIDER_CUTOVER']}]
  },
  {
    cutId:'DATABASE_STATE',cutClass:'RUNTIME_PROOF',failureMode:'Loss, crash or replacement of the durable Postgres state and worker lease owner.',
    mitigationRefs:['src/deploy-restart-recovery-receipt.mjs'],testRefs:['tests/deploy-restart-recovery-receipt.test.mjs','tests/provider-neutral-runtime-acceptance.test.mjs'],recoveryRefs:['replay-safe work reclaim','uncertain-effect dead letter','synthetic cleanup'],alternativeRefs:['RESTORED_POSTGRES_STATE','REPLACEMENT_WORKER'],
    runtimeProofRequirement:'Observe exact-current Postgres crash/restart with one replay-safe reclaim, zero blind replay of uncertain effects and successful cleanup.',runtimeObserved:false,
    truthBoundary:'The receipt compiler and acceptance tests exist; this audit does not claim a fresh current-host Postgres rehearsal occurred.',resumeTrigger:'new exact-head deploy-restart-recovery receipt',
    sourceMarkers:[{path:'src/deploy-restart-recovery-receipt.mjs',mustContain:['real-postgres-environment-required','exactly-one-replacement-claim-required','uncertain-reconcile-work-must-not-replay','RESTART_RECOVERY_REHEARSAL_PASSED']}]
  },
  {
    cutId:'WEB_RUNTIME_HOST',cutClass:'RUNTIME_PROOF',failureMode:'Loss of the primary web/app hosting runtime.',
    mitigationRefs:['src/supplier-exit-drill.mjs','tests/provider-neutral-runtime-acceptance.test.mjs'],testRefs:['tests/provider-neutral-runtime-acceptance.test.mjs'],recoveryRefs:['provider-neutral runtime acceptance','supplier exit cutover and rollback'],alternativeRefs:['PORTABLE_NODE_RUNTIME','AUTHORIZED_REPLACEMENT_HOST'],
    runtimeProofRequirement:'Boot the exact current release on an independent authorized runtime, verify health/state binding, then cut back safely.',runtimeObserved:false,
    truthBoundary:'Portable/provider-neutral source exists but independent current release hosting is a runtime fact.',resumeTrigger:'independent named-runtime boot and rollback receipt',
    sourceMarkers:[{path:'tests/provider-neutral-runtime-acceptance.test.mjs',mustContain:['restartObserved','replacementWorkerObserved','persistedAcrossRestart']}]
  },
  {
    cutId:'WORKER_SCHEDULER_PROCESS',cutClass:'RUNTIME_PROOF',failureMode:'Worker or scheduler process dies between durable claim and completion.',
    mitigationRefs:['src/deploy-restart-recovery-receipt.mjs'],testRefs:['tests/deploy-restart-recovery-receipt.test.mjs'],recoveryRefs:['replaySafeRecovered','replacementClaimCount','reconcileDeadLettered'],alternativeRefs:['REPLACEMENT_WORKER_PROCESS'],
    runtimeProofRequirement:'Kill the exact-current worker abruptly and observe one replacement claim with uncertain-effect work not replayed.',runtimeObserved:false,
    truthBoundary:'Crash recovery semantics are encoded but unattended current runtime survival must be observed.',resumeTrigger:'fresh abrupt-process-kill receipt',
    sourceMarkers:[{path:'src/deploy-restart-recovery-receipt.mjs',mustContain:['crashExitCode !== 91','replaySafeRecovered !== 1','replacementClaimCount !== 1','reconcileReplacementClaimCount !== 0']}]
  },
  {
    cutId:'MODEL_PROVIDER',cutClass:'EXTERNAL_PROVIDER',failureMode:'Configured frontier/model provider becomes unavailable, rate-limited or revoked.',
    mitigationRefs:['src/model-provider-doctor.mjs'],testRefs:['tests/agent-model-failover-hostile.test.mjs'],recoveryRefs:['provider readiness','failover refusal/selection'],alternativeRefs:['AUTHORIZED_ALTERNATE_MODEL_PROVIDER','OPEN_OR_LOCAL_RUNTIME_WHEN_ACTUALLY_PROVISIONED'],
    externalEvidenceRequirement:'Observe authorized alternate/local provider callability and task completion under current configuration; source names are not availability.',externalObserved:false,providerIndependenceClaim:true,
    truthBoundary:'Routing/failover source cannot manufacture credentials, quota or local runtime availability.',resumeTrigger:'fresh authorized alternate provider activation/task receipt',
    sourceMarkers:[{path:'src/model-provider-doctor.mjs',mustContain:['businessEffectAuthority','ZERO_EXTERNAL_EFFECTS']},{path:'tests/agent-model-failover-hostile.test.mjs',mustContain:['test(']}]
  },
  {
    cutId:'MESSAGING_PROVIDER',cutClass:'EXTERNAL_PROVIDER',failureMode:'The active outbound messaging provider or sender account becomes unavailable.',
    mitigationRefs:['src/omnia-v9/integrations/providers/gmail-effect-adapter.mjs','src/omnia-v9/integrations/providers/postal-effect-adapter.mjs'],testRefs:['tests/omnia-v9-external-effect-final-admission.test.mjs'],recoveryRefs:['read-only reconciliation','uncertain outcome no resend'],alternativeRefs:['GMAIL','POSTAL'],
    externalEvidenceRequirement:'Observe at least two authorized messaging paths configured/callable with sender identity and policy evidence before claiming live provider redundancy.',externalObserved:false,providerIndependenceClaim:true,
    truthBoundary:'Two adapters exist in source; that is not proof two live sending providers/accounts exist.',resumeTrigger:'fresh independent messaging-provider activation and bounded canary receipts',
    sourceMarkers:[{path:'src/omnia-v9/integrations/external-effect-dispatcher.mjs',mustContain:['finalAdmissionCheck','adapter.dispatch(preparedEffect)','RESULT_UNCERTAIN']},{path:'src/omnia-v9/integrations/providers/gmail-effect-adapter.mjs',mustContain:["return 'gmail'"]},{path:'src/omnia-v9/integrations/providers/postal-effect-adapter.mjs',mustContain:["return 'postal'"]}]
  },
  {
    cutId:'PAYMENT_PROVIDER',cutClass:'EXTERNAL_PROVIDER',failureMode:'PayPal account/API/payment rail is unavailable or rejects the intended commercial path.',
    mitigationRefs:['src/paypal-payment-truth-core.mjs'],testRefs:['tests/paypal-payment-truth.test.mjs'],recoveryRefs:['provider readback','signed webhook truth','uncertain mutation refusal'],alternativeRefs:['SEPARATE_PAYMENT_RAIL_REQUIRED_BEFORE_PROVIDER_INDEPENDENCE_CLAIM'],
    externalEvidenceRequirement:'Real second authorized payment rail or observed PayPal recovery is required; repository code cannot create a provider account or settlement path.',externalObserved:false,providerIndependenceClaim:false,
    truthBoundary:'PayPal is a real external single-provider dependency until a second rail is actually authorized and proven.',resumeTrigger:'authorized second payment rail or fresh PayPal live/sandbox evidence appropriate to claim',
    sourceMarkers:[{path:'src/paypal-payment-truth-core.mjs',mustContain:['PROVIDER_EFFECT_UNCERTAIN','bindingDigest','captureRequestId','paypal-request-id']}]
  },
  {
    cutId:'DEPLOYMENT_PROVIDER',cutClass:'EXTERNAL_PROVIDER',failureMode:'Vercel or the current deployment provider cannot accept the exact release.',
    mitigationRefs:['src/relay-vercel-api-executor.mjs','src/supplier-exit-drill.mjs'],testRefs:['tests/relay-vercel-api-executor.test.mjs','tests/supplier-exit-drill.test.mjs'],recoveryRefs:['one-shot preview','supplier exit rollback'],alternativeRefs:['PORTABLE_NODE_RUNTIME','AUTHORIZED_REPLACEMENT_HOST'],
    externalEvidenceRequirement:'Observed independent-host release boot/cutover is required for provider-independence; a portable source tree alone is not a host.',externalObserved:false,providerIndependenceClaim:true,
    truthBoundary:'Deployment source is bounded and portable machinery exists, but current independent hosting remains unobserved.',resumeTrigger:'fresh independent-host exact-release receipt',
    sourceMarkers:[{path:'src/relay-vercel-api-executor.mjs',mustContain:['secondAttemptAuthorized === false',"!Object.hasOwn(body, 'target')",'productionPromotion: false']},{path:'src/supplier-exit-drill.mjs',mustContain:['CUTOVER','ROLLBACK']}]
  },
  {
    cutId:'CREDENTIAL_CUSTODY',cutClass:'OWNER_CUSTODY',failureMode:'Credentials/recovery material are lost together or captured by one custody domain.',
    mitigationRefs:['src/century-grade-continuity.mjs','src/sovereign-root-recovery.mjs'],testRefs:['tests/sovereign-root-recovery.test.mjs'],recoveryRefs:['independent custody domains','factor diversity','identity-bound recovery'],alternativeRefs:['OWNER_HELD_OFFLINE_FACTOR','INDEPENDENT_CUSTODY_FACTOR'],
    ownerActionBoundary:'The owner must actually enroll and retain independent recovery material outside repository/source custody. Code cannot possess or attest those factors for him.',ownerEnrollmentObserved:false,
    truthBoundary:'Recovery contracts exist; actual owner factor custody is external to this repository.',resumeTrigger:'owner-approved secret-free recovery-factor enrollment receipt',
    sourceMarkers:[{path:'src/sovereign-root-recovery.mjs',mustContain:['threshold-factors-must-span-independent-custody-domains','recovery-requires-factor-type-diversity','secret-material-must-not-enter-recovery-charter']}]
  },
  {
    cutId:'SOVEREIGN_IDENTITY',cutClass:'OWNER_CUSTODY',failureMode:'Loss of ability to establish the same present sovereign identity and authority epoch.',
    mitigationRefs:['src/sovereign-root-recovery.mjs'],testRefs:['tests/sovereign-root-recovery.test.mjs'],recoveryRefs:['same sovereign identity','authority epoch','fresh identity-bound proof'],alternativeRefs:['OWNER_LIVENESS_ATTESTATION','TRUSTED_HUMAN_ATTESTATION'],
    ownerActionBoundary:'Identity-bound factors and any trusted-human participation require real sovereign enrollment/consent; the system cannot appoint a successor or self-authorize.',ownerEnrollmentObserved:false,
    truthBoundary:'Source verifies the shape of same-identity recovery, not that identity evidence is currently enrolled or available.',resumeTrigger:'fresh sovereign identity-recovery rehearsal evidence',
    sourceMarkers:[{path:'src/sovereign-root-recovery.mjs',mustContain:['recovery-may-only-restore-the-same-sovereign-identity','recovery-authority-epoch-mismatch','successorAuthority: \'NONE\'']}]
  }
];

const audit=compileSovereignCutSetAudit({cuts,sourceBodies});
const output={...audit,generatedAt:new Date().toISOString(),generator:'scripts/sovereign-cut-set-audit.mjs',cutsDeclared:cuts};
mkdirSync(join(root,'artifacts/sovereign'),{recursive:true});writeFileSync(join(root,'artifacts/sovereign/sovereign-cut-set-audit.json'),`${JSON.stringify(output,null,2)}\n`,'utf8');
console.log(JSON.stringify({ok:audit.ok,status:audit.status,counts:audit.counts,unresolvedInternalCuts:audit.unresolvedInternalCuts,runtimeProofRequiredCuts:audit.runtimeProofRequiredCuts,externalProviderCuts:audit.externalProviderCuts,ownerCustodyCuts:audit.ownerCustodyCuts,output:'artifacts/sovereign/sovereign-cut-set-audit.json'},null,2));
if(!audit.ok)process.exitCode=2;
