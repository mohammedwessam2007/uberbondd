// Browser controls over the existing canonical read-only operations. The
// credential remains owned by admin.js; this module never receives its value.
export async function inspectProspect({ request, input }) {
  const body = input?.request?.body || input;
  if (body?.frozenEffectDigest) {
    if (Object.keys(body).some(key => key !== 'frozenEffectDigest')) throw new Error('frozen-preflight-accepts-only-digest');
    const result = await request('/api/prospect-preflight', { method: 'POST', body: JSON.stringify(body) });
    return { preflight: { ok: true, result }, classification: result.validation?.valid === true ? 'CLEAN_EXACT_PRODUCTION_HISTORY' : 'FROZEN_EFFECT_INVALID', readOnly: true, sendAuthority: false, externalEffects: 0 };
  }
  if (Object.hasOwn(body || {}, 'executeFrozenEffect')) throw new Error('execution-flag-forbidden-in-read-only-preflight');
  if (!body?.record?.recipient?.email) throw new Error('candidate-record-and-exact-recipient-required');
  const email = String(body.record.recipient.email).trim().toLowerCase();
  const domain = email.slice(email.lastIndexOf('@') + 1);
  const settled = await Promise.allSettled([
    request('/api/prospect-preflight', { method: 'POST', body: JSON.stringify(body) }),
    request(`/api/prospect-preflight/contact-history?email=${encodeURIComponent(email)}&domain=${encodeURIComponent(domain)}`)
  ]);
  const [preflight, history] = settled.map(result => result.status === 'fulfilled'
    ? { ok: true, result: result.value }
    : { ok: false, error: String(result.reason?.message || 'request-failed') });
  const h = history.result;
  const complete = preflight.ok && preflight.result?.contactHistory?.status === 'CLEAN' && preflight.result?.contactHistory?.hit === false && history.ok && h?.status === 'CLEAN' &&
    ['suppressions','prospects','outboundReservations','outboundEvents','replies','messages','providerEvents'].every(key => h.checks?.[key]?.read === true);
  const classification = h?.status === 'HIT' || h?.findings?.length
    ? 'CONTACT_HISTORY_HIT'
    : complete ? 'CLEAN_EXACT_PRODUCTION_HISTORY' : 'PRODUCTION_HISTORY_UNKNOWN';
  return { checkedRecipient: email, checkedDomain: domain, classification, preflight, history, readOnly: body.freezeEffect !== true, sendAuthority: false, externalEffects: 0 };
}

const FROZEN_EFFECT_DIGEST = /^[a-f0-9]{64}$/;

// This is deliberately separate from inspectProspect: the latter remains a
// read-only control. The caller can supply only the request capability and one
// exact digest; the dispatch envelope is fixed here and has no override fields.
export async function executeFrozenProspect(input = {}) {
  const keys = input && typeof input === 'object' && !Array.isArray(input) ? Reflect.ownKeys(input) : [];
  if (keys.length !== 2 || !keys.includes('request') || !keys.includes('digest')) {
    throw new Error('frozen-execution-accepts-only-request-and-digest');
  }
  const { request, digest } = input;
  if (typeof request !== 'function') throw new Error('frozen-execution-request-unavailable');
  if (typeof digest !== 'string' || !FROZEN_EFFECT_DIGEST.test(digest)) {
    throw new Error('frozen-effect-digest-invalid');
  }
  try {
    return await request('/api/prospect-preflight', {
      method: 'POST',
      body: JSON.stringify({ frozenEffectDigest: digest, executeFrozenEffect: true })
    });
  } catch (error) {
    // Preserve canonical structured non-2xx receipts (for example, a 409
    // NOT_SENT result) so the operator can distinguish them from transport
    // uncertainty. Network failures without a response remain unknown.
    if (error && Object.hasOwn(error, 'data')) {
      const data = error.data;
      return {
        ...(data && typeof data === 'object' && !Array.isArray(data) ? data : { error: String(data || error.message || 'request-failed') }),
        httpStatus: Number.isInteger(error.status) ? error.status : null
      };
    }
    throw error;
  }
}

export async function inspectRuntime({ request }) {
  const paths = ['/api/summary', '/api/owner/setup', '/api/sender-health', '/api/outbound/canary/status', '/api/outreach/100k/status', '/api/campaigns'];
  const results = await Promise.allSettled(paths.map(path => request(path)));
  const reads = Object.fromEntries(paths.map((path, i) => [path, results[i].status === 'fulfilled'
    ? { ok: true, result: results[i].value }
    : { ok: false, error: String(results[i].reason?.message || 'request-failed') }]));
  // Presence and authority are separate; never publish a full postal address.
  const owner = reads['/api/owner/setup'];
  if (owner.ok) {
    const identity = owner.result?.identity;
    owner.result = {
      ok: owner.result?.ok === true,
      identity: { recordPresent: Boolean(identity), legalNamePresent: Boolean(identity?.legalName), postalAddressPresent: Boolean(identity?.postalAddress), senderNamePresent: Boolean(identity?.senderName), companyPresent: Boolean(identity?.company), source: identity?.source || null },
      sender: owner.result?.sender,
      recipientEvidence: owner.result?.recipientEvidence
    };
  }
  const summary = reads['/api/summary'];
  if (summary.ok) {
    const s = summary.result;
    summary.result = { storeBackend: s.storeBackend, workerOnline: s.workerOnline, paused: s.paused, autopilot: s.autopilot, outbound: s.outbound, accounts: s.accounts };
  }
  const campaigns = reads['/api/campaigns'];
  if (campaigns.ok) campaigns.result = campaigns.result.map(c => ({ id: c.id, name: c.name, offerId: c.offerId, approved: c.approved, autoSend: c.autoSend, allowedCountries: c.allowedCountries, expiresAt: c.expiresAt }));
  return { observedAt: new Date().toISOString(), reads, readOnly: true, sendAuthority: false, externalEffects: 0 };
}

export function mountProspectPreflight({ request, document }) {
  const bind = (buttonId, outputId, run) => {
    const button = document.querySelector(`#${buttonId}`);
    const output = document.querySelector(`#${outputId}`);
    if (!button || !output) return;
    button.addEventListener('click', async () => {
      button.disabled = true;
      output.textContent = 'Reading production…';
      try { output.textContent = JSON.stringify(await run(), null, 2); }
      catch (error) { output.textContent = JSON.stringify({ state: 'READ_FAILED', error: String(error.message || 'request-failed'), sendAuthority: false }); }
      finally { button.disabled = false; }
    });
  };
  let validatedDigest = '';
  let executionAttempted = false;
  const preflightInput = document.querySelector('#prospect-preflight-request');
  const executionDigest = document.querySelector('#frozen-effect-digest');
  const executeButton = document.querySelector('#execute-frozen-effect');
  const executionOutput = document.querySelector('#frozen-effect-execution-result');
  const executionForm = document.querySelector('#frozen-effect-execution-form');
  const syncExecutionAvailability = () => {
    const digest = String(executionDigest?.value || '');
    if (executeButton) executeButton.disabled = executionAttempted || !FROZEN_EFFECT_DIGEST.test(digest) || digest !== validatedDigest;
  };
  preflightInput?.addEventListener?.('input', () => { validatedDigest = ''; syncExecutionAvailability(); });
  executionDigest?.addEventListener?.('input', syncExecutionAvailability);
  bind('run-prospect-preflight', 'prospect-preflight-result', async () => {
    validatedDigest = '';
    syncExecutionAvailability();
    const input = JSON.parse(preflightInput.value);
    const body = input?.request?.body || input;
    const result = await inspectProspect({ request, input });
    const current = result.preflight?.result;
    const participants = current?.effectPackage?.participants;
    const prerequisites = current?.globalRoute?.sendPrerequisites || {};
    const requiredPass = ['suppressionClean', 'historyClean', 'identityComplete', 'senderEligible', 'providerAllowed']
      .every(key => prerequisites[key]?.status === 'PASS');
    const authOnlyBlocker = Array.isArray(current?.oneButton?.blockers) && (
      current.oneButton.blockers.length === 0 ||
      (current.oneButton.blockers.length === 1 &&
        current.oneButton.blockers[0]?.gate === 'authorization' &&
        current.oneButton.blockers[0]?.code === 'founder-signed-authorization-absent-or-unverified')
    );
    const authGate = current?.oneButton?.gates?.authorizationValid;
    const authorizationStateMatchesBlockers =
      (authGate?.status === 'PASS' && current?.oneButton?.blockers?.length === 0) ||
      (authGate?.status === 'FAIL' && authGate?.codes?.length === 1 &&
        authGate.codes[0] === 'founder-signed-authorization-absent-or-unverified' &&
        current?.oneButton?.blockers?.length === 1);
    const expiry = Date.parse(current?.frozenEffect?.expiresAt || current?.effectPackage?.expiresAt || '');
    const exactInteloNadia = participants?.recipient === 'partnerships@intelo.ai' &&
      participants?.sender?.slot === 'winnr:nadia.chen@cedarpointdomains.com' &&
      participants?.sender?.provider === 'smtp-relay' && participants?.provider === 'smtp-relay' &&
      participants?.route?.routeClass === 'INVITED_GREEN' &&
      participants?.route?.providerRouteType === 'INVITED_BUSINESS_CONTACT';
    if (body?.frozenEffectDigest && Object.keys(body).length === 1 &&
        result.readOnly === true && result.sendAuthority === false && result.externalEffects === 0 &&
        result.preflight?.ok === true && current?.state === 'READY_FOR_AUTHORIZATION' &&
        current?.blockerCodes?.length === 0 && current?.validation?.valid === true &&
        current?.validation?.frozenEffectDigest === body.frozenEffectDigest &&
        current?.frozenEffect?.digest === body.frozenEffectDigest &&
        current?.effectPackage?.finalEffectDigest === body.frozenEffectDigest &&
        current?.effectPackage?.maxEffects === 1 && current?.frozenEffect?.maxEffects === 1 &&
        Number.isFinite(expiry) && expiry > Date.now() && exactInteloNadia &&
        current?.globalRoute?.green === true && current?.globalRoute?.governanceGate?.refused === false &&
        current?.globalRoute?.governanceGate?.routeType === 'INVITED_BUSINESS_CONTACT' &&
        /^[a-f0-9]{64}$/.test(current?.globalRoute?.routeDigest || '') &&
        requiredPass && authOnlyBlocker && authorizationStateMatchesBlockers &&
        current?.oneButton?.sendAuthority === false) {
      validatedDigest = body.frozenEffectDigest;
      syncExecutionAvailability();
    }
    return result;
  });
  executionForm?.addEventListener?.('submit', async event => {
    event?.preventDefault?.();
    const digest = String(executionDigest?.value || '');
    if (executionAttempted || !FROZEN_EFFECT_DIGEST.test(digest) || digest !== validatedDigest || !executeButton || executeButton.disabled) return;
    // A rejected, timed-out, or uncertain response is still a consumed UI
    // attempt. The durable server reservation is the cross-session replay gate.
    executionAttempted = true;
    syncExecutionAvailability();
    if (executionDigest) executionDigest.readOnly = true;
    if (executionOutput) executionOutput.textContent = 'Dispatch requested once. Do not retry; reconcile the exact digest and provider ledger first.';
    try {
      const receipt = await executeFrozenProspect({ request, digest });
      if (executionOutput) executionOutput.textContent = JSON.stringify(receipt, null, 2);
    } catch (error) {
      if (executionOutput) executionOutput.textContent = JSON.stringify({
        state: 'EXECUTION_RESPONSE_UNKNOWN',
        error: String(error?.message || 'request-failed'),
        retryAuthorized: false,
        reconciliationRequired: true,
        externalEffects: 'UNKNOWN',
        sendAuthority: false
      }, null, 2);
    }
  });
  syncExecutionAvailability();
  bind('read-prospect-candidates', 'prospect-candidates-result', () => request('/api/prospect-preflight/candidates'));
  bind('read-outreach-reality', 'outreach-reality-result', () => inspectRuntime({ request }));
  bind('read-green-lane-status', 'green-lane-status-result', () => request('/api/outreach/green-lane/status'));
  bind('read-green-lane-candidates', 'green-lane-candidates-result', () => request('/api/prospect-preflight/candidates?mode=GREEN_LANE_ONLY'));
}
