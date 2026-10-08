import { config, validateStartupConfig } from './src/config.mjs';
import { createStore } from './src/store.mjs';
import { Pipeline } from './src/pipeline.mjs';
import { RevenueEngine } from './src/revenue.mjs';
import { DurableQueue } from './src/queue.mjs';
import { DiscoveryRunner } from './src/discovery-runner.mjs';
import { createMissionAwareJobHandlers } from './src/founder-outcome-job-handlers.mjs';
import { startScheduler } from './src/scheduler.mjs';
import { resolveOmniaV9Mode } from './src/omnia-v9/integrations/config.mjs';
import { resolveOutboundFinalAdmissionHook } from './src/omnia-v9/integrations/outbound-admission.mjs';
import { createAuthoritativeOutreachConsequenceGate } from './src/omnia-v9/integrations/outreach-consequence-admission.mjs';
import { closeSharedBrowserRuntimes } from './src/browser-runtime-pool.mjs';
import { routeProspectCompletion } from './src/first-cash-prospect-completion.mjs';
import { buildLiveOutreach100kSummary, runOutreach100kBatch } from './src/outreach-100k-runtime-control.mjs';
import { createInfiniteOpusJobHandlers } from './src/infinite-opus-native-runtime.mjs';
import { runObservedRevenueFuel } from './src/revenue-observed-fuel.mjs';
import { runRevenueRealProspectCanary } from './src/revenue-real-prospect-canary.mjs';
import { loadPolicyEvidenceBundle } from './src/global-policy-evidence.mjs';
import { createRegistryAdapterRegistry } from './src/company-registry-adapter.mjs';
import { createCompaniesHouseAdapter } from './src/companies-house-adapter.mjs';
import { preparedRecipientUnsubscribeUrls } from './src/unsubscribe.mjs';
import { terminalReadinessWithEffectTruth } from './src/revenue-terminal-effect-truth.mjs';
import { runWinnrSmtpReadinessProbe } from './src/winnr-smtp-readiness.mjs';
import { runUberMind890ProofCycle } from './scripts/ubermind-890-evidence-cycle.mjs';
import { reconcileUberMindRealWorkCounter } from './src/ubermind-real-work-counter.mjs';
import { inspectJevPendingClaims } from './src/ubermind-jev-pending-doctor.mjs';
import { capturePublicIssueWorkload } from './scripts/ubermind-public-issue-intake.mjs';
import { compilePublicIssueBacklog } from './src/ubermind-public-issue-backlog.mjs';
import { runUberMindLiveSourceWork, compileSourceWorkCheckpoint } from './src/ubermind-exact-source-work.mjs';

validateStartupConfig(config);
if (config.nodeEnv === 'production' && config.processRole !== 'worker') {
  throw new Error('worker.mjs requires PROCESS_ROLE=worker in production');
}

const store = createStore(config);
await store.init();
if (typeof store.deleteExpiredArtifacts === 'function') await store.deleteExpiredArtifacts().catch(error => console.error('Artifact cleanup failed', error));

// W13: one genuine, bounded, zero-inference source-work execution per deployed
// source snapshot. Keep its immutable/version-deduped progress ledger separate
// from the E3 native task counter and independently audited economic multiplier.
async function executeUberMindSourceWorkAtStartup(){
  const work=runUberMindLiveSourceWork();
  if(!work.ok){
    console.error('UBERMIND_SOURCE_WORK '+JSON.stringify({
      ok:false,status:work.status,reason:work.reason,
      providerCallsPerformed:0,actualModelSpendUsd:0
    }));
    return;
  }
  const observedAt=new Date().toISOString();
  try{
    const checkpoint=await store.transaction(async tx=>{
      // Multiple deployments/processes cannot count one source revision twice.
      if(tx.transactionClient===true)await tx.pool.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        ['setting:ubermindExactSourceWorkV1']);
      const prior=(await tx.getSettings())?.ubermindExactSourceWorkV1??null;
      const next=compileSourceWorkCheckpoint({prior,work,observedAt});
      if(next.ok&&next.changed)await tx.setSetting('ubermindExactSourceWorkV1',next.ledger);
      return next;
    });
    console.log('UBERMIND_SOURCE_WORK '+JSON.stringify({
      ok:checkpoint.ok&&work.ok,
      status:checkpoint.status,
      verifiedSourceCount:work.verifiedSourceCount,
      exactAnswersActuallyResolvedAndVerified:work.materializedOutputCount,
      sourceRevisionNewToProtectedLedger:checkpoint.changed===true,
      // First observation is a BASELINE; prior exact work is not newly invented.
      newIndependentModelHoldouts:0,
      matchedFrontierCostMultiplier:null,
      global33333xConfirmed:false,
      receiptBatchDigest:work.receiptBatchDigest,
      sourceBatchDigest:work.sourceBatchDigest,
      providerCallsPerformed:0,actualModelSpendUsd:0
    }));
  }catch(error){
    console.error('UBERMIND_SOURCE_WORK '+JSON.stringify({
      ok:false,status:'PROTECTED_SOURCE_WORK_CHECKPOINT_UNAVAILABLE',
      errorClass:String(error?.name??'Error').slice(0,60),
      providerCallsPerformed:0,actualModelSpendUsd:0
    }));
  }
}
await executeUberMindSourceWorkAtStartup();

// W15: discover ACTUAL public project work candidate identities from live
// GitHub issue evidence. Never enqueue them into an effectful or paid queue.
let publicIssueIntakeRunning=false;
async function tickUberMindPublicIssueBacklog(){
  if(publicIssueIntakeRunning)return;
  publicIssueIntakeRunning=true;
  try{
    const capture=await capturePublicIssueWorkload();
    if(!capture.ok||capture.sourceScanComplete!==true){
      console.log('UBERMIND_LIVE_WORK_INTAKE '+JSON.stringify({
        ok:false,status:'LIVE_GITHUB_SOURCE_READ_INCOMPLETE',
        selectedSourceCount:capture.selectedSourceCount??null,
        verifiedSourceCount:capture.observedPublicSourceTasks??0,
        sourceReadFailureCount:capture.sourceReadFailures?.length??0,
        sourceFailureClasses:(capture.sourceReadFailures??[]).reduce((acc,row)=>{
          const reason=String(row.reason??'UNKNOWN').slice(0,50);
          const code=Number.isSafeInteger(row.httpStatus)?row.httpStatus:null;
          const key=reason+':'+String(code??'N/A');
          acc[key]=(acc[key]??0)+1;return acc;
        },{}),
        issueCandidatesNewlyAdmitted:0,
        providerCallsPerformed:0,paidInferenceAuthorized:false
      }));
      return;
    }
    const observedAt=new Date().toISOString();
    const result=await store.transaction(async tx=>{
      if(tx.transactionClient===true)await tx.pool.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        ['setting:ubermindLivePublicIssueBacklogV1']);
      const prior=(await tx.getSettings())?.ubermindLivePublicIssueBacklogV1??null;
      const next=compilePublicIssueBacklog({capture,prior,observedAt});
      if(next.ok&&next.changed)
        await tx.setSetting('ubermindLivePublicIssueBacklogV1',next.ledger);
      return next;
    });
    console.log('UBERMIND_LIVE_WORK_INTAKE '+JSON.stringify({
      ok:result.ok,status:result.status,
      publicOpenWorkCandidates:result.retainedOpenIssueCount??0,
      sourceVersionChanged:result.changed===true,
      newDistinctIssueCandidates:result.newDistinctIssueCandidates??0,
      previouslySeenIssueVersionsChanged:result.changedExistingIssueVersions??0,
      sourceVersionDigest:capture.sourceVersionDigest,
      newIndependentQualityHoldouts:0,
      completedEconomicWork:0,
      benchmarkPermissionGranted:false,customerConsentProven:false,
      providerCallsPerformed:0,paidInferenceAuthorized:false,
      externalEffectAuthority:'NONE'
    }));
  }catch(error){
    console.error('UBERMIND_LIVE_WORK_INTAKE '+JSON.stringify({
      ok:false,status:'SOURCE_DISCOVERY_UNAVAILABLE',
      reasonClass:String(error?.name??'Error').slice(0,64),
      issueCandidatesNewlyAdmitted:0,providerCallsPerformed:0
    }));
  }finally{
    publicIssueIntakeRunning=false;
  }
}
void tickUberMindPublicIssueBacklog();
const publicIssueIntakeInterval=setInterval(tickUberMindPublicIssueBacklog,6*60*60_000);
publicIssueIntakeInterval.unref?.();

// Zero-spend UberMind evidence monitor. Re-evaluates source truth every hour,
// never requests model inference, mints Crown authority, or writes provider state.
// Repeated identical evidence is suppressed instead of spamming the runtime.
let lastUberMindProofDigest=null;
let lastUberMindWorkCounterDigest=null;
let lastJevPendingDigest=null;
async function tickUberMindProofFlywheel(){
  try{
    const evidence=await store.transaction(async tx=>{
      const settings=await tx.getSettings();
      return {
        historical:settings?.infinite_opus_measured_reference_dominance_20261007_v1??null,
        nativeState:settings?.infiniteOpusRuntimeV1??null,
        jevReuseState:settings?.ubermindJevPublicAnswerReuseV1??null
      };
    });
    const counter=reconcileUberMindRealWorkCounter({runtimeState:evidence.nativeState});
    const counterDigest=counter.counterReceiptHash??counter.status+':'+counter.reason;
    if(counterDigest!==lastUberMindWorkCounterDigest||!counter.ok){
      console.log('UBERMIND_REAL_WORK_COUNTER '+JSON.stringify({
        ok:counter.ok,status:counter.status,
        certifiedPolicyWorkCompleted:counter.certifiedPolicyWorkCompleted??null,
        proofLedgerExecutionCount:counter.proofLedgerExecutionCount??null,
        unresolvedPageFaultCount:counter.unresolvedPageFaultCount??null,
        independentFrontierHoldoutsAdmitted:counter.independentFrontierHoldoutsAdmitted??0,
        independentlyAuditedEconomicMultiplier:null,global33333xConfirmed:false,
        counterReceiptHash:counter.counterReceiptHash??null,
        noProviderInferencePerformedByMonitor:true
      }));
      lastUberMindWorkCounterDigest=counterDigest;
    }
    const pendingDoctor=inspectJevPendingClaims({
      reuseState:evidence.jevReuseState,nativeState:evidence.nativeState,now:Date.now()
    });
    const pendingSignature=pendingDoctor.inventoryDigest??pendingDoctor.status+':'+pendingDoctor.reason;
    if(pendingSignature!==lastJevPendingDigest||!pendingDoctor.ok||
       (pendingDoctor.claimsNeedingOwnerReconciliation??0)>0){
      console.log('UBERMIND_JEV_PENDING_CLAIMS '+JSON.stringify({
        ok:pendingDoctor.ok,status:pendingDoctor.status,
        pendingClaimCount:pendingDoctor.pendingClaimCount??null,
        staleClaimCount:pendingDoctor.staleClaimCount??null,
        claimsNeedingOwnerReconciliation:pendingDoctor.claimsNeedingOwnerReconciliation??null,
        statusCounts:pendingDoctor.statusCounts??{},
        inventoryDigest:pendingDoctor.inventoryDigest??null,
        rawClaimIdentifiersExposed:false,automaticRetryAuthorized:false,
        providerCallsPerformed:0
      }));
      lastJevPendingDigest=pendingSignature;
    }
    const report=runUberMind890ProofCycle({historicalMeasuredReferenceDominance:evidence.historical});
    const digest=report.stateDigest??report.status;
    if(digest!==lastUberMindProofDigest||!report.ok){
      console.log('UBERMIND_890_PROOF_LOOP '+JSON.stringify({
        ok:report.ok,status:report.status,
        founderIdeasVerified:report.founderIdeasVerified??null,
        shardDigestsVerified:report.shardDigestsVerified??null,
        donorIds:report.donorIds??[],
        exactIslandDoctorStatus:report.exactIslandDoctorStatus??null,
        independentHoldoutsObserved:report.actualIndependentFrontierHoldoutsInCycle??null,
        historicalSealedPairStatus:report.historicalSealedPairSummaryStatus??null,
        historicDistinctTaskCount:report.historicalSealedDistinctTaskCount??null,
        historicCandidateOnlyFactor:report.historicalCandidateOnlyFactor??null,
        historicProofInclusiveFactor:report.historicalProofInclusiveFactor??null,
        historicPairIndependentlyAuthenticatedHere:false,
        global33333xConfirmed:false,
        paidCallsPerformed:0,spendAuthorized:false,
        stateDigest:report.stateDigest??null
      }));
      lastUberMindProofDigest=digest;
    }
  }catch(error){
    console.error('UBERMIND_890_PROOF_LOOP_FAILED '+JSON.stringify({
      status:'READ_ONLY_EVIDENCE_CYCLE_UNAVAILABLE',
      reasonClass:String(error?.name??'Error').slice(0,60),paidCallsPerformed:0
    }));
  }
}
tickUberMindProofFlywheel();
const uberMindEvidenceInterval=setInterval(tickUberMindProofFlywheel,60*60_000);
uberMindEvidenceInterval.unref?.();


// Fresh authenticated SMTP reachability without a message effect. This probe is
// deliberately narrower than placement/reputation health: TLS -> EHLO -> AUTH ->
// NOOP -> QUIT only. Configured placement quarantine and every non-probe pause
// remain authoritative, and no send/consequence authority is created.
let smtpReadinessInFlight = false;
let smtpReadinessTimer = null;
async function refreshWinnrSmtpReadiness() {
  if (smtpReadinessInFlight) return null;
  smtpReadinessInFlight = true;
  try {
    const result = await runWinnrSmtpReadinessProbe({
      store,
      encryptionKey: config.encryptionKey,
      quarantineOrdinalsText: process.env.WINNR_PLACEMENT_QUARANTINE_ORDINALS || ''
    });
    console.log(`WINNR_SMTP_READINESS ${JSON.stringify(result)}`);
    return result;
  } catch (error) {
    console.error(`WINNR_SMTP_READINESS_FAILED ${JSON.stringify({
      ok: false,
      errorClass: String(error?.code || error?.name || 'error').slice(0, 80),
      messagesSent: 0,
      prospectSendAuthorityGranted: false
    })}`);
    return null;
  } finally {
    smtpReadinessInFlight = false;
  }
}
await refreshWinnrSmtpReadiness();
smtpReadinessTimer = setInterval(() => { void refreshWinnrSmtpReadiness(); }, 60 * 60_000);
smtpReadinessTimer.unref?.();

// Explicit one-shot reality canary. Off by default. When enabled it performs one
// first-party public GET and internal evidence/prospect writes only. It cannot
// verify a route, send a message, spend money, authorize outreach, or deploy.
if (String(process.env.REVENUE_REAL_CANARY || '').trim() === '1') {
  try {
    const receipt = await runRevenueRealProspectCanary({ store, config, logger: console });
    if (!receipt?.ok) console.error(`REVENUE_REAL_PROSPECT_CANARY_REFUSED ${JSON.stringify(receipt)}`);
  } catch (error) {
    console.error(`REVENUE_REAL_PROSPECT_CANARY_FAILED ${JSON.stringify({ errorClass: String(error?.code || error?.name || 'error').slice(0, 80), outboundAuthority: 'NONE' })}`);
  }
}

if (String(process.env.REVENUE_REAL_CANARY || '').trim() === '1') {
  try { console.log(`REVENUE_OBSERVED_FUEL ${JSON.stringify(await runObservedRevenueFuel({store, config}))}`); }
  catch (error) { console.error(`REVENUE_OBSERVED_FUEL_REFUSED ${JSON.stringify({errorClass:String(error?.code || error?.name || 'error').slice(0,80),outboundAuthority:'NONE'})}`); }
}

try { console.log(`REVENUE_TERMINAL_READINESS ${JSON.stringify(await terminalReadinessWithEffectTruth(store,process.env,{policyRegistry:loadPolicyEvidenceBundle({now:new Date()}),registryAdapters:createRegistryAdapterRegistry([createCompaniesHouseAdapter({apiKey:config.providers?.companiesHouse?.apiKey||''})]),unsubscribeFactory:email=>preparedRecipientUnsubscribeUrls(config.baseUrl,email,config.unsubscribeSecret)}))}`); }
catch (error) { console.error(`REVENUE_TERMINAL_READINESS_REFUSED ${JSON.stringify({ errorClass: String(error?.code || error?.name || 'error').slice(0, 80), outboundAuthority: 'NONE' })}`); }

const queue = new DurableQueue(store, config, console);
let revenue;
// OMNIA_V9_MODE still controls only the non-authoritative shadow observer.
// Real effect-adapter sends have a separate authoritative consequence gate
// below; legacy Gmail behavior remains unchanged unless OUTBOUND_USE_EFFECT_ADAPTER
// is explicitly enabled.
const omniaV9Mode = resolveOmniaV9Mode(process.env);
console.log(`OMNIA V9 outbound integration mode: ${omniaV9Mode}`);
const pipeline = new Pipeline(store, config, {
  // One completion router owns the generic-vs-paid boundary. Public/generic
  // research delegates to RevenueEngine exactly as before. A persisted paid
  // first-cash sprint is instead advanced through deterministic QA to
  // DELIVERY_READY and never enters generic report auto-email delivery.
  onProspectComplete: prospect => routeProspectCompletion({ store, revenue, prospect }),
  outboundFinalAdmissionShadow: resolveOutboundFinalAdmissionHook({ mode: omniaV9Mode, store }),
  outboundConsequenceGate: createAuthoritativeOutreachConsequenceGate({ store, cfg: config })
});
const enqueueJob = (type, payload, options = {}) => queue.enqueue(type, payload, type === 'outreach.100k.process'
  ? { ...options, maxAttempts: 1, recoveryPolicy: 'reconcile' }
  : options);
const enqueueResearch = payload => enqueueJob('research.batch', payload, {
  maxAttempts: 3,
  dedupeKey: payload.leadId ? `research:lead:${payload.leadId}` : `research:${payload.reason || 'manual'}:${Math.floor(Date.now() / 30000)}`
});
revenue = new RevenueEngine(store, config, pipeline, { enqueueResearch });
const discoveryRunner = new DiscoveryRunner(store, config);
const handlers = createMissionAwareJobHandlers({ store, cfg: config, pipeline, revenue, discoveryRunner, enqueueJob });
// Infinite Opus jobs resolve only admin-admitted durable context snapshots and
// certified cognition from the shared store. Queue payloads cannot inject authority.
Object.assign(handlers, createInfiniteOpusJobHandlers({ store }));
handlers['outreach.100k.process'] = async payload => {
  const liveSummary = await buildLiveOutreach100kSummary({ store, cfg: config });
  const input = payload && typeof payload === 'object' ? payload : {};
  // Certificate IDs are observation receipts and may legitimately change as
  // provider-confirmed counts and observation time advance. The immutable
  // founder binding is the exact recipient-set digest; every batch recompiles
  // a fresh green certificate from current evidence before any effect.
  return runOutreach100kBatch({
    store,
    cfg: config,
    enqueueJob,
    payload: { ...input, founderCertificateId: input.certificateId || input.founderCertificateId || null, certificateId: '', liveSummary }
  });
};
const stopScheduler = startScheduler(queue, config, console);
const workerPromise = queue.startWorker(handlers, { concurrency: config.queue.concurrency });

console.log(`UberBond worker ${queue.workerId} started using ${config.storeBackend}`);

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}; worker is draining active jobs.`);
  if (smtpReadinessTimer) clearInterval(smtpReadinessTimer);
  stopScheduler();
  await queue.stopWorker().catch(error => console.error('Worker stop failed', error));
  await closeSharedBrowserRuntimes().catch(error => console.error('Browser runtime stop failed', error));
  await store.close();
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

await workerPromise;