const button = document.querySelector('#start-outreach');
const status = document.querySelector('#start-outreach-status');
const tokenField = document.querySelector('#token');

if (button) { button.textContent = 'OUTREACH STATUS UNKNOWN'; button.disabled = true; }

const setStatus = (message, state = 'idle') => {
  if (!status) return;
  status.textContent = message;
  status.dataset.state = state;
};

async function request(path, { method = 'GET', body } = {}) {
  const token = String(tokenField?.value || '').trim();
  if (!token) throw new Error('Enter the admin token first. It stays only in page memory.');
  const headers = { authorization: `Bearer ${token}` };
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(path, {
    method,
    headers,
    cache: 'no-store',
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const type = response.headers.get('content-type') || '';
  const payload = type.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) {
    const detail = typeof payload === 'string'
      ? payload
      : payload?.error || payload?.message || payload?.reasonCodes?.join(', ') || `HTTP ${response.status}`;
    const error = new Error(detail);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

const blockers = prepared => [
  ...(prepared?.reasonCodes || []),
  ...(prepared?.certificate?.hardStopReasonCodes || []),
  ...(prepared?.certificate?.waitReasonCodes || [])
];
const green = prepared => !prepared?.readFailed && prepared?.certificate?.state === 'CERTIFIED_100K_READY' && prepared?.pressable === true && blockers(prepared).length === 0;
async function prepared() {
  try { return await request('/api/outreach/100k/status'); }
  catch (error) {
    // A typed 409 is a successfully read refusal, not an auth/network failure.
    if (error.status === 409 && error.payload?.ok === false && Array.isArray(error.payload.reasonCodes) && error.payload.reasonCodes.length) return { ...error.payload, pressable: false };
    return { readFailed: true, reasonCodes: ['launch-status-unreadable'] };
  }
}

// Read gates before presenting a launch control. Authentication and failed
// reads are UNKNOWN, never a generic optimistic start state.
let readingReadiness = false;
let readinessVersion = 0;
async function refreshReadiness() {
  if (!button || readingReadiness) return;
  readingReadiness = true;
  const version = readinessVersion;
  button.disabled = true;
  try {
    const current = await prepared();
    const canary = await request('/api/outbound/canary/status');
    if (version !== readinessVersion) throw new Error('credential-state-changed');
    if (current?.readFailed) throw new Error('launch-status-unreadable');
    const launchKnown = typeof current?.certificate?.state === 'string' || (current?.ok === false && Array.isArray(current.reasonCodes) && current.reasonCodes.length > 0);
    if (!launchKnown || typeof canary?.state !== 'string' || !Array.isArray(canary?.reasonCodes)) throw new Error('launch-status-malformed');
    const canaryCodes = canary?.reasonCodes || [];
    const canaryReady = canaryCodes.length === 0 && (canary?.readyForDryRun === true || canary?.readyForLiveSend === true);
    const ready = (green(current) && canaryCodes.length === 0) || canaryReady;
    button.disabled = !ready;
    button.textContent = ready ? 'START UBERBOND NOW' : 'OUTREACH BLOCKED';
    setStatus(ready ? 'READY · exact governed launch gates passed; final server recheck remains required' : `BLOCKED · ${[...new Set([...blockers(current), ...canaryCodes, ...(!ready && !blockers(current).length && !canaryCodes.length ? ['exact-approved-effect-required'] : [])])].join(' · ')}`, ready ? 'ready' : 'blocked');
  } catch (error) {
    button.disabled = true;
    button.textContent = 'OUTREACH STATUS UNKNOWN';
    setStatus(`UNKNOWN · ${error.message || 'launch-status-unreadable'}`, 'blocked');
  } finally { readingReadiness = false; }
}
window.addEventListener('outreach-runtime-loaded', refreshReadiness);
tokenField?.addEventListener('input', () => { readinessVersion++; button.disabled = true; button.textContent = 'OUTREACH STATUS UNKNOWN'; setStatus('UNKNOWN · authenticate and refresh current launch gates', 'blocked'); });

let pollTimer = null;
function poll() {
  if (pollTimer) return;
  pollTimer = setInterval(async () => {
    await refreshReadiness();
    const current = await prepared();
    if (green(current) && !button.disabled) {
      button.textContent = '100K READY · PRESS TO LAUNCH';
      setStatus(`CERTIFIED · ${current.certificate.certificateId} · press once more to enqueue the exact governed corpus`, 'ready');
      clearInterval(pollTimer);
      pollTimer = null;
      return;
    }
    if (current?.certificate) {
      const shortfall = Number(current.certificate.shortfall || 0);
      setStatus(`MISSION ACTIVE · working toward certificate · ${shortfall.toLocaleString()} remaining · ${blockers(current).slice(0, 3).join(' · ')}`, 'working');
    }
  }, 15000);
}

async function startOutreach() {
  if (!button) return;
  await refreshReadiness();
  if (button.disabled) return;
  button.disabled = true;
  setStatus('Checking certified 100K path…', 'working');
  try {
    const current = await prepared();
    if (green(current)) {
      const run = await request('/api/outreach/100k/start', {
        method: 'POST',
        body: { confirmExactTarget: 100000 }
      });
      setStatus(`STARTED · exact 100K certified worker · job ${run.jobId || 'queued'} · every batch re-certifies and uncertain outcomes quarantine`, 'started');
      setTimeout(() => document.querySelector('#refresh')?.click(), 750);
      return;
    }

    // The 100K certificate is a scale gate, not a prerequisite for the first
    // governed message. If exactly one bounded canary is ready, the same
    // founder button can exercise that path. Dry-run mode never reaches a
    // provider; live mode asks for a second explicit confirmation.
    const canary = await request('/api/outbound/canary/status').catch(() => null);
    if (canary?.readyForDryRun || canary?.readyForLiveSend) {
      const live = canary.readyForLiveSend === true;
      if (live && !window.confirm('Send exactly one owner-approved canary message now?')) {
        setStatus('CANARY NOT STARTED · waiting for your confirmation', 'idle');
        return;
      }
      const run = await request('/api/outbound/canary/start', {
        method: 'POST',
        body: { confirmCanary: true }
      });
      button.textContent = live ? 'CANARY QUEUED' : 'CANARY DRY RUN QUEUED';
      setStatus(`${run.state} · one exact prospect · ${live ? 'provider call remains behind the worker final recheck' : 'zero provider calls'}`, 'started');
      setTimeout(() => document.querySelector('#refresh')?.click(), 750);
      return;
    }

    const council = await request('/api/admin/uber-socket/outreach-100k-council', {
      method: 'POST',
      body: { fromPeer: 'founder-button', maxResponders: 12 }
    });
    await request('/api/admin/uber-socket/cognitive-cycle', { method: 'POST', body: {} }).catch(() => null);
    const shortfall = Number(current?.certificate?.shortfall || 0);
    button.textContent = 'UBERBOND WORKING';
    setStatus(`MISSION ACTIVE · ${council.councilId || 'outreach-council'} · UberSocket council engaged${shortfall ? ` · ${shortfall.toLocaleString()} certified-send capacity still to close` : ''}`, 'working');
    poll();
  } catch (error) {
    setStatus(`REFUSED · ${error?.message || String(error)}`, 'blocked');
  } finally {
    await refreshReadiness();
  }
}

button?.addEventListener('click', startOutreach);
