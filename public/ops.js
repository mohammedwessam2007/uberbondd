const $ = id => document.getElementById(id);
let token = '';
let timer = null;

function text(id, value) { const el = $(id); if (el) el.textContent = value == null || value === '' ? '—' : String(value); }
function yesNo(value) { return value === true ? 'READY' : value === false ? 'NO' : '—'; }
function tone(el, value) {
  if (!el) return;
  el.classList.remove('good', 'warn', 'bad');
  const s = String(value || '').toUpperCase();
  if (/READY|LIVE|ENABLED|PRESENT|NONE|FORBIDDEN/.test(s) && !/NOT|UNAVAILABLE|DISABLED/.test(s)) el.classList.add('good');
  else if (/BLOCK|FAIL|ERROR|REQUIRED|DISABLED|UNAVAILABLE/.test(s)) el.classList.add('bad');
  else el.classList.add('warn');
}
function money(cents) {
  const n = Number(cents);
  return Number.isFinite(n) ? `$${(n / 100).toFixed(2)}` : '—';
}
function compact(value) {
  if (value == null) return '—';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.length ? value.map(compact).join(', ') : 'NONE';
  const preferred = value.status ?? value.state ?? value.label ?? value.action ?? value.reason ?? value.enabled;
  return preferred == null ? 'AVAILABLE' : compact(preferred);
}
async function api(path) {
  const response = await fetch(path, { cache: 'no-store', headers: { authorization: `Bearer ${token}` } });
  const body = await response.json().catch(() => ({ ok: false, status: 'INVALID_RESPONSE' }));
  if (!response.ok) {
    const error = new Error(body?.reasonCodes?.join(', ') || body?.status || `HTTP_${response.status}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}
function status(mode, label) {
  const dot = $('status-dot');
  dot.className = `dot ${mode || ''}`;
  text('status-label', label);
}
function renderActions(rows) {
  const host = $('owner-actions');
  host.replaceChildren();
  const list = Array.isArray(rows) ? rows.slice(0, 3) : [];
  if (!list.length) {
    const p = document.createElement('p'); p.className = 'empty'; p.textContent = 'No binding founder action surfaced by current live summaries.'; host.append(p); return;
  }
  list.forEach((row, index) => {
    const card = document.createElement('div'); card.className = 'action';
    const number = document.createElement('i'); number.textContent = String(index + 1).padStart(2, '0');
    const copy = document.createElement('div');
    const title = document.createElement('b');
    title.textContent = row?.title || row?.action || row?.label || row?.type || 'Founder action';
    const detail = document.createElement('small');
    detail.textContent = row?.instruction || row?.reason || row?.detail || row?.description || 'Review the canonical source before acting.';
    copy.append(title, detail); card.append(number, copy); host.append(card);
  });
}
function renderOps(view) {
  const first = view?.firstCash || {};
  const path = first.canonicalPath || {};
  const launch = view?.launchability || {};
  const operations = view?.operations || {};
  const posture = view?.providerPosture || {};

  text('first-price', path.priceUsd);
  text('first-sku', path.sku);
  const launchEl = $('launch-state');
  launchEl.textContent = launch.liveLaunchConfigurationReady ? 'CONFIGURATION GATES PRESENT' : 'EXTERNAL GATES REMAIN';
  launchEl.classList.toggle('ready', launch.liveLaunchConfigurationReady === true);
  const blockers = $('launch-blockers'); blockers.replaceChildren();
  const rows = Array.isArray(launch.externalActivationBlockers) ? launch.externalActivationBlockers : [];
  if (!rows.length) { const s = document.createElement('span'); s.textContent = 'No configuration blocker reported. External reality still required.'; blockers.append(s); }
  else for (const row of rows) { const s = document.createElement('span'); s.textContent = String(row).replaceAll('-', ' '); blockers.append(s); }

  text('payments', launch.externalReality?.clearedPaymentCount ?? operations.money?.clearedPaymentCount);
  text('revenue', money(launch.externalReality?.clearedRevenueCents ?? operations.money?.clearedRevenueCents));
  text('customers', launch.externalReality?.customers ?? operations.businesses?.customers);
  text('accepted', launch.externalReality?.acceptedDeliveries ?? operations.businesses?.acceptedDeliveries);

  text('paid-leads', first.deliveryReadiness?.paidLeads);
  text('awaiting-delivery', first.deliveryReadiness?.awaitingReportDelivery);
  text('report-ready', first.deliveryReadiness?.reportDelivered);
  text('payment-review', first.paymentTruth?.operatorAttentionRecently);

  text('db-state', yesNo(posture.databaseConfigured)); tone($('db-state'), posture.databaseConfigured ? 'READY' : 'REQUIRED');
  text('paypal-mode', posture.paypalEnvironment); tone($('paypal-mode'), posture.paypalEnvironment);
  text('paypal-live', yesNo(posture.commercialProviderConfigurationPresent)); tone($('paypal-live'), posture.commercialProviderConfigurationPresent ? 'READY' : 'REQUIRED');
  const outbound = posture.outboundEnabled ? (posture.outboundDryRun ? 'DRY RUN' : 'ENABLED') : 'DISABLED';
  text('outbound-state', outbound); tone($('outbound-state'), outbound);

  text('distribution-execution', operations.distribution?.externalExecution);
  text('distribution-spend', money(operations.distribution?.spendCents ?? 0));
  text('kill-switch', compact(operations.distribution?.outbound?.killSwitch));
  text('next-safe', compact(operations.distribution?.outbound?.nextSafeAction));

  renderActions(view?.owner?.actionQueue);
  text('private-state', view?.privacy?.rawPersonalCivilizationReachable === false ? 'OFF NETWORK' : 'UNKNOWN');
  text('private-note', view?.privacy?.note);
  text('runtime-line', [view?.runtime?.platform, view?.runtime?.environment, view?.runtime?.sourceCommit?.slice?.(0, 12)].filter(Boolean).join(' · '));
  text('truth-boundary', view?.truthBoundary);
}
function renderSovereign(view) {
  text('highest-rung', view?.highestRung || 'RECOMMENDATION');
  text('authority-boundary', view?.founderAuthority);
  const calibration = view?.calibration || {};
  text('calibration-count', calibration.total ?? calibration.count ?? calibration.scoredCount ?? 0);
  text('checksum-state', compact(view?.checksum));
}
function clearLive() {
  status('', 'LOCKED');
  $('refresh').disabled = true; $('lock').disabled = true;
}
async function refresh() {
  if (!token) return clearLive();
  status('', 'SYNCING');
  const [ops, sovereign] = await Promise.allSettled([api('/api/founder-ops'), api('/api/sovereign-control')]);
  const authFailure = [ops, sovereign].some(result => result.status === 'rejected' && result.reason?.status === 401);
  if (authFailure) {
    token = '';
    clearLive();
    $('auth-error').textContent = 'Owner key refused. Credential erased.';
    $('auth-dialog').showModal();
    return;
  }
  if (ops.status === 'fulfilled') renderOps(ops.value);
  else text('truth-boundary', `Operational live store unavailable: ${ops.reason?.message || 'unknown'}`);
  if (sovereign.status === 'fulfilled') renderSovereign(sovereign.value);
  const live = ops.status === 'fulfilled' || sovereign.status === 'fulfilled';
  status(live ? 'live' : 'error', live ? (ops.status === 'fulfilled' ? 'LIVE TRUTH' : 'SOVEREIGN ONLY') : 'UNAVAILABLE');
  $('refresh').disabled = false; $('lock').disabled = false;
}
function lock() {
  token = '';
  clearInterval(timer); timer = null;
  clearLive();
  $('auth-error').textContent = '';
  if (!$('auth-dialog').open) $('auth-dialog').showModal();
}

$('auth-form').addEventListener('submit', event => {
  event.preventDefault();
  const candidate = $('owner-token').value.trim();
  $('owner-token').value = '';
  if (!candidate) { $('auth-error').textContent = 'ADMIN_TOKEN required.'; return; }
  token = candidate;
  $('auth-error').textContent = '';
  $('auth-dialog').close();
  $('refresh').disabled = false; $('lock').disabled = false;
  refresh();
  clearInterval(timer); timer = setInterval(() => { if (!document.hidden) refresh(); }, 30000);
});
$('refresh').addEventListener('click', refresh);
$('lock').addEventListener('click', lock);
window.addEventListener('pagehide', () => { token = ''; });
document.addEventListener('visibilitychange', () => { if (!document.hidden && token) refresh(); });

clearLive();
$('auth-dialog').showModal();
