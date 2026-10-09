// UberMind startup and evidence jobs the production worker runs.
//
// These lived inline in worker.mjs, which made it the one entry point that
// both decided things and was exempt from every gate (the coverage ratchet lets
// worker.mjs off only while it is pure wiring). They persist version-deduped
// ledgers under advisory locks, so a defect here double-counts source work or
// silently drops intake -- and nothing executed them. Moved here verbatim;
// dependencies are injected so the worker passes the real implementations and
// tests pass fakes without network or store side effects.

const REQUIRED_DEPENDENCIES = [
  'runUberMindLiveSourceWork', 'compileSourceWorkCheckpoint',
  'capturePublicIssueWorkload', 'compilePublicIssueBacklog', 'compileRealIssueJevShadowPrecommit',
  'reconcileUberMindRealWorkCounter', 'inspectJevPendingClaims', 'runUberMind890ProofCycle'
];

export function createUberMindWorkerJobs({ store, deps = {}, log = console } = {}) {
  if (!store || typeof store.transaction !== 'function') throw new Error('transactional-store-required');
  const missing = REQUIRED_DEPENDENCIES.filter(name => typeof deps[name] !== 'function');
  if (missing.length) throw new Error('ubermind-worker-dependencies-required:' + missing.join(','));
  const {
    runUberMindLiveSourceWork, compileSourceWorkCheckpoint,
    capturePublicIssueWorkload, compilePublicIssueBacklog, compileRealIssueJevShadowPrecommit,
    reconcileUberMindRealWorkCounter, inspectJevPendingClaims, runUberMind890ProofCycle
  } = deps;

  // W13: one genuine, bounded, zero-inference source-work execution per deployed
  // source snapshot. Keep its immutable/version-deduped progress ledger separate
  // from the E3 native task counter and independently audited economic multiplier.
  async function executeUberMindSourceWorkAtStartup(){
    const work=runUberMindLiveSourceWork();
    if(!work.ok){
      log.error('UBERMIND_SOURCE_WORK '+JSON.stringify({
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
      log.log('UBERMIND_SOURCE_WORK '+JSON.stringify({
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
      log.error('UBERMIND_SOURCE_WORK '+JSON.stringify({
        ok:false,status:'PROTECTED_SOURCE_WORK_CHECKPOINT_UNAVAILABLE',
        errorClass:String(error?.name??'Error').slice(0,60),
        providerCallsPerformed:0,actualModelSpendUsd:0
      }));
    }
  }

  // W15: discover ACTUAL public project work candidate identities from live
  // GitHub issue evidence. Never enqueue them into an effectful or paid queue.
  let publicIssueIntakeRunning=false;
  async function tickUberMindPublicIssueBacklog(){
    if(publicIssueIntakeRunning)return;
    publicIssueIntakeRunning=true;
    try{
      const capture=await capturePublicIssueWorkload({includeJevShadowInputs:true});
      if(!capture.ok||capture.sourceScanComplete!==true){
        log.log('UBERMIND_LIVE_WORK_INTAKE '+JSON.stringify({
          ok:false,status:'LIVE_GITHUB_SOURCE_READ_INCOMPLETE',
          selectedSourceCount:capture.selectedSourceCount??null,
          sourceAuthenticationMode:capture.sourceAuthenticationMode??'UNAVAILABLE',
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
      // W20: compile actual source-verified public GitHub issue versions into
      // bounded, typed Jev shadow questions without sending issue text to a
      // provider, authorizing paid inference or granting task-quality authority.
      const shadow=compileRealIssueJevShadowPrecommit({capture});
      if(shadow.ok){
        const recorded=await store.transaction(async tx=>{
          if(tx.transactionClient===true)await tx.pool.query(
            'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
            ['setting:ubermindJevRealIssueShadowPrecommitV1']);
          const prior=(await tx.getSettings())?.ubermindJevRealIssueShadowPrecommitV1??null;
          if(prior?.precommitDigest===shadow.precommitDigest)
            return {status:'EXISTING_REAL_SOURCE_JEV_SHADOW_PRECOMMIT',newSourceVersion:false};
          const oldVersions=Array.isArray(prior?.versions)?prior.versions:[];
          if(oldVersions.length>=64)
            return {status:'JEV_SHADOW_PRECOMMIT_VERSION_ARCHIVE_REQUIRED',newSourceVersion:false};
          const receipt={schemaVersion:shadow.schemaVersion,
            sourceVersionDigest:shadow.sourceVersionDigest,
            precommitDigest:shadow.precommitDigest,
            realSourceIssuesPrecommitted:shadow.realSourceIssuesPrecommitted,
            originalTypedAdvisoryQuestions:shadow.originalTypedAdvisoryQuestions,
            boundedGovernedBatchCount:shadow.boundedGovernedBatchCount,
            paidInferenceAuthorized:false,independentQualityEvidence:false,
            lastObservedAt:observedAt,
            versions:[...oldVersions,{precommitDigest:shadow.precommitDigest,
              sourceVersionDigest:shadow.sourceVersionDigest,
              issueCount:shadow.realSourceIssuesPrecommitted,observedAt}]};
          await tx.setSetting('ubermindJevRealIssueShadowPrecommitV1',receipt);
          return {status:'NEW_REAL_SOURCE_JEV_SHADOW_PRECOMMIT',newSourceVersion:true};
        });
        log.log('UBERMIND_JEV_REAL_ISSUE_SHADOW '+JSON.stringify({
          ok:true,status:recorded.status,
          newSourceVersion:recorded.newSourceVersion,
          precommitDigest:shadow.precommitDigest,
          sourceVersionDigest:shadow.sourceVersionDigest,
          realSourceIssuesPrecommitted:shadow.realSourceIssuesPrecommitted,
          originalTypedAdvisoryQuestions:shadow.originalTypedAdvisoryQuestions,
          boundedGovernedBatchCount:shadow.boundedGovernedBatchCount,
          newFrontierQualityHoldouts:0,providerCallsPerformed:0,
          paidInferenceAuthorized:false,empiricalMultiplier:null,
          externalEffectAuthority:'NONE'
        }));
      }else log.log('UBERMIND_JEV_REAL_ISSUE_SHADOW '+JSON.stringify({
        ok:false,status:shadow.status,reason:shadow.reason,
        providerCallsPerformed:0,paidInferenceAuthorized:false
      }));
      log.log('UBERMIND_LIVE_WORK_INTAKE '+JSON.stringify({
        ok:result.ok,status:result.status,
        publicOpenWorkCandidates:result.retainedOpenIssueCount??0,
        sourceVersionChanged:result.changed===true,
        newDistinctIssueCandidates:result.newDistinctIssueCandidates??0,
        previouslySeenIssueVersionsChanged:result.changedExistingIssueVersions??0,
        sourceVersionDigest:capture.sourceVersionDigest,
        sourceAuthenticationMode:capture.sourceAuthenticationMode??'UNAVAILABLE',
        newIndependentQualityHoldouts:0,
        completedEconomicWork:0,
        benchmarkPermissionGranted:false,customerConsentProven:false,
        providerCallsPerformed:0,paidInferenceAuthorized:false,
        externalEffectAuthority:'NONE'
      }));
    }catch(error){
      log.error('UBERMIND_LIVE_WORK_INTAKE '+JSON.stringify({
        ok:false,status:'SOURCE_DISCOVERY_UNAVAILABLE',
        reasonClass:String(error?.name??'Error').slice(0,64),
        issueCandidatesNewlyAdmitted:0,providerCallsPerformed:0
      }));
    }finally{
      publicIssueIntakeRunning=false;
    }
  }

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
        log.log('UBERMIND_REAL_WORK_COUNTER '+JSON.stringify({
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
        log.log('UBERMIND_JEV_PENDING_CLAIMS '+JSON.stringify({
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
        log.log('UBERMIND_890_PROOF_LOOP '+JSON.stringify({
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
      log.error('UBERMIND_890_PROOF_LOOP_FAILED '+JSON.stringify({
        status:'READ_ONLY_EVIDENCE_CYCLE_UNAVAILABLE',
        reasonClass:String(error?.name??'Error').slice(0,60),paidCallsPerformed:0
      }));
    }
  }

  return { executeUberMindSourceWorkAtStartup, tickUberMindPublicIssueBacklog, tickUberMindProofFlywheel };
}
