const button = document.querySelector('#start-outreach');
const status = document.querySelector('#start-outreach-status');
const tokenField = document.querySelector('#token');

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
    throw new Error(detail);
  }
  return payload;
}

function readinessBlockers(summary, campaigns) {
  const blockers = [];
  const outbound = summary?.outbound || {};
  const approvedAutoSend = (Array.isArray(campaigns) ? campaigns : [])
    .filter(campaign => !campaign?.systemKey && campaign?.approved === true && campaign?.autoSend === true);

  if (outbound.enabled !== true) blockers.push('live outbound is disabled at the runtime boundary');
  if (outbound.dryRun === true) blockers.push('runtime is still in dry-run mode');
  if (Number(outbound.uncertain || 0) > 0) blockers.push(`${Number(outbound.uncertain)} uncertain send outcome(s) require reconciliation`);
  if (!approvedAutoSend.length) blockers.push('no approved auto-send campaign exists');

  return { blockers, approvedAutoSend };
}

async function startOutreach() {
  if (!button) return;
  button.disabled = true;
  setStatus('Checking live gates…', 'working');

  try {
    const [summary, campaigns] = await Promise.all([
      request('/api/summary'),
      request('/api/campaigns')
    ]);
    const { blockers, approvedAutoSend } = readinessBlockers(summary, campaigns);

    if (blockers.length) {
      setStatus(`REFUSED · ${blockers.join(' · ')}`, 'blocked');
      return;
    }

    setStatus('Gates green. Waking worker…', 'working');
    await request('/api/worker/resume', { method: 'POST' });

    setStatus('Worker awake. Releasing outbound pause…', 'working');
    await request('/api/outbound/resume', { method: 'POST' });

    setStatus('Outbound armed. Starting bounded Nightshift pulse…', 'working');
    const run = await request('/api/run', { method: 'POST', body: { limit: 250 } });

    const campaignNames = approvedAutoSend.map(campaign => campaign.name || campaign.id).slice(0, 3).join(', ');
    const queued = Number(run?.queued ?? run?.enqueued ?? run?.count ?? 0);
    setStatus(
      `STARTED · ${campaignNames || 'approved campaign'} · initial pulse ${queued || 'accepted'} · #875 safety gates remain binding`,
      'started'
    );

    setTimeout(() => document.querySelector('#refresh')?.click(), 750);
  } catch (error) {
    setStatus(`REFUSED · ${error?.message || String(error)}`, 'blocked');
  } finally {
    button.disabled = false;
  }
}

button?.addEventListener('click', startOutreach);
