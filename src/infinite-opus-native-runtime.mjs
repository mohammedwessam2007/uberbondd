import { createSemanticClosureChecker, semanticHash, renderClosedClaims,
  coalesceSemanticProofCuts, validateSemanticContext } from './semantic-closure-kernel.mjs';
import { createCognitionLedger, createExactResponseCache, readExactResponse, putExactResponse,
  exactRequestFingerprint, reserveCognitionCall, markCognitionDispatched,
  settleCognitionCall, estimateCognitionCeiling, cognitionBudgetSummary, cognitionMetrics } from './cognition-ledger.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { redactSecrets } from './secret-patterns.mjs';
import { createProvableExecutionLedger, appendProvableExecution, summarizeProvableExecutions } from './provable-execution-ledger.mjs';

export const INFINITE_OPUS_TASK_SCHEMA = 'uberbond.infinite-opus.task.v1';
const SETTING = 'infiniteOpusRuntimeV1';
const identity = value => typeof value === 'string' && /^[a-zA-Z0-9_.:/-]{1,240}$/.test(value);
const sha256Ref = value => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value);
const nonnegativeInt = value => Number.isSafeInteger(value) && value >= 0;
const boundedText = (value,max=240) => typeof value === 'string' && value.length > 0 && value.length <= max;
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

export function createInfiniteOpusRuntime({ store, contextLoader, authorityRecords = [],
  clock = Date.now, paidExecutor = null, paidAuthorization = null, routePrices = [], platformFeeRate = 0.055, referenceContractResolver = null } = {}) {
  const paidMonthlyCapMicrousd = paidAuthorization?.maxMonthlyMicrousd ?? 20_000_000;
  if (!Number.isSafeInteger(paidMonthlyCapMicrousd) || paidMonthlyCapMicrousd < 15_000_000 || paidMonthlyCapMicrousd > 20_000_000 && paidAuthorization) throw new Error('paid-runtime-cap-must-fit-20-dollar-key-and-15-dollar-crown-reserve');
  routePrices = structuredClone(routePrices);
  paidAuthorization = paidAuthorization ? structuredClone(paidAuthorization) : null;
  const checkClosure = createSemanticClosureChecker({ authorityRecords });
  const today = () => new Date(clock()).toISOString().slice(0, 10);
  async function stateFor(tx) {
    const settings = await tx.getSettings();
    const state = settings[SETTING] ?? {
      schemaVersion: INFINITE_OPUS_TASK_SCHEMA, version: 0,
      ledger: createCognitionLedger({ month: today().slice(0, 7), monthlyCapMicrousd: paidMonthlyCapMicrousd }),
      cache: createExactResponseCache(), tasks: {}, debts: {}, capital: {}, crownInteractions: {}, crownInteractionReceipts: {},
      crownInteractionReceiptPeriod: today().slice(0, 7), crownInteractionReceiptArchives: [],
      negativeKnowledge: [], receipts: [], proofLedger: createProvableExecutionLedger({ period: today().slice(0, 7) })
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
    state.crownInteractions ??= {};
    state.crownInteractionReceipts ??= {};
    state.crownInteractionReceiptArchives ??= [];
    state.crownInteractionReceiptPeriod ??= today().slice(0, 7);
    if (state.crownInteractionReceiptPeriod !== today().slice(0, 7)) {
      const ids = Object.keys(state.crownInteractionReceipts).sort();
      state.crownInteractionReceiptArchives.push({
        period: state.crownInteractionReceiptPeriod,
        receiptCount: ids.length,
        receiptSetDigest: 'sha256:' + semanticHash(ids),
        compactedAt: clock(),
        truthBoundary: 'Individual recurrence receipts are redundant dedupe witnesses; provider request IDs/costs remain in cognition ledgers while recurrence/output/cost aggregates remain in crownInteractions.'
      });
      if (state.crownInteractionReceiptArchives.length > 120) throw new Error('crown-recurrence-archive-checkpoint-required');
      state.crownInteractionReceipts = {};
      state.crownInteractionReceiptPeriod = today().slice(0, 7);
    }
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
        if (prior && prior.taskHash !== taskHash) throw new Error('task-idempotency-contradiction');
        if (Object.keys(state.tasks).length >= 10000 && !prior) throw new Error('archive-checkpoint-required-before-capacity-growth');
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
    async recordCrownInteraction(record) {
      safePayload(record);
      if (!sha256Ref(record?.requestFingerprint) || !sha256Ref(record?.finalOutputHash) ||
          !sha256Ref(record?.crownAdmissionReceiptHash) || !boundedText(record?.crownProviderRequestId, 512) ||
          !boundedText(record?.observedUpstreamProvider, 240) || !boundedText(record?.authorityClass, 120) ||
          !nonnegativeInt(record?.builderCostMicrousd) || !nonnegativeInt(record?.crownCostMicrousd) ||
          record.sideEffectAuthority !== 'NONE') throw new Error('bounded-crown-interaction-receipt-required');
      const interactionId = 'sha256:' + semanticHash({
        requestFingerprint: record.requestFingerprint,
        finalOutputHash: record.finalOutputHash,
        crownAdmissionReceiptHash: record.crownAdmissionReceiptHash,
        crownProviderRequestId: record.crownProviderRequestId
      });
      return transact(store, async tx => {
        const state = await stateFor(tx);
        if (state.crownInteractionReceipts[interactionId]) {
          const existing = state.crownInteractions[record.requestFingerprint];
          return zero({ ok: true, status: 'IDEMPOTENT_CROWN_INTERACTION_RECORD',
            interactionId, recurrence: existing ? structuredClone(existing.summary) : null,
            semanticReuseAuthority: 'NONE', providerCallsPerformed: 0 });
        }
        if (Object.keys(state.crownInteractionReceipts).length >= 20000) throw new Error('current-period-crown-interaction-dedupe-cap-reached');
        const totalCostMicrousd = record.builderCostMicrousd + record.crownCostMicrousd;
        const entry = state.crownInteractions[record.requestFingerprint] ?? {
          requestFingerprint: record.requestFingerprint,
          occurrences: 0,
          outputCounts: {},
          totalObservedCostMicrousd: 0,
          firstObservedCostMicrousd: totalCostMicrousd,
          firstSeenAt: clock(),
          lastSeenAt: clock(),
          latestAuthorityClass: record.authorityClass,
          latestCrownAdmissionReceiptHash: record.crownAdmissionReceiptHash,
          latestObservedUpstreamProvider: record.observedUpstreamProvider,
          latestCrownProviderRequestId: record.crownProviderRequestId,
          summary: null
        };
        entry.occurrences += 1;
        entry.outputCounts[record.finalOutputHash] = (entry.outputCounts[record.finalOutputHash] ?? 0) + 1;
        entry.totalObservedCostMicrousd += totalCostMicrousd;
        entry.lastSeenAt = clock();
        entry.latestAuthorityClass = record.authorityClass;
        entry.latestCrownAdmissionReceiptHash = record.crownAdmissionReceiptHash;
        entry.latestObservedUpstreamProvider = record.observedUpstreamProvider;
        entry.latestCrownProviderRequestId = record.crownProviderRequestId;
        const distinctOutputCount = Object.keys(entry.outputCounts).length;
        const repeatedFrontierCostMicrousd = Math.max(0, entry.totalObservedCostMicrousd - entry.firstObservedCostMicrousd);
        const status = entry.occurrences < 2 ? 'SINGLETON_CROWN_INTERACTION_SHADOW'
          : distinctOutputCount === 1 ? 'RECURRENT_EXACT_OUTPUT_SHADOW_COMPILER_CANDIDATE'
          : 'RECURRENT_DIVERGENT_OUTPUT_SHADOW_REQUIRES_RECONCILIATION';
        entry.summary = {
          status,
          occurrences: entry.occurrences,
          distinctOutputCount,
          totalObservedCostMicrousd: entry.totalObservedCostMicrousd,
          repeatedFrontierCostMicrousd,
          compilerPriorityMicrousd: repeatedFrontierCostMicrousd,
          semanticReuseAuthority: 'NONE',
          rawConversationPersisted: false
        };
        state.crownInteractions[record.requestFingerprint] = entry;
        state.crownInteractionReceipts[interactionId] = {
          interactionId,
          requestFingerprint: record.requestFingerprint,
          finalOutputHash: record.finalOutputHash,
          crownAdmissionReceiptHash: record.crownAdmissionReceiptHash,
          crownProviderRequestId: record.crownProviderRequestId,
          observedUpstreamProvider: record.observedUpstreamProvider,
          authorityClass: record.authorityClass,
          builderCostMicrousd: record.builderCostMicrousd,
          crownCostMicrousd: record.crownCostMicrousd,
          observedAt: clock(),
          sideEffectAuthority: 'NONE'
        };
        state.receipts.push({ kind: 'CROWN_CALL', callId: record.crownProviderRequestId,
          semanticReusableStructure: false, requestFingerprint: record.requestFingerprint,
          observedAt: clock(), semanticAuthority: record.authorityClass });
        state.receipts.push({ kind: 'CROWN_INTERACTION_OBSERVED', interactionId,
          requestFingerprint: record.requestFingerprint, status, occurrences: entry.occurrences,
          distinctOutputCount, repeatedFrontierCostMicrousd, observedAt: clock(),
          semanticReuseAuthority: 'NONE', rawConversationPersisted: false });
        await persist(tx, state);
        return zero({ ok: true, status, interactionId, recurrence: structuredClone(entry.summary),
          semanticReuseAuthority: 'NONE', providerCallsPerformed: 0 });
      });
    },
    async crownCapitalizationPlan({ limit = 50 } = {}) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) throw new Error('bounded-capitalization-plan-limit-required');
      return transact(store, async tx => {
        const state = await stateFor(tx);
        const candidates = Object.values(state.crownInteractions)
          .filter(row => row?.summary?.occurrences >= 2)
          .map(row => ({
            requestFingerprint: row.requestFingerprint,
            status: row.summary.status,
            occurrences: row.summary.occurrences,
            distinctOutputCount: row.summary.distinctOutputCount,
            totalObservedCostMicrousd: row.summary.totalObservedCostMicrousd,
            repeatedFrontierCostMicrousd: row.summary.repeatedFrontierCostMicrousd,
            compilerPriorityMicrousd: row.summary.compilerPriorityMicrousd,
            latestAuthorityClass: row.latestAuthorityClass,
            latestCrownAdmissionReceiptHash: row.latestCrownAdmissionReceiptHash,
            latestObservedUpstreamProvider: row.latestObservedUpstreamProvider,
            rawConversationPersisted: false,
            semanticReuseAuthority: 'NONE'
          }))
          .sort((a,b) => b.compilerPriorityMicrousd - a.compilerPriorityMicrousd || b.occurrences - a.occurrences)
          .slice(0, limit);
        return zero({ ok: true, status: 'CROWN_CAPITALIZATION_SHADOW_PLAN',
          candidates, candidateCount: candidates.length, providerCallsPerformed: 0,
          semanticReuseAuthority: 'NONE',
          truthBoundary: 'Recurrence and repeated frontier cost identify compiler targets only. No candidate may execute as semantic authority until it is separately typed, verified and promoted through E0-E4/Crown closure.' });
      });
    },
    async demandPlan() {
      return transact(store, async tx => {
        const state = await stateFor(tx);
        const pending = Object.values(state.debts).filter(d => d.status !== 'SETTLED' && d.context);
        const plan = coalesceSemanticProofCuts(pending);
        return zero({ ...plan, unconnectedDebtCount: Object.values(state.debts).filter(d => !d.context && d.status !== 'SETTLED').length });
      });
    },
    async snapshot() {
      return transact(store, async tx => {
        const state = await stateFor(tx);
        return zero({ schemaVersion: state.schemaVersion, version: state.version,
          budget: cognitionBudgetSummary(state.ledger, today()), metrics: cognitionMetrics(state.receipts),
          taskCount: Object.keys(state.tasks).length, pendingDebts: Object.values(state.debts).filter(d => d.status !== 'SETTLED').length,
          capitalAssets: Object.keys(state.capital).length,
          crownInteractionFingerprints: Object.keys(state.crownInteractions).length,
          recurrentCrownCompilerCandidates: Object.values(state.crownInteractions).filter(row => row?.summary?.occurrences >= 2).length,
          crownInteractionCurrentPeriodReceipts: Object.keys(state.crownInteractionReceipts).length,
          crownInteractionReceiptArchivePeriods: state.crownInteractionReceiptArchives.length,
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
        observedModel: response.observedModel ?? null, observedProvider: response.provider ?? null,
        upstreamProvider: response.upstreamProvider ?? null,
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
