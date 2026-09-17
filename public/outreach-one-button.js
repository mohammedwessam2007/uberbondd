const button = document.querySelector('#start-outreach');
const status = document.querySelector('#start-outreach-status');
const tokenField = document.querySelector('#token');

if (button) button.textContent = 'START UBERBOND NOW';

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
    error.payload = payload;
    throw error;
  }
  return payload;
}

const blockers = prepared => [
  ...(prepared?.certificate?.hardStopReasonCodes || []),
  ...(prepared?.certificate?.waitReasonCodes || [])
];
const green = prepared => prepared?.certificate?.state === 'CERTIFIED_100K_READY' && prepared?.pressable === true;
async function prepared() {
  try { return await request('/api/outreach/100k/status'); }
  catch (error) { return error?.payload?.prepared || error?.payload || null; }
}

let pollTimer = null;
function poll() {
  if (pollTimer) return;
  pollTimer = setInterval(async () => {
    const current = await prepared();
    if (green(current)) {
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
    button.disabled = false;
  }
}

button?.addEventListener('click', startOutreach);
