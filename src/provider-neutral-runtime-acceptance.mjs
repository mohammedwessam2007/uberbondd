import { verifyRuntimeTransitionReceiptIntegrity } from './runtime-transition-receipts.mjs';
import { verifyIndependentPostgresBackupRestoreReceiptIntegrity } from './postgres-backup-restore-verifier.mjs';

export const PROVIDER_NEUTRAL_RUNTIME_ACCEPTANCE_VERSION='uberbond.provider-neutral-runtime-acceptance.v1.1';
const SHA40=/^[0-9a-f]{40}$/;
const SHA256=/^sha256:[0-9a-f]{64}$/;
const ZERO=Object.freeze({customerMessages:0,providerCalls:0,spendCents:0,deployments:0,dnsChanges:0,credentialChanges:0,paymentMutations:0,productionMutations:0});
const text=(v,max=500)=>{const s=String(v??'').trim();return s&&s.length<=max?s:null;};
const norm=(v,max=500)=>text(v,max)?.toLowerCase()||null;
const uniq=a=>[...new Set(a.filter(Boolean))];
const fail=(r,e={})=>({ok:false,schemaVersion:PROVIDER_NEUTRAL_RUNTIME_ACCEPTANCE_VERSION,status:'NAMED_RUNTIME_ACCEPTANCE_REFUSED',reasonCodes:uniq(r),businessEffectAuthority:'NONE',externalEffectLedger:{...ZERO},...e});

export function verifyProviderNeutralRuntimeAcceptance(input={}){
  const reasons=[];
  const sourceCommit=text(input.sourceCommit,40)?.toLowerCase()||null;
  if(!sourceCommit||!SHA40.test(sourceCommit)) reasons.push('exact-source-commit-required');
  const host=input.host||{};
  for(const [key,max] of [['runtimeIdentity',500],['provider',160],['region',160],['imageDigest',80],['configDigest',80],['dataSchemaDigest',80]]) if(!text(host[key],max)) reasons.push(`host-${key}-required`);
  if(host.imageDigest&&!SHA256.test(String(host.imageDigest).toLowerCase())) reasons.push('host-image-digest-must-be-sha256');
  if(host.configDigest&&!SHA256.test(String(host.configDigest).toLowerCase())) reasons.push('host-config-digest-must-be-sha256');
  if(host.dataSchemaDigest&&!SHA256.test(String(host.dataSchemaDigest).toLowerCase())) reasons.push('host-data-schema-digest-must-be-sha256');
  if(host.sourceCommit&&String(host.sourceCommit).toLowerCase()!==sourceCommit) reasons.push('host-source-commit-mismatch');
  if(host.authenticatedHealthObserved!==true) reasons.push('authenticated-host-health-required');

  const pg=input.postgresRestoreReceipt||{};
  if(!verifyIndependentPostgresBackupRestoreReceiptIntegrity(pg)) reasons.push('cryptographically-independent-postgres-restore-required');
  if(pg.sourceCommit&&String(pg.sourceCommit).toLowerCase()!==sourceCommit) reasons.push('postgres-restore-source-mismatch');

  const restart=input.restartRecoveryReceipt||{};
  if(restart.ok!==true||restart.status!=='RESTART_RECOVERY_REHEARSAL_PASSED') reasons.push('restart-recovery-rehearsal-required');
  if(restart.sourceCommit&&String(restart.sourceCommit).toLowerCase()!==sourceCommit) reasons.push('restart-recovery-source-mismatch');
  if(restart.noDuplicateEffectClaim!=='QUEUE_REPLAY_SAFE_WORK_RECLAIMED_ONCE__UNCERTAIN_RECONCILE_WORK_NOT_REPLAYED') reasons.push('restart-no-duplicate-effect-proof-required');

  const workload=input.durableWorkloadReceipt||{};
  if(!verifyRuntimeTransitionReceiptIntegrity(workload,'DURABLE_WORKLOAD')) reasons.push('canonical-durable-workload-receipt-integrity-required');
  if(workload.evidenceClass!=='OBSERVED_RUNTIME') reasons.push('observed-durable-workload-receipt-required');
  if(norm(workload.runtimeIdentity)!==norm(host.runtimeIdentity)) reasons.push('durable-workload-runtime-mismatch');
  if(String(workload.sourceCommit||'').toLowerCase()!==sourceCommit) reasons.push('durable-workload-source-mismatch');
  if(workload.persistedAcrossRestart!==true) reasons.push('durable-workload-must-survive-restart');
  if(workload.duplicateExternalEffects!==0) reasons.push('durable-workload-must-have-zero-duplicate-effects');
  if(!text(workload.evidenceRef)||!text(workload.independentVerifierRef)) reasons.push('durable-workload-independent-evidence-required');

  const cut=input.cutoverRollbackReceipt||{};
  if(!verifyRuntimeTransitionReceiptIntegrity(cut,'CUTOVER_ROLLBACK')) reasons.push('canonical-cutover-rollback-receipt-integrity-required');
  if(cut.evidenceClass!=='OBSERVED_RUNTIME') reasons.push('observed-cutover-rollback-receipt-required');
  if(String(cut.sourceCommit||'').toLowerCase()!==sourceCommit) reasons.push('cutover-source-mismatch');
  if(cut.cutoverSucceeded!==true||cut.rollbackExercised!==true||cut.rollbackSucceeded!==true) reasons.push('successful-cutover-and-rollback-rehearsal-required');
  if(cut.duplicateExternalEffects!==0) reasons.push('cutover-rollback-must-have-zero-duplicate-effects');
  if(!text(cut.evidenceRef)||!text(cut.independentVerifierRef)) reasons.push('cutover-independent-evidence-required');

  const continuity=input.continuityRehearsal||{};
  if(continuity.ok!==true||continuity.status!=='CONTINUITY_REHEARSAL_VERIFIED_WITHIN_DECLARED_SCOPE') reasons.push('verified-century-continuity-rehearsal-required');
  const loss=input.providerLossReceipt||{};
  if(!verifyRuntimeTransitionReceiptIntegrity(loss,'PROVIDER_LOSS')) reasons.push('canonical-provider-loss-receipt-integrity-required');
  if(loss.evidenceClass!=='OBSERVED_RUNTIME'||loss.receiptClass!=='PROVIDER_LOSS') reasons.push('observed-provider-loss-receipt-required');
  if(loss.primaryUnavailable!==true) reasons.push('provider-loss-primary-unavailable-must-be-observed');
  if(!text(loss.failedProvider,160)||!text(loss.alternateProvider,160)||norm(loss.failedProvider,160)===norm(loss.alternateProvider,160)) reasons.push('provider-loss-must-cross-provider-boundary');
  if(loss.duplicateExternalEffects!==0) reasons.push('provider-loss-must-have-zero-duplicate-effects');
  if(!text(loss.evidenceRef)||!text(loss.independentVerifierRef)) reasons.push('provider-loss-independent-evidence-required');
  if(continuity.manifestDigest&&loss.manifestDigest!==continuity.manifestDigest) reasons.push('provider-loss-continuity-manifest-mismatch');

  const control=input.controlPlaneReceipt||{};
  if(control.evidenceClass!=='OBSERVED_RUNTIME') reasons.push('observed-control-plane-receipt-required');
  if(String(control.sourceCommit||'').toLowerCase()!==sourceCommit) reasons.push('control-plane-source-mismatch');
  if(norm(control.runtimeIdentity)!==norm(host.runtimeIdentity)) reasons.push('control-plane-runtime-mismatch');
  if(control.authenticatedReadSucceeded!==true) reasons.push('authenticated-control-plane-read-required');
  if(control.privateLifeStateExposed!==false) reasons.push('control-plane-must-not-expose-private-life-state');
  if(control.writeAuthorityGranted!==false) reasons.push('control-plane-must-remain-read-only');
  if(!text(control.evidenceRef)||!text(control.independentVerifierRef)) reasons.push('control-plane-independent-evidence-required');

  if(reasons.length) return fail(reasons,{sourceCommit});
  return {ok:true,schemaVersion:PROVIDER_NEUTRAL_RUNTIME_ACCEPTANCE_VERSION,status:'NAMED_RUNTIME_VERIFIED_WITHIN_REHEARSED_SCOPE',sourceCommit,host:{runtimeIdentity:host.runtimeIdentity,provider:host.provider,region:host.region,imageDigest:host.imageDigest,configDigest:host.configDigest,dataSchemaDigest:host.dataSchemaDigest},evidenceRefs:[pg.verificationEvidenceRef,pg.evidenceRef,restart.commands?.[0],workload.evidenceRef,cut.evidenceRef,loss.evidenceRef,control.evidenceRef].filter(Boolean),providerIndependence:'PROVIDER_LOSS_REHEARSED_ACROSS_DISTINCT_NAMED_PROVIDERS',postgresPersistence:'BACKUP_RESTORE_INDEPENDENTLY_VERIFIED_AND_RESTART_REHEARSED',cutoverRollback:'OBSERVED_AND_REVERSIBLE_WITHIN_DECLARED_SCOPE',controlPlane:'AUTHENTICATED_READ_ONLY__PRIVATE_LIFE_STATE_NOT_EXPOSED',truthBoundary:'This proves only the named exact-source runtime and recorded rehearsal scope. It does not prove elapsed autonomy, future restoreability, commercial outcomes, legal readiness, century continuity, AGI or ASI.',asiTruth:'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED',businessEffectAuthority:'NONE',externalEffectLedger:{...ZERO}};
}
