// Browser controls over the existing canonical read-only operations. The
// credential remains owned by admin.js; this module never receives its value.
export async function inspectProspect({ request, input }) {
  const body = input?.request?.body || input;
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
  return { checkedRecipient: email, checkedDomain: domain, classification, preflight, history, readOnly: true, sendAuthority: false, externalEffects: 0 };
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
  bind('run-prospect-preflight', 'prospect-preflight-result', () => inspectProspect({ request, input: JSON.parse(document.querySelector('#prospect-preflight-request').value) }));
  bind('read-prospect-candidates', 'prospect-candidates-result', () => request('/api/prospect-preflight/candidates'));
  bind('read-outreach-reality', 'outreach-reality-result', () => inspectRuntime({ request }));
}
