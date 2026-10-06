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
import { promoteOwnerBusinessIdentityFromEnv } from './src/owner-business-identity-runtime.mjs';

validateStartupConfig(config);
if (config.nodeEnv === 'production' && config.processRole !== 'worker') {
  throw new Error('worker.mjs requires PROCESS_ROLE=worker in production');
}

const store = createStore(config);
await store.init();
if (typeof store.deleteExpiredArtifacts === 'function') await store.deleteExpiredArtifacts().catch(error => console.error('Artifact cleanup failed', error));

try {
  const identityPromotion = await promoteOwnerBusinessIdentityFromEnv({ store, env: process.env });
  console.log(`OWNER_IDENTITY_RUNTIME ${JSON.stringify(identityPromotion)}`);
} catch (error) {
  console.error(`OWNER_IDENTITY_RUNTIME_FAILED ${JSON.stringify({ ok:false, errorClass:String(error?.code||error?.name||'error').slice(0,80), piiLogged:false, externalEffects:0, businessEffectAuthority:'NONE' })}`);
}

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