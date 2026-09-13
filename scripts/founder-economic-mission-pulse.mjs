#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../src/config.mjs';
import { createStore } from '../src/store.mjs';
import { DurableQueue } from '../src/queue.mjs';
import {
  compileFounderEconomicPulsePlan,
  evaluateFounderOutcomeMission
} from '../src/founder-outcome-mission.mjs';
import { runEconomicReliabilityControlLoop } from '../src/economic-reliability-control-loop.mjs';
import { compileEconomicReliabilityInput } from '../src/economic-reliability-input-builder.mjs';

const CONTROL_DIR = path.resolve(process.env.UBERBOND_CONTROL_DIR || '/var/lib/uberbond-control');
const MISSION_DIR = path.join(CONTROL_DIR, 'founder-missions');
const ACTIVE_PATH = path.join(MISSION_DIR, 'active.json');
const AUTHORITY_PATH = path.join(MISSION_DIR, 'authority.json');
const RECEIPT_PATH = path.join(MISSION_DIR, 'latest-pulse.json');
const RELIABILITY_INPUT_PATH = path.join(MISSION_DIR, 'economic-reliability-input.json');
const RELIABILITY_ROUTE_STATE_PATH = path.join(MISSION_DIR, 'economic-route-state.json');
const ECONOMIC_TRIALS_PATH = path.join(MISSION_DIR, 'economic-trials.json');
const RELIABILITY_RECEIPT_PATH = path.join(MISSION_DIR, 'economic-reliability-latest.json');
const MAX_BYTES = 1_000_000;
const MAX_RELIABILITY_ACTIONS_IN_RECEIPT = 64;

async function readJson(file) {
  try {
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BYTES) return null;
    const value = JSON.parse(await fs.readFile(file, 'utf8'));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch { return null; }
}

async function atomicJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.tmp.${process.pid}`;
  await fs.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await fs.chmod(tmp, 0o600);
  await fs.rename(tmp, file);
}

function authorityForPulse(value) {
  if (!value || value.status !== 'ACTIVE') return null;
  return {
    current: value.current === true,
    channel: String(value.channel || '').trim(),
    audience: String(value.audience || '').trim(),
    senderHealthVerified: value.senderHealthVerified === true,
    suppressionRecheckRequired: value.suppressionRecheckRequired === true,
    authorityRef: String(value.authorityRef || '').trim()
  };
}

function arrayField(value, key) {
  return Array.isArray(value?.[key]) ? value[key] : [];
}

export function compileReliabilityPulse({ mission, input, now }) {
  const result = runEconomicReliabilityControlLoop({
    activeRoutes: Array.isArray(input?.activeRoutes) ? input.activeRoutes : [],
    candidateRoutes: Array.isArray(input?.candidateRoutes) ? input.candidateRoutes : [],
    trials: Array.isArray(input?.trials) ? input.trials : [],
    maxAdditions: Number.isSafeInteger(input?.maxAdditions) && input.maxAdditions >= 0 ? input.maxAdditions : 32,
    now
  });
  const allActions = Array.isArray(result.nextActions) ? result.nextActions : [];
  return {
    ok: true,
    schemaVersion: 'uberbond.founder-economic-reliability-pulse.v1.1',
    status: result.status,
    missionId: mission.missionId,
    observedAt: now.toISOString(),
    inputSource: input?.inputSource || 'UNKNOWN',
    inputDigest: input?.inputDigest || null,
    catalogRouteCount: Number.isSafeInteger(input?.catalogRouteCount) ? input.catalogRouteCount : null,
    targetReached: result.targetReached,
    targetZeroMoneyProbability: result.reliability.targetZeroMoneyProbability,
    residualZeroProbability: result.reliability.residualZeroProbability,
    successProbability: result.reliability.successProbability,
    independentFailureDomainCount: result.reliability.independentFailureDomainCount,
    nextActionCount: allActions.length,
    nextActions: allActions.slice(0, MAX_RELIABILITY_ACTIONS_IN_RECEIPT),
    nextActionsTruncated: allActions.length > MAX_RELIABILITY_ACTIONS_IN_RECEIPT,
    shortfall: result.shortfall,
    reliabilityReceiptDigest: result.reliability.receiptDigest,
    externalEffectAuthority: 'NONE',
    moneyAuthority: 'NONE',
    truthBoundary: 'This resident receipt exposes the current conservative reliability pressure to the founder mission. Catalog breadth never becomes probability or authority. It cannot create external-effect authority or claim cleared money; provider-origin settlement evidence remains authoritative.'
  };
}

async function resolveReliabilityInput(now) {
  const explicit = await readJson(RELIABILITY_INPUT_PATH);
  if (explicit) return { ...explicit, inputSource:'EXPLICIT_RELIABILITY_INPUT' };

  const routeStateEnvelope = await readJson(RELIABILITY_ROUTE_STATE_PATH);
  const trialsEnvelope = await readJson(ECONOMIC_TRIALS_PATH);
  return {
    ...compileEconomicReliabilityInput({
      date: now,
      routeStates: arrayField(routeStateEnvelope, 'routes'),
      trials: arrayField(trialsEnvelope, 'trials'),
      maxAdditions: 32
    }),
    inputSource:'AUTO_COMMERCIAL_CATALOG'
  };
}

export async function runFounderEconomicMissionPulse({ now = new Date() } = {}) {
  const mission = await readJson(ACTIVE_PATH);
  if (!mission?.ok || mission.state !== 'ACTIVE') {
    const receipt = { ok:true, status:'NO_ACTIVE_FOUNDER_OUTCOME_MISSION', observedAt:now.toISOString(), jobsQueued:[] };
    await atomicJson(RECEIPT_PATH, receipt);
    return receipt;
  }

  const state = evaluateFounderOutcomeMission({ mission, now });
  if (!state.ok) {
    const receipt = { ...state, observedAt:now.toISOString(), jobsQueued:[] };
    await atomicJson(RECEIPT_PATH, receipt);
    return receipt;
  }
  if (state.terminal) {
    const completed = { ...mission, state:'TERMINAL', terminalState:state, completedAt:now.toISOString() };
    await atomicJson(ACTIVE_PATH, completed);
    const receipt = { ok:true, status:state.status, missionId:mission.missionId, terminal:true, observedAt:now.toISOString(), jobsQueued:[], terminalState:state };
    await atomicJson(RECEIPT_PATH, receipt);
    return receipt;
  }

  const reliabilityInput = await resolveReliabilityInput(now);
  const reliability = compileReliabilityPulse({ mission, input: reliabilityInput, now });
  await atomicJson(RELIABILITY_RECEIPT_PATH, reliability);

  const durableAuthority = authorityForPulse(await readJson(AUTHORITY_PATH));
  const zeroMarginalDiscoveryConfigured = String(process.env.UBERBOND_ZERO_MARGINAL_DISCOVERY || '').toLowerCase() === 'true';
  const plan = compileFounderEconomicPulsePlan({
    mission,
    now,
    zeroMarginalDiscoveryConfigured,
    outboundAuthorization: durableAuthority,
    paymentReconciliationAvailable: true
  });
  if (!plan.ok) {
    const receipt = { ...plan, observedAt:now.toISOString(), jobsQueued:[], reliability };
    await atomicJson(RECEIPT_PATH, receipt);
    return receipt;
  }

  let store;
  const jobsQueued = [];
  const jobFailures = [];
  try {
    store = createStore(config);
    await store.init();
    const queue = new DurableQueue(store, config, console);
    const bucket = Math.floor(now.getTime() / 60_000);
    for (const job of plan.jobs) {
      try {
        const queued = await queue.enqueue(job.type, job.payload || {}, {
          maxAttempts: job.type === 'payment.reconciliation.tick' ? 5 : 3,
          dedupeKey: `founder-mission:${mission.missionId}:${job.type}:${bucket}`
        });
        jobsQueued.push({ type:job.type, consequenceClass:job.consequenceClass, queueReceipt:queued || null });
      } catch (error) {
        jobFailures.push({ type:job.type, reason:String(error?.message || error).slice(0,300) });
      }
    }
  } catch (error) {
    jobFailures.push({ type:'queue-bootstrap', reason:String(error?.message || error).slice(0,300) });
  } finally {
    await store?.close?.().catch(() => {});
  }

  const receipt = {
    ok: true,
    schemaVersion: 'uberbond.founder-economic-mission-pulse.v1.2',
    status: jobsQueued.length ? 'FOUNDER_ECONOMIC_MISSION_PULSE_DISPATCHED' : 'FOUNDER_ECONOMIC_MISSION_ACTIVE_EXECUTION_BLOCKED',
    missionId: mission.missionId,
    observedAt: now.toISOString(),
    deadlineAt: mission.deadlineAt,
    terminal: false,
    currentMissionState: state.status,
    jobsPlanned: plan.jobs.map(job => ({ type:job.type, consequenceClass:job.consequenceClass })),
    jobsQueued,
    jobFailures,
    outboundReady: plan.outboundReady,
    reliability,
    reliabilityReceiptPath: RELIABILITY_RECEIPT_PATH,
    reliabilityInputSource: reliability.inputSource,
    truthBoundary: jobsQueued.length
      ? 'Queued jobs are execution attempts, not outcomes. The resident reliability receipt automatically derives commercial candidate breadth when no explicit input exists, but it never mints probability or authority. Provider calls, messages, payments and delivery still require their own receipts. This mission remains active until its deadline or proof-complete admissible-branch exhaustion.'
      : 'The mission remains ACTIVE even though this pulse could not reach the durable economic queue. Reliability shortfall and runtime/configuration failures remain explicit blockers, never a fabricated terminal $0 result.'
  };
  await atomicJson(RECEIPT_PATH, receipt);
  return receipt;
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname;
if (invoked) {
  runFounderEconomicMissionPulse().then(result => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.ok === false) process.exitCode = 2;
  }).catch(error => {
    process.stdout.write(`${JSON.stringify({ ok:false, status:'FOUNDER_ECONOMIC_MISSION_PULSE_CRASH', reasonCodes:[String(error?.message || error).slice(0,300)] }, null, 2)}\n`);
    process.exitCode = 2;
  });
}
