import { config } from '../src/config.mjs';
import { createStore } from '../src/store.mjs';
import { evaluateSendEligibility } from '../src/send-safety.mjs';

const assumeLive = String(process.env.OUTREACH_DRY_RUN_ASSUME_LIVE || '').toLowerCase() === 'true';
const evaluationConfig = assumeLive ? {
  ...config,
  outbound: { ...config.outbound, enabled: true, dryRun: false }
} : config;
const at = new Date(process.env.OUTREACH_DRY_RUN_DATE || Date.now());
if (!Number.isFinite(at.getTime())) throw new Error('OUTREACH_DRY_RUN_DATE must be a valid timestamp');

const store = createStore(config);
await store.init();
try {
  const prospects = await store.list('prospects');
  const campaigns = new Map((await store.list('campaigns')).map(campaign => [campaign.id, campaign]));
  const rows = [];
  for (const prospect of prospects) {
    if (!['ready', 'research-complete', 'sent'].includes(prospect.status)) continue;
    const campaign = campaigns.get(prospect.campaignId);
    if (!campaign) {
      rows.push({ prospectId: prospect.id, company: prospect.company, eligible: false, reason: 'campaign-not-found' });
      continue;
    }
    const result = evaluateSendEligibility({
      prospect,
      campaign,
      cfg: evaluationConfig,
      date: at,
      followup: 0
    });
    rows.push({
      prospectId: prospect.id,
      company: prospect.company,
      recipient: prospect.contact?.email || '',
      eligible: result.ok === true,
      reason: result.ok ? 'eligible' : result.reason,
      routeType: prospect.outreachRoute?.routeType || '',
      approvalId: prospect.outreachApproval?.approvalId || ''
    });
  }
  const reasonCounts = rows.reduce((counts, row) => {
    counts[row.reason] = (counts[row.reason] || 0) + 1;
    return counts;
  }, {});
  process.stdout.write(`${JSON.stringify({
    schemaVersion: 'uberbond.outreach-dry-run.v1',
    evaluatedAt: at.toISOString(),
    assumedLiveFlags: assumeLive,
    provider: evaluationConfig.outbound.provider,
    launchPhase: evaluationConfig.outbound.launchPhase,
    total: rows.length,
    eligible: rows.filter(row => row.eligible).length,
    blocked: rows.filter(row => !row.eligible).length,
    reasonCounts,
    rows
  }, null, 2)}\n`);
} finally {
  await store.close();
}
