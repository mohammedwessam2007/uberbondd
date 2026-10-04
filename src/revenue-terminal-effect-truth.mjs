import { terminalReadinessFromStore } from './revenue-singularity-service.mjs';

const asArray = value => Array.isArray(value) ? value : [];
const asObject = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};

export function compileProspectEffectTruth({ settings = {}, outboundEvents = [], settingsReadable = true, eventsReadable = true } = {}) {
  if (!settingsReadable || !eventsReadable) {
    return {
      state: 'CHECK_FAILED',
      prospectMessagePerformed: null,
      providerBoundaryCrossed: null,
      frozenExecutionClaims: null,
      frozenProviderCallAttemptClaims: null,
      frozenAcceptedResults: null,
      frozenRejectedResults: null,
      frozenUnknownResults: null,
      unresolvedDispatchClaims: null,
      confirmedSentEvents: null,
      uncertainSendEvents: null,
      automaticRetryAuthorized: null,
      truthBoundary: 'Unread effect ledgers never become a zero-effect claim.'
    };
  }

  const executions = Object.entries(asObject(settings))
    .filter(([key, value]) => key.startsWith('frozenProspectExecution:') && value && typeof value === 'object' && !Array.isArray(value))
    .map(([, value]) => value);

  let providerCallAttemptClaims = 0;
  let providerBoundaryConfirmed = 0;
  let accepted = 0;
  let rejected = 0;
  let unknown = 0;
  let unresolvedDispatchClaims = 0;
  let retryAuthorized = false;

  for (const execution of executions) {
    if (execution.automaticRetryAuthorized === true || execution?.receipt?.automaticRetryAuthorized === true) retryAuthorized = true;
    if (execution.providerCallAttempted !== true) continue;
    providerCallAttemptClaims += 1;
    const status = String(execution.status || '').trim().toUpperCase();
    const receipt = asObject(execution.receipt);
    const providerAccepted = receipt.providerAccepted;
    const providerClassification = String(receipt?.providerError?.classification || '').trim().toUpperCase();
    const receiptProviderCalls = Number(receipt?.effectLedger?.providerCalls || 0);

    if (providerAccepted === true || status === 'SENT' || status === 'PROVIDER_ACCEPTED_CHECKPOINTED') {
      accepted += 1;
      providerBoundaryConfirmed += 1;
    } else if (status === 'UNCERTAIN' || status === 'PROVIDER_UNCERTAIN_CHECKPOINTED' || providerClassification === 'UNCERTAIN') {
      unknown += 1;
      if (receiptProviderCalls > 0) providerBoundaryConfirmed += 1;
    } else if (providerAccepted === false && providerClassification === 'REJECTED') {
      rejected += 1;
      if (receiptProviderCalls > 0) providerBoundaryConfirmed += 1;
    } else if (status === 'PROVIDER_REJECTED' || status === 'PROVIDER_REJECTED_CHECKPOINTED') {
      rejected += 1;
      if (receiptProviderCalls > 0) providerBoundaryConfirmed += 1;
    } else {
      // Historical DISPATCHING claims set providerCallAttempted before invoking
      // SMTP. Without a post-provider receipt/event they prove an unresolved
      // effect claim, not that the network/provider boundary was crossed.
      unknown += 1;
      unresolvedDispatchClaims += 1;
    }
  }

  const events = asArray(outboundEvents);
  const confirmedSentEvents = events.filter(event => String(event?.eventType || '').toLowerCase() === 'sent').length;
  const uncertainSendEvents = events.filter(event => String(event?.eventType || '').toLowerCase() === 'send_uncertain').length;

  let state = 'NO_DURABLE_MESSAGE_EFFECT_OBSERVED';
  let prospectMessagePerformed = false;
  if (unknown > 0 || uncertainSendEvents > 0) {
    state = 'CUSTOMER_MESSAGE_EFFECT_UNKNOWN';
    prospectMessagePerformed = null;
  } else if (accepted > 0 || confirmedSentEvents > 0) {
    state = 'CONFIRMED_MESSAGE_EFFECT';
    prospectMessagePerformed = true;
  } else if (providerCallAttemptClaims > 0 && rejected === providerCallAttemptClaims) {
    state = 'PROVIDER_REJECTED_NO_MESSAGE_CONFIRMED';
    prospectMessagePerformed = false;
  }

  const providerBoundaryCrossed = providerBoundaryConfirmed > 0
    ? true
    : providerCallAttemptClaims > 0
      ? null
      : false;

  return {
    state,
    prospectMessagePerformed,
    providerBoundaryCrossed,
    frozenExecutionClaims: executions.length,
    frozenProviderCallAttemptClaims: providerCallAttemptClaims,
    frozenAcceptedResults: accepted,
    frozenRejectedResults: rejected,
    frozenUnknownResults: unknown,
    unresolvedDispatchClaims,
    confirmedSentEvents,
    uncertainSendEvents,
    automaticRetryAuthorized: retryAuthorized,
    truthBoundary: unknown > 0 || uncertainSendEvents > 0
      ? 'An unresolved effect must not be coerced into false or true. A pre-dispatch providerCallAttempted claim alone does not prove provider boundary crossing; reconcile from stronger evidence and never replay merely to learn the outcome.'
      : 'Confirmed sends come only from durable sent events or accepted frozen-effect receipts.'
  };
}

export async function terminalReadinessWithEffectTruth(store, env = process.env, preflightContext = {}) {
  const report = await terminalReadinessFromStore(store, env, preflightContext);
  let settings = {};
  let outboundEvents = [];
  let settingsReadable = true;
  let eventsReadable = true;

  try { settings = await store.getSettings() || {}; }
  catch { settingsReadable = false; }
  try {
    const rows = await store.list('outboundEvents');
    if (Array.isArray(rows)) outboundEvents = rows;
    else eventsReadable = false;
  } catch { eventsReadable = false; }

  const prospectEffectTruth = compileProspectEffectTruth({ settings, outboundEvents, settingsReadable, eventsReadable });
  return {
    ...report,
    prospectMessagePerformed: prospectEffectTruth.prospectMessagePerformed,
    prospectEffectTruth
  };
}
