const button = document.querySelector('#start-outreach');
const status = document.querySelector('#start-outreach-status');
const tokenField = document.querySelector('#token');

if (button) button.textContent = 'START CERTIFIED 100K OUTREACH';

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

function blockers(prepared) {
  const certificate = prepared?.certificate || {};
  return [
    ...(certificate.hardStopReasonCodes || []),
    ...(certificate.waitReasonCodes || [])
  ];
}

async function startOutreach() {
  if (!button) return;
  button.disabled = true;
  setStatus('Certifying exact 100,000-recipient launch…', 'working');

  try {
    const prepared = await request('/api/outreach/100k/status');
    if (prepared?.certificate?.state !== 'CERTIFIED_100K_READY' || prepared?.pressable !== true) {
      const reasons = blockers(prepared);
      const shortfall = Number(prepared?.certificate?.shortfall || 0);
      setStatus(`REFUSED · ${shortfall ? `${shortfall.toLocaleString()} capacity/inventory short · ` : ''}${reasons.join(' · ') || '100K certificate is not green'}`, 'blocked');
      return;
    }

    setStatus(`CERTIFIED · ${prepared.certificate.certificateId} · enqueueing exact corpus…`, 'working');
    const run = await request('/api/outreach/100k/start', {
      method: 'POST',
      body: { confirmExactTarget: 100000 }
    });

    setStatus(
      `STARTED · exact 100K certified worker · job ${run.jobId || 'queued'} · every batch re-certifies and uncertain outcomes quarantine`,
      'started'
    );
    setTimeout(() => document.querySelector('#refresh')?.click(), 750);
  } catch (error) {
    const prepared = error?.payload?.prepared;
    const reasons = blockers(prepared);
    setStatus(`REFUSED · ${reasons.length ? reasons.join(' · ') : error?.message || String(error)}`, 'blocked');
  } finally {
    button.disabled = false;
  }
}

button?.addEventListener('click', startOutreach);
