import { config, validateStartupConfig } from '../src/config.mjs';
import { createStore } from '../src/store.mjs';
import {
  beginAgentMeshCycleReceipt,
  finishAgentMeshCycleReceipt,
  getAgentMeshCycleReceipt,
  reconcileAbandonedAgentMeshCycles
} from '../src/agent-mesh-cycle-receipts.mjs';
import {
  VERCEL_AGENT_MESH_CRON_SCHEDULE,
  authorizeVercelCronRequest,
  deriveVercelDailyOccurrence,
  publicCronResult
} from '../src/agent-mesh-cron-boundary.mjs';
import { createZeroExternalIoCanaryRunner } from '../src/agent-mesh-zero-io-canary.mjs';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };
const COMMIT_RE = /^[a-f0-9]{40}$/i;

const canonicalCanaryRunner = createZeroExternalIoCanaryRunner({
  beginAgentMeshCycleReceipt,
  finishAgentMeshCycleReceipt,
  getAgentMeshCycleReceipt,
  reconcileAbandonedAgentMeshCycles
});

function sendJson(res, status, payload) {
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(status).json(payload);
  }
  res.writeHead(status, {
    ...JSON_HEADERS,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  });
  res.end(JSON.stringify(payload));
  return undefined;
}

function header(req, name) {
  return req?.headers?.[name] ?? req?.headers?.[name.toLowerCase()] ?? '';
}

function refusal(reasonCodes) {
  return publicCronResult({ ok: false, status: 'REFUSED', reasonCodes });
}

export function createHandler(deps = {}) {
  const env = deps.env || process.env;
  const startupConfig = deps.startupConfig || config;
  const validate = deps.validateStartupConfig || validateStartupConfig;
  const storeFactory = deps.createStore || createStore;
  const runCanary = deps.runCanary || canonicalCanaryRunner;
  const now = deps.now || (() => new Date());

  return async function handler(req, res) {
    const authorized = authorizeVercelCronRequest({
      method: req?.method,
      authorizationHeader: header(req, 'authorization'),
      cronSecret: env.CRON_SECRET,
      scheduleHeader: header(req, 'x-vercel-cron-schedule'),
      expectedSchedule: VERCEL_AGENT_MESH_CRON_SCHEDULE
    });
    if (!authorized.ok) {
      return sendJson(res, authorized.httpStatus, publicCronResult(authorized));
    }

    const sourceCommit = String(env.VERCEL_GIT_COMMIT_SHA || '').trim();
    if (!COMMIT_RE.test(sourceCommit)) {
      return sendJson(res, 503, refusal(['vercel-source-commit-not-configured']));
    }

    const date = now();
    const occurrence = deriveVercelDailyOccurrence({
      scheduleHeader: authorized.schedule,
      expectedSchedule: VERCEL_AGENT_MESH_CRON_SCHEDULE,
      date
    });
    if (!occurrence.ok) {
      return sendJson(res, occurrence.httpStatus || 400, publicCronResult(occurrence));
    }

    try {
      validate(startupConfig);
    } catch {
      return sendJson(res, 503, refusal(['store-runtime-not-configured']));
    }

    let store;
    try {
      store = storeFactory(startupConfig);
      const result = await runCanary({
        store,
        schedulerOccurrenceKey: occurrence.occurrenceKey,
        sourceCommit,
        date
      });
      const publicResult = publicCronResult({
        ...result,
        occurrenceKey: occurrence.occurrenceKey,
        permittedMode: 'ZERO_EXTERNAL_IO_CANARY',
        workersConfigured: 0,
        workersWithheld: 0
      });
      return sendJson(res, result.ok ? 200 : 409, publicResult);
    } catch {
      return sendJson(res, 500, refusal(['zero-io-canary-runtime-failed']));
    } finally {
      if (store && typeof store.close === 'function') {
        try { await store.close(); } catch { /* closing cannot change the response truth */ }
      }
    }
  };
}

export default createHandler();
