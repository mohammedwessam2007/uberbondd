import { createSemanticClosureChecker, semanticHash, renderClosedClaims,
  coalesceSemanticProofCuts, validateSemanticContext } from './semantic-closure-kernel.mjs';
import { createCognitionLedger, createExactResponseCache, readExactResponse, putExactResponse,
  exactRequestFingerprint, reserveCognitionCall, markCognitionDispatched,
  settleCognitionCall, estimateCognitionCeiling, cognitionBudgetSummary, cognitionMetrics } from './cognition-ledger.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { redactSecrets } from './secret-patterns.mjs';
import { createProvableExecutionLedger, appendProvableExecution, summarizeProvableExecutions } from './provable-execution-ledger.mjs';
import { executeDecisionFranchise } from './decision-franchise.mjs';
import { certifyExhaustiveCrownDecisionFranchise } from './decision-franchise-certifier.mjs';
import { verifyFrontierThoughtBond, thoughtBondAuthorityId, thoughtBondSlotHash } from './frontier-thought-bond.mjs';

export const INFINITE_OPUS_TASK_SCHEMA = 'uberbond.infinite-opus.task.v1';
const SETTING = 'infiniteOpusRuntimeV1';
const identity = value => typeof value === 'string' && /^[a-zA-Z0-9_.:/-]{1,240}$/.test(value);
const safePayload = value => {
  const encoded = JSON.stringify(value);
  if (encoded !== redactSecrets(encoded)) throw new Error('secret-bearing-payload-refused');
  return value;
};

// Reuse native JsonStore/PostgresStore transactions. PostgreSQL uses one shared
// transaction lock, including first creation; JSON is a single-process backend.
async function transact(store, operation) {
  if (typeof store?.transaction !== 'function') throw new Error('native-durable-store-required');
  return store.transaction(async tx => {
    if (tx.transactionClient === true) await tx.pool.query('SELECT pg_advisory_xact_lock($1)', [1347375955]);
    return operation(tx);
  });
}
const zero = extra => ({ businessEffectAuthority: 'NONE', externalEffectAuthority: 'NONE',
  externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS), ...extra });

export function createInfiniteOpusRuntime({ store, contextLoader, authorityRecords = [], decisionFranchises = [],
  clock = Date.now, paidExecutor = null, paidAuthorization = null, routePrices = [], platformFeeRate = 0.055, referenceContractResolver = null } = {}) {
  const paidMonthlyCapMicrousd = paidAuthorization?.maxMonthlyMicrousd ?? 20_000_000;
  if (!Number.isSafeInteger(paidMonthlyCapMicrousd) || paidMonthlyCapMicrousd < 15_000_000 || paidMonthlyCapMicrousd > 20_000_000 && paidAuthorization) throw new Error('paid-runtime-cap-must-fit-20-dollar-key-and-15-dollar-crown-reserve');
  routePrices = structuredClone(routePrices);
  paidAuthorization = paidAuthorization ? structuredClone(paidAuthorization) : null;
  const baseAuthorityRecords = structuredClone(authorityRecords);
  if (!Array.isArray(decisionFranchises) || decisionFranchises.length > 4096) throw new Error('bounded-decision-franchise-registry-required');
  const admittedDecisionFranchises = structuredClone(decisionFranchises);
  const today = () => new Date(clock()).toISOString().slice(0, 10);
  async function stateFor(tx) {
    const settings = await tx.getSettings();
    const state = settings[SETTING] ?? {
      schemaVersion: INFINITE_OPUS_TASK_SCHEMA, version: 0,
      ledger: createCognitionLedger({ month: today().slice(0, 7), monthlyCapMicrousd: paidMonthlyCapMicrousd }),
      cache: createExactResponseCache(), tasks: {}, debts: {}, capital: {}, thoughtBonds: {}, decisionFranchises: {}, negativeKnowledge: [], receipts: [], proofLedger: createProvableExecutionLedger({ period: today().slice(0, 7) })
    };
    if (state.schemaVersion !== INFINITE_OPUS_TASK_SCHEMA) throw new Error('runtime-state-schema-drift');
    // Preserve every historical month; unsettled charges block paid capacity.
    if (state.ledger.month !== today().slice(0, 7)) {
      state.archivedLedgers ??= {};
      state.archivedProofLedgers ??= {};
      if (state.proofLedger) state.archivedProofLedgers[state.proofLedger.period] = structuredClone(state.proofLedger);
      state.archivedLedgers[state.ledger.month] = structuredClone(state.ledger);
      state.ledger = createCognitionLedger({ month: today().slice(0, 7), monthlyCapMicrousd: paidMonthlyCapMicrousd });
      state.proofLedger = createProvableExecutionLedger({ period: today().slice(0, 7) });
      if (Object.values(state.archivedLedgers).some(l => l.incidents.length || l.calls.some(c => ['RESERVED','DISPATCHED'].includes(c.status)))) state.ledger.incidents.push({ reason: 'HISTORICAL_RECONCILIATION_REQUIRED' });
    }
    if (paidAuthorization && state.ledger.monthlyCapMicrousd !== paidMonthlyCapMicrousd) {
      const clean = state.ledger.calls.length === 0 && state.ledger.incidents.length === 0;
      if (clean) state.ledger = createCognitionLedger({ month: state.ledger.month, monthlyCapMicrousd: paidMonthlyCapMicrousd });
      else state.ledger.incidents.push({ reason: 'PAID_RUNTIME_CAP_RECONCILIATION_REQUIRED' });
    }
    state.proofLedger ??= createProvableExecutionLedger({ period: today().slice(0, 7) });
    state.thoughtBonds ??= {};
    state.decisionFranchises ??= {};
    if (state.proofLedger.period !== today().slice(0,7)) throw new Error('proof-ledger-month-reconciliation-required');
    cognitionBudgetSummary(state.ledger, today());
    return structuredClone(state);
  }
  async function persist(tx, state) {
    safePayload(state);
    state.version++;
    await tx.setSetting(SETTING, state);
  }
  async function getContext(task) {
    if (typeof contextLoader !== 'function') return null;
    const context = await contextLoader(task);
    return validateSemanticContext(context, clock()).length ? null : context;
  }
  return {
    async execute(task) {
      if (task?.schemaVersion !== INFINITE_OPUS_TASK_SCHEMA || !identity(task.taskId) || !identity(task.taskClass) || !identity(task.stakes) || task.stakes === 'UNKNOWN' || task.sideEffectClass !== 'NONE') return zero({ ok: false, status: 'TASK_SCHEMA_OR_AUTHORITY_REFUSED', providerCallsPerformed: 0 });
      safePayload(task);
      // Task payloads cannot inject authority, runtime context, credentials or evaluators.
      if (['authorityRecords','context','crownRevision','paidAuthorization','executor','apiKey'].some(key => Object.hasOwn(task, key))) return zero({ ok: false, status: 'TASK_AUTHORITY_INJECTION_REFUSED', providerCallsPerformed: 0 });
      const taskHash = semanticHash(task), context = await getContext(task);
      return transact(store, async tx => {
        const state = await stateFor(tx), prior = state.tasks[task.taskId];
        const liveThoughtBondRecords=[];
        for (const bond of Object.values(state.thoughtBonds)) {
          const verifiedBond=verifyFrontierThoughtBond({bond,now:clock()});
          if (verifiedBond.ok) liveThoughtBondRecords.push(verifiedBond.record);
        }
        const checkClosure=createSemanticClosureChecker({authorityRecords:[...baseAuthorityRecords,...liveThoughtBondRecords]});
        if (prior && prior.taskHash !== taskHash) throw new Error('task-idempotency-contradiction');
        if (Object.keys(state.tasks).length >= 10000 && !prior) throw new Error('archive-checkpoint-required-before-capacity-growth');
        if (prior?.status === 'CLOSED_DECISION_FRANCHISE') {
          return zero({ ok:true, status:'IDEMPOTENT_DECISION_FRANCHISE_HIT', decision:structuredClone(prior.decision),
            franchiseId:prior.franchiseId, proofClass:'E3', semanticAuthority:'CERTIFIED_BOUNDED_POLICY', providerCallsPerformed:0 });
        }

        // Exact-before-JEV: attempt independently admitted Decision Franchises
        // before any semantic page fault or paid cognition. Task-supplied data
        // can never register a franchise or trust pin.
        const liveDecisionFranchises=[...admittedDecisionFranchises,...Object.values(state.decisionFranchises)];
        if (context && task.payload && liveDecisionFranchises.length) {
          const franchiseTask = {
            taskId:task.taskId, taskClass:task.taskClass,
            qualityContractHash:context.qualityContractHash,
            sideEffectClass:task.sideEffectClass, payload:structuredClone(task.payload)
          };
          const candidates=liveDecisionFranchises
            .filter(row=>row?.record?.spec?.taskClass===task.taskClass)
            .map(row=>({row,out:executeDecisionFranchise({
              record:row.record,trustPin:row.trustPin,task:franchiseTask,
              currentContext:context,now:clock()
            })}))
            .filter(x=>x.out.ok);
          if (candidates.length > 1) {
            state.receipts.push({kind:'DECISION_FRANCHISE_AMBIGUITY',taskId:task.taskId,observedAt:clock(),candidateCount:candidates.length});
            await persist(tx,state);
            return zero({ok:false,status:'AMBIGUOUS_DECISION_FRANCHISE_PAGE_FAULT',providerCallsPerformed:0,semanticAuthority:'NONE'});
          }
          if (candidates.length === 1) {
            const hit=candidates[0].out, franchiseHash=hit.franchiseHash;
            state.tasks[task.taskId]={taskHash,status:'CLOSED_DECISION_FRANCHISE',decision:structuredClone(hit.decision),franchiseId:hit.franchiseId,franchiseHash};
            const asset=state.capital[franchiseHash]??{
              assetId:franchiseHash,kind:'DECISION_FRANCHISE',qualityType:'E3_CERTIFIED_BOUNDED_POLICY',
              createdAt:clock(),tasksServedCount:0,providerCallsAvoided:0,status:'VALID_FOR_CURRENT_TYPED_SCOPE'
            };
            asset.tasksServedCount=(asset.tasksServedCount??0)+1;
            asset.providerCallsAvoided=(asset.providerCallsAvoided??0)+1;
            asset.lastValidatedAt=clock();
            state.capital[franchiseHash]=asset;
            state.receipts.push({kind:'DECISION_FRANCHISE_HIT',taskId:task.taskId,executionClass:'E3',
              franchiseId:hit.franchiseId,franchiseHash,observedAt:clock(),providerCallsPerformed:0});

            if (typeof referenceContractResolver === 'function') {
              const reference=await referenceContractResolver({
                task:structuredClone(task),context:structuredClone(context),closure:null,
                output:structuredClone(hit.decision),executionClass:'E3',
                franchise:{id:hit.franchiseId,hash:franchiseHash,proofClass:hit.proofClass}
              });
              if (reference?.ok===true && reference.directReference && reference.referenceContractHash) {
                state.proofLedger=appendProvableExecution(state.proofLedger,{
                  executionId:semanticHash({taskId:task.taskId,taskHash,franchiseHash,executionClass:'E3'}),
                  taskId:task.taskId,completedAt:new Date(clock()).toISOString(),equivalenceClass:'E3',
                  proofVerified:true,matchedObligationHash:'sha256:'+semanticHash(task.obligation??task.request??task),
                  qualityContractHash:'sha256:'+context.qualityContractHash,
                  proofRef:'decision-franchise:'+franchiseHash,
                  referenceContractHash:reference.referenceContractHash,directReference:reference.directReference
                });
                state.receipts.push({kind:'PROVABLE_EXECUTION',taskId:task.taskId,executionClass:'E3',
                  referenceContractHash:reference.referenceContractHash,observedAt:clock()});
              } else state.receipts.push({kind:'REFERENCE_CONTRACT_MISSING',taskId:task.taskId,executionClass:'E3',observedAt:clock()});
            }
            await persist(tx,state);
            return zero({ok:true,status:'CLOSED_DECISION_FRANCHISE',decision:structuredClone(hit.decision),
              franchiseId:hit.franchiseId,franchiseHash,proofClass:'E3',
              semanticAuthority:'CERTIFIED_BOUNDED_POLICY',providerCallsPerformed:0});
          }
        }
        let cacheHit = null;
        if (context && task.request) {
          if (task.request.semanticStateHash !== semanticHash(context) || semanticHash(task.request.sourceHashes) !== semanticHash(context.sourceHashes) || task.request.qualityContractHash !== context.qualityContractHash) throw new Error('request-context-binding-mismatch');
          cacheHit = readExactResponse(state.cache, { request: task.request, context, checkClosure, now: clock() });
          state.cache = cacheHit.cache;
        }
        if (cacheHit?.ok) state.receipts.push({ kind: 'CACHE_HIT', taskId: task.taskId, observedAt: clock() });
        const artifact = cacheHit?.ok ? cacheHit.artifact : task.artifact;
        const closure = context ? checkClosure({ artifact, context, now: clock() }) : { ok: false, reasonCodes: ['TRUSTED_CONTEXT_NOT_CONNECTED'] };
        if (!closure.ok) {
          if (!task.obligation) throw new Error('typed-unresolved-obligation-required');
          state.negativeKnowledge.push({ failureId: semanticHash({ taskHash, context, reasons: closure.reasonCodes }), reasons: closure.reasonCodes, taskClass: task.taskClass, observedAt: clock(), semanticAuthority: 'NONE' });
          const debt = { taskId: task.taskId, taskClass: task.taskClass, obligation: task.obligation,
            context, stakes: task.stakes, deadline: task.deadline ?? null,
            reasons: closure.reasonCodes, status: 'AWAITING_TRUSTED_SEMANTIC_AUTHORITY' };
          state.debts[task.taskId] = debt;
          state.tasks[task.taskId] = { taskHash, status: 'PAGE_FAULT', artifactHash: null };
          state.receipts.push({ kind: 'PAGE_FAULT', taskId: task.taskId, observedAt: clock(), reasons: closure.reasonCodes });
          await persist(tx, state);
          return zero({ ok: false, status: 'CROWN_PAGE_FAULT_QUEUED', reasons: closure.reasonCodes, providerCallsPerformed: 0 });
        }
        const output = renderClosedClaims({ artifact, closure, context, now: clock() });
        if (task.request && !cacheHit?.ok && task.request.freshnessClass !== 'LIVE') state.cache = putExactResponse(state.cache, { request: task.request, artifact, closure, createdAt: clock(), ttlMs: task.cacheTtlMs ?? 300000 });
        const existing = state.capital[closure.artifactHash];
        state.capital[closure.artifactHash] = existing ?? { assetId: closure.artifactHash, artifact,
          authorityIds: closure.authorityIds, originatingModel: null, crownRevision: context.crownRevision,
          qualityType: 'EXACT_TYPED_CLOSURE_UNDER_ADMITTED_RECORDS', scope: context.scope, dependencies: context.sourceHashes,
          invalidators: Object.keys(context.invalidators), failures: 0, driftEvents: 0, currentValue: null, halfLife: null,
          createdAt: clock(), creationCostMicrousd: null,
          maintenanceCostMicrousd: null, revalidationCostMicrousd: null, tasksServed: [],
          crownCallsAvoided: null, referenceCostAvoidedMicrousd: null,
          status: 'VALID_FOR_CURRENT_TYPED_SCOPE', lastValidatedAt: clock() };
        const asset = state.capital[closure.artifactHash];
        asset.lastValidatedAt = clock();
        if (!asset.tasksServed.includes(task.taskId)) asset.tasksServed.push(task.taskId);
        state.tasks[task.taskId] = { taskHash, status: 'CLOSED', artifactHash: closure.artifactHash };
        if (state.debts[task.taskId]) state.debts[task.taskId].status = 'SETTLED';
        const executionClass = cacheHit?.ok ? 'E0' : artifact.nodes.some(n => n.kind === 'CIRCUIT') ? 'E4' : artifact.nodes.some(n => n.kind === 'DERIVATION') ? 'E1' : artifact.nodes.some(n => n.kind === 'CROWN') ? 'DIRECT_CURRENT_CROWN' : 'REALITY_SETTLED_EXACT_RESULT';
        if (prior?.status !== 'CLOSED') {
          state.receipts.push({ kind: 'TASK_COMPLETION', taskId: task.taskId,
            closureVerified: true, executionClass, observedAt: clock(),
            artifactHash: closure.artifactHash, pairedRequiredRegressions: null });
          if (['E0','E1','E2','E3','E4'].includes(executionClass) && typeof referenceContractResolver === 'function') {
            const reference = await referenceContractResolver({ task: structuredClone(task), context: structuredClone(context), closure: structuredClone(closure), output: structuredClone(output), executionClass });
            if (reference?.ok === true && reference.directReference && reference.referenceContractHash) {
              state.proofLedger = appendProvableExecution(state.proofLedger, {
                executionId: semanticHash({ taskId: task.taskId, taskHash, artifactHash: closure.artifactHash, executionClass }),
                taskId: task.taskId, completedAt: new Date(clock()).toISOString(), equivalenceClass: executionClass,
                proofVerified: true, matchedObligationHash: 'sha256:' + semanticHash(task.obligation ?? task.request ?? task),
                qualityContractHash: 'sha256:' + context.qualityContractHash, proofRef: 'semantic-closure:' + closure.artifactHash,
                referenceContractHash: reference.referenceContractHash, directReference: reference.directReference
              });
              state.receipts.push({ kind: 'PROVABLE_EXECUTION', taskId: task.taskId, executionClass, referenceContractHash: reference.referenceContractHash, observedAt: clock() });
            } else state.receipts.push({ kind: 'REFERENCE_CONTRACT_MISSING', taskId: task.taskId, executionClass, observedAt: clock() });
          }
        }
        await persist(tx, state);
        return zero({ ok: true, status: 'CLOSED_TYPED_ARTIFACT', output, artifactHash: closure.artifactHash,
          cacheStatus: cacheHit?.status ?? 'NOT_REQUESTED', providerCallsPerformed: 0,
          unrestrictedProseCertified: false });
      });
    },
    async demandPlan() {
      return transact(store, async tx => {
        const state = await stateFor(tx);
        const pending = Object.values(state.debts).filter(d => d.status !== 'SETTLED' && d.context);
        const plan = coalesceSemanticProofCuts(pending);
        const cuts=plan.cuts.map(c=>({...c,
          thoughtBondAuthorityId:thoughtBondAuthorityId(thoughtBondSlotHash({obligation:c.obligation,context:c.context})),
          thoughtBondPresent:Boolean(state.thoughtBonds[c.cutHash])
        }));
        return zero({ ...plan,cuts, unconnectedDebtCount: Object.values(state.debts).filter(d => !d.context && d.status !== 'SETTLED').length });
      });
    },
    async snapshot() {
      return transact(store, async tx => {
        const state = await stateFor(tx);
        return zero({ schemaVersion: state.schemaVersion, version: state.version,
          budget: cognitionBudgetSummary(state.ledger, today()), metrics: cognitionMetrics(state.receipts),
          taskCount: Object.keys(state.tasks).length, pendingDebts: Object.values(state.debts).filter(d => d.status !== 'SETTLED').length,
          capitalAssets: Object.keys(state.capital).length, thoughtBondCount:Object.keys(state.thoughtBonds).length,
          decisionFranchiseCount:Object.keys(state.decisionFranchises).length,
          paidConnected: Boolean(paidExecutor && paidAuthorization),
          providerCallsPerformedBySnapshot: 0 });
      });
    },
    async provableEconomics(actualAllInMicrousd) {
      return transact(store, async tx => {
        const state = await stateFor(tx);
        return zero(summarizeProvableExecutions({ ledger: state.proofLedger, actualAllInMicrousd }));
      });
    },
    async admitThoughtBond(bond) {
      const verified=verifyFrontierThoughtBond({bond,now:clock()});
      if(!verified.ok)return zero({...verified,providerCallsPerformed:0});
      return transact(store,async tx=>{
        const state=await stateFor(tx),existing=state.thoughtBonds[verified.cutHash];
        if(existing && existing.bondHash!==bond.bondHash)return zero({ok:false,status:'THOUGHT_BOND_CONFLICT',providerCallsPerformed:0,semanticAuthority:'NONE'});
        state.thoughtBonds[verified.cutHash]=structuredClone(bond);
        if(!existing)state.receipts.push({kind:'FRONTIER_THOUGHT_BOND_ADMITTED',cutHash:verified.cutHash,authorityId:verified.authorityId,observedAt:clock()});
        await persist(tx,state);
        return zero({ok:true,status:existing?'IDEMPOTENT_THOUGHT_BOND_ADMISSION':'FRONTIER_THOUGHT_BOND_ADMITTED',
          cutHash:verified.cutHash,authorityId:verified.authorityId,providerCallsPerformed:0,
          semanticAuthority:'CURRENT_TASK_CLASS_CROWN_BOUND_TO_EXACT_CUT'});
      });
    },
    async admitExhaustiveDecisionFranchise(bundle) {
      safePayload(bundle);
      const certified=certifyExhaustiveCrownDecisionFranchise({...bundle,now:clock()});
      if(!certified.ok)return zero({...certified,providerCallsPerformed:0});
      return transact(store,async tx=>{
        const state=await stateFor(tx);
        const id=certified.record.id, existing=state.decisionFranchises[id];
        if(existing){
          if(existing.trustPin!==certified.trustPin || semanticHash(existing.record)!==semanticHash(certified.record)){
            return zero({ok:false,status:'DECISION_FRANCHISE_VAULT_CONFLICT',franchiseId:id,providerCallsPerformed:0,semanticAuthority:'NONE'});
          }
          return zero({ok:true,status:'IDEMPOTENT_DECISION_FRANCHISE_ADMISSION',franchiseId:id,trustPin:certified.trustPin,providerCallsPerformed:0,semanticAuthority:'CERTIFIED_BOUNDED_POLICY'});
        }
        state.decisionFranchises[id]={record:structuredClone(certified.record),trustPin:certified.trustPin};
        state.receipts.push({kind:'DECISION_FRANCHISE_ADMITTED',franchiseId:id,trustPin:certified.trustPin,
          observedStateCount:certified.observedStateCount,proofClass:certified.proofClass,observedAt:clock(),providerCallsPerformed:0});
        await persist(tx,state);
        return zero({ok:true,status:'DECISION_FRANCHISE_ADMITTED',franchiseId:id,trustPin:certified.trustPin,
          observedStateCount:certified.observedStateCount,proofClass:certified.proofClass,
          providerCallsPerformed:0,semanticAuthority:'CERTIFIED_BOUNDED_POLICY'});
      });
    },
    async listDecisionFranchises() {
      return transact(store,async tx=>{
        const state=await stateFor(tx);
        const rows=Object.values(state.decisionFranchises).map(({record,trustPin})=>({
          id:record.id,taskClass:record.spec?.taskClass??null,qualityContractHash:record.spec?.qualityContractHash??null,
          proofClass:record.proofClass,expiresAt:record.expiresAt,crownRevision:record.crownRevision,
          observedStateCount:record.certification?.observedStateCount??null,trustPin
        }));
        return zero({ok:true,status:'DECISION_FRANCHISE_VAULT',count:rows.length,franchises:rows,providerCallsPerformed:0});
      });
    },
    async preparePaidCall(request) {
      safePayload(request);
      return transact(store, async tx => {
        const state = await stateFor(tx);
        const routes = paidAuthorization?.crownRoutes ?? [];
        if (request.role === 'CROWN' && !routes.includes(request.provider + ':' + request.model)) return zero({ ok: false, status: 'ADMITTED_CROWN_ROUTE_REQUIRED', providerCallsPerformed: 0 });
        const reservation = reserveCognitionCall(state.ledger, request, today());
        if (reservation.ok) { state.ledger = reservation.ledger; await persist(tx, state); }
        return zero({ ok: reservation.ok, status: reservation.status, providerCallsPerformed: 0 });
      });
    },
    async dispatchPaidCall(callId, payload) {
      if (!paidAuthorization?.evidenceRef || paidAuthorization.month !== today().slice(0, 7) || paidAuthorization.maxMonthlyMicrousd !== paidMonthlyCapMicrousd || paidMonthlyCapMicrousd > 20_000_000 || !Number.isFinite(Date.parse(paidAuthorization.expiresAt)) || Date.parse(paidAuthorization.expiresAt) <= clock() || typeof paidExecutor !== 'function') return zero({ ok: false, status: 'EXPLICIT_PAID_RUNTIME_AUTHORITY_REQUIRED', providerCallsPerformed: 0 });
      safePayload(payload);
      const call = await transact(store, async tx => {
        const state = await stateFor(tx);
        const reserved = state.ledger.calls.find(c => c.callId === callId);
        if ((reserved?.role === 'CROWN') !== (paidAuthorization.crownRoutes ?? []).includes(reserved?.provider + ':' + reserved?.model)) throw new Error('paid-role-route-mismatch');
        if (!reserved || reserved.status !== 'RESERVED') throw new Error('undispatched-call-required');
        const route = routePrices.find(r => r.model === reserved.model && r.provider === reserved.provider);
        if (Buffer.byteLength(JSON.stringify(payload)) > 300000 || !Number.isSafeInteger(payload.maxTokens) || payload.maxTokens < 1 ||
            !Number.isSafeInteger(payload.inputTokenCeiling) || payload.inputTokenCeiling < 1 || payload.inputTokenCeiling > 300000) throw new Error('bounded-paid-payload-required');
        const ceiling = estimateCognitionCeiling({ route, inputTokens: payload.inputTokenCeiling, maxOutputTokens: payload.maxTokens, now: clock(), overheadRate: platformFeeRate });
        if (ceiling > reserved.ceilingMicrousd) throw new Error('fresh-price-reservation-too-small');
        if (payload.model !== reserved.model || payload.task?.taskId !== reserved.taskId || !Number.isSafeInteger(payload.costCeilingCents) || payload.costCeilingCents < 1 || payload.costCeilingCents * 10000 > reserved.ceilingMicrousd) throw new Error('exact-dispatch-reservation-binding-required');
        state.ledger = markCognitionDispatched(state.ledger, callId, today());
        if (reserved.role === 'CROWN') state.receipts.push({kind: 'CROWN_DISPATCH',callId,observedAt:clock()});
        await persist(tx, state);
        return reserved;
      });
      // The durable dispatch marker precedes network effects. A crash or uncertain
      // outcome retains the reservation and refuses automatic retries.
      let response;
      try { response = await paidExecutor(payload); }
      catch { return zero({ ok: false, status: 'DISPATCH_UNCERTAIN_RECONCILIATION_REQUIRED', providerCallsPerformed: 1 }); }
      if (response?.usage?.costBasis !== 'OPENROUTER_USAGE_COST_OBSERVED' || typeof response.usage.costUsd !== 'number' || !Number.isFinite(response.usage.costUsd) || response.usage.costUsd < 0 || !response.providerRequestId) return zero({ ok: false, status: 'OBSERVED_BILL_REQUIRED_RESERVATION_HELD', providerCallsPerformed: 1 });
      const settlement = await this.reconcileCall({ callId, actualMicrousd: Math.ceil(response.usage.costUsd * 1e6), receiptRef: response.providerRequestId,
        observedModel: response.observedModel, observedProvider: response.provider });
      const observedCostMicrousd = Math.ceil(response.usage.costUsd * 1e6);
      return { ...settlement, status: settlement.ok ? 'PAID_PROPOSAL_RECEIVED_NOT_SEMANTIC_AUTHORITY' : settlement.status,
        proposal: response.ok && settlement.ok ? response.result : null,
        semanticAuthority: 'NONE', providerCallsPerformed: 1, requestedModel: call.model,
        observedModel: response.observedModel ?? null, observedModelRevision: response.observedModelRevision ?? null,
        observedProvider: response.provider ?? null, upstreamProvider: response.upstreamProvider ?? null,
        providerRequestId: response.providerRequestId, observedCostMicrousd,
        generationReceipt: response.generationReceipt ? structuredClone(response.generationReceipt) : null,
        usage: structuredClone(response.usage) };
    },
    async reconcileCall(receipt) {
      safePayload(receipt);
      return transact(store, async tx => {
        const state = await stateFor(tx);
        const month = receipt.month ?? state.ledger.month;
        const ledger = month === state.ledger.month ? state.ledger : state.archivedLedgers?.[month];
        if (!ledger) throw new Error('known-reconciliation-month-required');
        const settlementDate = month === state.ledger.month ? today() : receipt.settledDate;
        if (typeof settlementDate !== 'string' || settlementDate.slice(0,7) !== month) throw new Error('observed-reconciliation-date-required');
        const settled = settleCognitionCall(ledger, receipt, settlementDate);
        if (month === state.ledger.month) state.ledger = settled.ledger;
        else {
          state.archivedLedgers[month] = settled.ledger;
          if (Object.values(state.archivedLedgers).every(l => !l.incidents.length && !l.calls.some(c => ['RESERVED','DISPATCHED'].includes(c.status)))) state.ledger.incidents = state.ledger.incidents.filter(i => i.reason !== 'HISTORICAL_RECONCILIATION_REQUIRED');
        }
        if (settled.status !== 'IDEMPOTENT_SETTLEMENT') state.receipts.push({ kind: 'COST', basis: 'OBSERVED_PROVIDER_ONLY', actualMicrousd: receipt.actualMicrousd, receiptRef: receipt.receiptRef });
        await persist(tx, state);
        return { ok: settled.ok, status: settled.status, businessEffectAuthority: 'NONE', semanticAuthority: 'NONE' };
      });
    }
  };
}

export function createInfiniteOpusJobHandlers(options) {
  const runtime = createInfiniteOpusRuntime(options);
  return {
    'cognition.infinite-opus.execute': task => runtime.execute(task),
    'cognition.infinite-opus.demand': () => runtime.demandPlan(),
    'cognition.infinite-opus.snapshot': () => runtime.snapshot()
  };
}
