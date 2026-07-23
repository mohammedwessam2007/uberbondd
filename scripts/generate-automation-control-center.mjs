// Generates UBERBOND_AUTOMATION_CONTROL_CENTER.html from a seeded, in-memory demonstration store.
// This is the same code path as production (Store, cockpit, automation modules) run against
// sample data -- not hand-authored HTML -- so the rendered dashboard proves the wiring works.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { config as baseConfig } from '../src/config.mjs';
import { buildCockpitSnapshot } from '../src/cockpit.mjs';
import { automationStatus } from '../src/automation/mode.mjs';
import { signCampaignPolicy, isCampaignPolicyActive } from '../src/automation/campaign-policy.mjs';
import { buildExceptionQueue, exceptionQueueSummary } from '../src/automation/exceptions.mjs';
import { buildDailyDigest } from '../src/automation/digest.mjs';
import { createFulfillmentTask } from '../src/automation/fulfillment.mjs';
import { LIFECYCLE_STATES, TERMINAL_STATES, projectLifecycleState } from '../src/automation/state-machine.mjs';

async function seed() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-control-center-'));
  const store = new Store(dir);
  await store.init();
  const cfg = {
    ...baseConfig,
    automation: { ...baseConfig.automation, mode: 'approval', enabled: true, policySecret: 'demo-control-center-secret-key-32chars' }
  };

  const demo = JSON.parse(await fs.readFile(new URL('../config/campaigns/demo-healthcare-dry-run.json', import.meta.url), 'utf8'));
  const policy = signCampaignPolicy({
    ...demo, enabled: true, dailySendCap: 20, hourlySendCap: 5, allowedInboxes: ['A'],
    allowedChannelTypes: ['email'], postalAddressConfirmed: true, paymentRailConfirmed: true,
    pauseThresholds: { hardBounce: 2, complaint: 1, failure: 3 },
    expiresAt: new Date(Date.now() + 30 * 86400000).toISOString()
  }, cfg, { ownerId: 'mohamed', createdAt: new Date().toISOString() });
  await store.add('campaigns', { id: policy.campaign.campaignId, ...policy.campaign, policyId: policy.id, policyExpiresAt: policy.expiresAt });

  const now = new Date().toISOString();
  const prospectStages = [
    { status: 'queued', company: 'Sunrise Dental' },
    { status: 'crawling', company: 'Desert Cosmetic Clinic' },
    { status: 'needs-review', company: 'Valley Fertility Center', draftApproval: { status: 'pending' }, outreach: { selected: { quality: { passed: true } } }, issue: { title: 'x' } },
    { status: 'sent', company: 'Metro Dermatology', sentAt: now },
    { status: 'interested', company: 'Phoenix Family Medicine' },
    { status: 'rejected', company: 'Low Score Clinic', rejectionReason: 'score_below_campaign_threshold' },
    { status: 'paid', company: 'Acme HVAC', paymentStatus: 'paid', paidAt: now }
  ];
  for (const [index, prospect] of prospectStages.entries()) {
    await store.add('prospects', { id: `pros_demo_${index}`, campaignId: policy.campaign.campaignId, website: `https://example-${index}.com`, domain: `example-${index}.com`, createdAt: now, ...prospect });
  }

  await store.add('replies', { id: 'reply_demo_1', prospectId: 'pros_demo_5', classification: { label: 'interested' }, receivedAt: now, body: 'Yes, tell me more about pricing.' });
  await store.add('orders', { id: 'order_demo_1', paymentState: 'paid', amountCents: 4900, currency: 'USD', prospectId: 'pros_demo_7', updatedAt: now, createdAt: now });
  await store.add('orders', { id: 'order_demo_2', paymentState: 'disputed', amountCents: 9900, currency: 'USD', updatedAt: now, createdAt: now });

  const delivery = { id: 'delivery_demo_1', status: 'delivery-queued', prospectId: 'pros_demo_7', amountPaid: { amountCents: 4900 }, selectedIssue: { service: 'Website diagnostic' }, testMode: true };
  await store.add('deliveries', delivery);
  const task = createFulfillmentTask(delivery, {}, now);
  await store.add('fulfillmentTasks', { ...task, id: 'fulfill_demo_1' });

  await store.add('subscriptions', { id: 'sub_demo_1', status: 'active', prospectId: 'pros_demo_7', nextRunAt: new Date(Date.now() + 30 * 86400000).toISOString() });
  await store.add('senderHealth', { inbox: 'B', paused: true, pauseReason: 'complaint-threshold', complaintsToday: 1 });
  await store.add('jobs', {
    id: 'job_demo_1', type: 'research.batch', queue: 'research.batch', status: 'dead-letter', payload: {}, priority: 0,
    attempts: 5, maxAttempts: 5, runAt: now, scheduledAt: now, createdAt: now, lastError: 'timeout'
  });
  await store.add('workerHeartbeats', { id: 'worker_demo_1', role: 'worker', hostname: 'demo-host', pid: 1, startedAt: now, heartbeatAt: now });

  return { store, cfg, policy };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function panel(title, body) {
  return `<section class="panel"><h2>${escapeHtml(title)}</h2>${body}</section>`;
}

async function render() {
  const { store, cfg, policy } = await seed();
  const [prospects, replies, orders, campaigns, senderHealthRecords, fulfillmentTasks, subscriptions, jobs, liveWorkers] = await Promise.all([
    store.list('prospects'), store.list('replies'), store.list('orders'), store.list('campaigns'),
    store.list('senderHealth'), store.list('fulfillmentTasks'), store.list('subscriptions'), store.list('jobs'), store.list('workerHeartbeats')
  ]);
  const cockpit = buildCockpitSnapshot({ prospects, replies, orders, campaigns, senderHealth: senderHealthRecords, outbound: cfg.outbound });
  const exceptionRows = buildExceptionQueue({ replies, orders, fulfillmentTasks, subscriptions, senderHealth: senderHealthRecords, deadLetterJobs: jobs.filter(job => job.status === 'dead-letter') });
  const exceptionSummary = exceptionQueueSummary(exceptionRows);
  const status = automationStatus(cfg);
  const policyActive = isCampaignPolicyActive(policy, cfg);
  const digest = buildDailyDigest({ cockpitSnapshot: cockpit, exceptionSummary, workerHealth: { liveWorkerCount: liveWorkers.length, deadLetterCount: jobs.filter(job => job.status === 'dead-letter').length }, automationStatus: status });

  const stageCounts = new Map();
  for (const prospect of prospects) {
    const state = projectLifecycleState(prospect, {});
    stageCounts.set(state, (stageCounts.get(state) || 0) + 1);
  }
  const stageRows = [...LIFECYCLE_STATES, ...TERMINAL_STATES]
    .map(state => [state, stageCounts.get(state) || 0])
    .filter(([, count]) => count > 0);

  const evidencePassRate = prospects.length
    ? Math.round((prospects.filter(prospect => Boolean(prospect.issue)).length / prospects.length) * 100)
    : 0;
  const queuedDrafts = cockpit.counts['needs-review'] || 0;
  const sentTestMode = prospects.filter(prospect => prospect.status === 'sent' || prospect.deliveryMode === 'test').length;

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>UberBond Automation Control Center</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
:root{color-scheme:light dark;--bg:#0b0f14;--panel:#141a22;--fg:#e6edf3;--muted:#8b96a3;--accent:#4f9cff;--ok:#3fb950;--warn:#e3b341;--bad:#f85149;}
@media (prefers-color-scheme: light){:root{--bg:#f6f8fa;--panel:#ffffff;--fg:#1f2328;--muted:#57606a;}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;padding:24px;}
h1{font-size:22px;margin:0 0 4px}
.sub{color:var(--muted);margin:0 0 20px;font-size:13px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}
.panel{background:var(--panel);border:1px solid rgba(127,127,127,.25);border-radius:10px;padding:16px}
.panel h2{font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);margin:0 0 10px}
table{width:100%;border-collapse:collapse;font-size:13px}
td,th{text-align:left;padding:4px 0;border-bottom:1px solid rgba(127,127,127,.15)}
.badge{display:inline-block;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:600}
.badge.ok{background:rgba(63,185,80,.15);color:var(--ok)}
.badge.warn{background:rgba(227,179,65,.15);color:var(--warn)}
.badge.bad{background:rgba(248,81,73,.15);color:var(--bad)}
.big{font-size:28px;font-weight:700}
.action{background:rgba(79,156,255,.12);border:1px solid rgba(79,156,255,.3);border-radius:8px;padding:12px;font-weight:600}
.footer{margin-top:20px;color:var(--muted);font-size:12px}
</style></head><body>
<h1>UberBond Automation Control Center</h1>
<p class="sub">Generated ${escapeHtml(new Date().toISOString())} from seeded demonstration data via the real Store + automation modules. Not connected to a live database.</p>

<div class="grid">
${panel('Automation mode', `
  <div class="big">${escapeHtml(status.mode.toUpperCase())}</div>
  <table>
    <tr><td>Enabled</td><td><span class="badge ${status.enabled ? 'ok' : 'bad'}">${status.enabled}</span></td></tr>
    <tr><td>Live (advances without owner click)</td><td><span class="badge ${status.live ? 'warn' : 'ok'}">${status.live}</span></td></tr>
    <tr><td>Campaign policy required</td><td>${status.campaignPolicyRequired}</td></tr>
  </table>`)}

${panel('Active campaign policy', `
  <table>
    <tr><td>Campaign</td><td>${escapeHtml(policy.campaign.name)}</td></tr>
    <tr><td>Policy ID</td><td>${escapeHtml(policy.id)}</td></tr>
    <tr><td>Signature valid</td><td><span class="badge ${policyActive.active ? 'ok' : 'bad'}">${policyActive.active}</span></td></tr>
    <tr><td>Daily send cap</td><td>${policy.campaign.dailySendCap}</td></tr>
    <tr><td>Evidence threshold</td><td>${policy.evidenceThreshold}</td></tr>
    <tr><td>Expires</td><td>${escapeHtml(policy.expiresAt)}</td></tr>
  </table>`)}

${panel('Kill switches', `
  <table>
    <tr><td>Outbound provider</td><td>${escapeHtml(cfg.outbound.provider)}</td></tr>
    <tr><td>Outbound enabled</td><td><span class="badge ${cfg.outbound.enabled ? 'warn' : 'ok'}">${cfg.outbound.enabled}</span></td></tr>
    <tr><td>Dry run</td><td><span class="badge ok">${cfg.outbound.dryRun}</span></td></tr>
    <tr><td>Live send approved</td><td><span class="badge ${cfg.outbound.liveSendApproved ? 'bad' : 'ok'}">${cfg.outbound.liveSendApproved}</span></td></tr>
    <tr><td>Paused inboxes</td><td>${senderHealthRecords.filter(record => record.paused).map(record => escapeHtml(record.inbox)).join(', ') || 'none'}</td></tr>
    <tr><td>Dead-letter jobs</td><td>${jobs.filter(job => job.status === 'dead-letter').length}</td></tr>
  </table>`)}

${panel('Prospects by lifecycle stage', `
  <table>${stageRows.map(([state, count]) => `<tr><td>${escapeHtml(state)}</td><td>${count}</td></tr>`).join('')}</table>`)}

${panel('Evidence & drafts', `
  <table>
    <tr><td>Evidence pass rate</td><td>${evidencePassRate}%</td></tr>
    <tr><td>Queued drafts (needs-review)</td><td>${queuedDrafts}</td></tr>
    <tr><td>Sends in test mode</td><td>${sentTestMode}</td></tr>
    <tr><td>Approved campaign volume (dailySendCap)</td><td>${policy.campaign.dailySendCap}</td></tr>
  </table>`)}

${panel('Replies', `
  <table>
    <tr><td>Total replies</td><td>${replies.length}</td></tr>
    <tr><td>Positive replies</td><td>${cockpit.attention.positiveReplies.length}</td></tr>
  </table>`)}

${panel('Payments', `
  <table>
    <tr><td>Orders</td><td>${orders.length}</td></tr>
    <tr><td>Paid</td><td>${orders.filter(order => order.paymentState === 'paid').length}</td></tr>
    <tr><td>Disputed</td><td><span class="badge bad">${orders.filter(order => order.paymentState === 'disputed').length}</span></td></tr>
  </table>`)}

${panel('Fulfillment', `
  <table>${fulfillmentTasks.map(task => `<tr><td>${escapeHtml(task.id)}</td><td>${escapeHtml(task.lane)}</td><td>${escapeHtml(task.status)}</td></tr>`).join('') || '<tr><td>None active</td></tr>'}</table>`)}

${panel('Monitoring', `
  <table>${subscriptions.map(sub => `<tr><td>${escapeHtml(sub.id)}</td><td>${escapeHtml(sub.status)}</td><td>next: ${escapeHtml(sub.nextRunAt || '-')}</td></tr>`).join('') || '<tr><td>None active</td></tr>'}</table>`)}

${panel('Worker health', `
  <table>
    <tr><td>Live workers</td><td>${liveWorkers.length}</td></tr>
    <tr><td>Dead-letter jobs</td><td>${jobs.filter(job => job.status === 'dead-letter').length}</td></tr>
  </table>`)}

${panel(`Exceptions (${exceptionSummary.total})`, `
  <table>
    <tr><th>Priority</th><th>Category</th><th>Reason</th><th>Exact action</th></tr>
    ${exceptionRows.map(row => `<tr><td><span class="badge ${row.priority === 'P0' ? 'bad' : row.priority === 'P1' ? 'warn' : 'ok'}">${row.priority}</span></td><td>${escapeHtml(row.category)}</td><td>${escapeHtml(row.reason)}</td><td>${escapeHtml(row.exactAction)}</td></tr>`).join('') || '<tr><td colspan="4">No exceptions</td></tr>'}
  </table>`)}
</div>

<div class="action">Next owner action: ${escapeHtml(digest.nextOwnerAction)}</div>
<p class="footer">Sample/demonstration data only. This page is generated by scripts/generate-automation-control-center.mjs and can be re-pointed at a live Store to show real state.</p>
</body></html>`;

  await fs.writeFile(new URL('../UBERBOND_AUTOMATION_CONTROL_CENTER.html', import.meta.url), html);
  console.log('Wrote UBERBOND_AUTOMATION_CONTROL_CENTER.html');
}

render();
