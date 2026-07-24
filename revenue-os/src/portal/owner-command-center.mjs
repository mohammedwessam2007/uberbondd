// Owner command center (workstream 14): a static HTML snapshot, the same honestly-scoped pattern
// used elsewhere this session for owner-facing views -- real data in, no server/store access of
// its own, not yet a live route. The home screen shows exactly the mission's 5 named things and
// nothing else; every other named area (imported packs, validation errors, opportunity ranking,
// approval queue, send handoff, replies, proposals, payments, projects, fulfillment, monitoring,
// experiments, blockers, provider/scheduler health, audit log, scoreboard) is a separate section
// below it, not competing for home-screen attention.
import { escapeHtml, redactEmail } from '../utils.mjs';

function section(title, bodyHtml) { return `<section><h2>${escapeHtml(title)}</h2>${bodyHtml}</section>`; }
function list(items, renderItem) { return items.length ? `<ul>${items.map(renderItem).join('')}</ul>` : '<p><em>None</em></p>'; }

export function renderOwnerCommandCenter({
  verdict = 'No owner action currently required.', ownerActions = [], blockers = [], scoreboard = {},
  importStatus = { packsImported: 0, quarantined: 0 }, opportunityRanking = [], approvalQueue = [],
  sendHandoffs = [], replies = [], proposals = [], payments = [], projects = [], monitoringOffers = [],
  experiments = [], providerHealth = [], schedulerHealth = { counts: {}, total: 0 }, auditLog = [], validationErrors = []
} = {}) {
  const nextThree = ownerActions.slice(0, 3);
  return `<!doctype html><html><head><meta charset="utf-8"><title>Owner Command Center</title>
<style>body{font-family:sans-serif;max-width:960px;margin:0 auto;padding:24px;} section{margin-bottom:28px;border-top:1px solid #ddd;padding-top:12px;} .home{background:#eff6ff;padding:16px;border-radius:8px;margin-bottom:24px;}</style>
</head><body>
<h1>UberBond Revenue OS -- Owner Command Center</h1>

<div class="home">
<h2>Current Verdict</h2>
<p>${escapeHtml(verdict)}</p>
<h2>Next 3 Owner Actions</h2>
${list(nextThree, a => `<li><strong>${escapeHtml(a.target)}</strong> -- ${a.minutes} min, $${(a.costCents / 100).toFixed(2)}, proof: ${escapeHtml(a.proofRequired)}, default: ${escapeHtml(a.default)}, urgency: ${escapeHtml(a.urgency)}</li>`)}
<h2>Active Blockers</h2>
${list(blockers, b => `<li>${escapeHtml(b.code)} (${escapeHtml(b.workstream)})</li>`)}
<h2>Real Scoreboard</h2>
<ul>${Object.entries(scoreboard).map(([k, v]) => `<li>${escapeHtml(k)}: ${escapeHtml(String(v))}</li>`).join('')}</ul>
<h2>Import / Employee Status</h2>
<p>${importStatus.packsImported} pack(s) imported, ${importStatus.quarantined} record(s) quarantined.</p>
</div>

${section('Imported Packs', `<p>${importStatus.packsImported} total.</p>`)}
${section('Validation Errors', list(validationErrors, e => `<li>${escapeHtml(e.reasons?.join(', ') || 'unknown')}</li>`))}
${section('Opportunity Ranking', list(opportunityRanking.slice(0, 25), o => `<li>[${o.score}] ${escapeHtml(o.opportunity?.organizationDomain || '')}</li>`))}
${section('Approval Queue', list(approvalQueue, a => `<li>${escapeHtml(a.data?.organizationDomain || '')} -- ${escapeHtml(a.status)}</li>`))}
${section('Send Handoff', list(sendHandoffs, s => `<li>${escapeHtml(s.mode)} -- ${escapeHtml(s.status)}</li>`))}
${section('Replies', list(replies, r => `<li>${escapeHtml(r.classification)} -- ${escapeHtml(redactEmail(r.data?.from || ''))}</li>`))}
${section('Proposals', list(proposals, p => `<li>${escapeHtml(p.kind)} -- $${((p.totalCents || 0) / 100).toFixed(2)}</li>`))}
${section('Payments', list(payments, p => `<li>${escapeHtml(p.status)} -- $${((p.amountCents || 0) / 100).toFixed(2)}</li>`))}
${section('Projects', list(projects, p => `<li>${escapeHtml(p.status)} -- ${escapeHtml(p.organizationDomain || '')}</li>`))}
${section('Fulfillment', list(projects.filter(p => ['REPORT_DRAFTED', 'QA', 'READY_TO_DELIVER'].includes(p.status)), p => `<li>${escapeHtml(p.status)}</li>`))}
${section('Monitoring', list(monitoringOffers, m => `<li>${m.active ? 'active' : 'inactive'} -- $${((m.priceCents || 0) / 100).toFixed(2)}/mo</li>`))}
${section('Experiments', list(experiments, e => `<li>${escapeHtml(e.name)} -- variant ${escapeHtml(e.variant)} (${escapeHtml(e.status)})</li>`))}
${section('Provider Health', list(providerHealth, p => `<li>${escapeHtml(p.name)}: ${p.healthy ? 'healthy' : 'unhealthy'}</li>`))}
${section('Scheduler Health', `<p>${escapeHtml(JSON.stringify(schedulerHealth.counts))} (total ${schedulerHealth.total})</p>`)}
${section('Audit Log', list(auditLog.slice(-20), a => `<li>${escapeHtml(a.type)} -- ${escapeHtml(a.createdAt || '')}</li>`))}
</body></html>`;
}
