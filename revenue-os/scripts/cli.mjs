#!/usr/bin/env node
// Minimal local CLI (workstream 14's second required surface, alongside the HTML dashboard).
// Usage: node revenue-os/scripts/cli.mjs <command> [--store-dir <dir>]
// Commands: status, render-dashboard
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from '../src/store.mjs';
import { compileOwnerActionQueue, computeVerdict } from '../src/owner-actions.mjs';
import { computeFunnelCounts, computeFunnelRates } from '../src/funnel.mjs';
import { renderOwnerCommandCenter } from '../src/portal/owner-command-center.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const flags = {};
  for (let i = 0; i < rest.length; i++) {
    if (rest[i].startsWith('--')) { flags[rest[i].slice(2)] = rest[i + 1]; i += 1; }
  }
  return { command, flags };
}

async function loadStore(storeDir) {
  const store = new Store(storeDir);
  await store.init();
  return store;
}

async function runStatus(store) {
  const [pendingApprovals, openBlockers, pendingPayments, activeMonitoring, ownerActions] = await Promise.all([
    store.list('approvals', { filters: { status: 'pending' } }),
    store.list('blockers', { filters: { status: 'open' } }),
    store.list('payments', { filters: { status: 'PENDING_VERIFICATION' } }),
    store.list('monitoringOffers', { filters: { active: true } }),
    compileOwnerActionQueue(store)
  ]);
  const verdict = computeVerdict({ pendingApprovals: pendingApprovals.length, openBlockers: openBlockers.length, pendingPayments: pendingPayments.length, activeMonitoring: activeMonitoring.length });
  const counts = await computeFunnelCounts(store);
  console.log(`Verdict: ${verdict}`);
  console.log(`Next actions: ${ownerActions.slice(0, 3).map(a => a.target).join(' | ') || '(none)'}`);
  console.log(`Blockers: ${openBlockers.length}`);
  console.log(`Scoreboard: researched=${counts.researched} qualified=${counts.qualified} payment=${counts.payment} delivery=${counts.delivery}`);
}

async function runRenderDashboard(store, outPath) {
  const [ownerActions, blockers, opportunities, approvals, sendRecords, replies, proposals, payments, projects, monitoringOffers, experiments, auditLog] = await Promise.all([
    compileOwnerActionQueue(store), store.list('blockers', { filters: { status: 'open' } }), store.list('opportunities'),
    store.list('approvals', { filters: { status: 'pending' } }), store.list('sendRecords'), store.list('replies'),
    store.list('proposals'), store.list('payments'), store.list('diagnosticProjects'), store.list('monitoringOffers'),
    store.list('experiments'), store.list('auditLog')
  ]);
  const counts = await computeFunnelCounts(store);
  const verdict = computeVerdict({ pendingApprovals: approvals.length, openBlockers: blockers.length, pendingPayments: payments.filter(p => p.status === 'PENDING_VERIFICATION').length, activeMonitoring: monitoringOffers.filter(m => m.active).length });
  const html = renderOwnerCommandCenter({
    verdict, ownerActions, blockers, scoreboard: counts, importStatus: { packsImported: opportunities.length, quarantined: 0 },
    opportunityRanking: opportunities.map(o => ({ score: o.score, opportunity: o })).sort((a, b) => (b.score || 0) - (a.score || 0)),
    approvalQueue: approvals, sendHandoffs: sendRecords, replies, proposals, payments, projects,
    monitoringOffers, experiments, providerHealth: [], schedulerHealth: { counts: {}, total: 0 }, auditLog
  });
  await fs.writeFile(outPath, html);
  console.log(`Wrote dashboard to ${outPath}`);
}

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));
  const storeDir = flags['store-dir'] || path.join(HERE, '..', '.local-store');
  const store = await loadStore(storeDir);
  if (command === 'status') return runStatus(store);
  if (command === 'render-dashboard') return runRenderDashboard(store, flags.out || path.join(HERE, '..', 'demo-output', 'owner-dashboard.html'));
  console.log('Usage: cli.mjs <status|render-dashboard> [--store-dir <dir>] [--out <path>]');
  process.exitCode = 1;
}

main().catch(error => { console.error(error); process.exitCode = 1; });
