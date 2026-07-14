// Cash Engine Lite worker — executed by .github/workflows/lite-audits.yml.
// Reuses the production Playwright crawler and deterministic audit rules from
// the repository root (the full repo is checked out inside GitHub Actions).
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { crawlSiteBrowser } from '../../src/browser-crawler.mjs';
import { deterministicAudit } from '../../src/audit-rules.mjs';
import {
  q, ensureSchema, closePool, sweepStaleRequests, claimNextAudit,
  completeAudit, failAudit, pendingLeads, markLeadNotified
} from '../lib/db.mjs';
import { buildReport } from '../lib/report.mjs';
import { sendOwnerEmail, formatPendingLeadLog } from '../lib/email.mjs';

const MAX_ATTEMPTS = Math.max(1, Number(process.env.LITE_MAX_ATTEMPTS || 2));
const MAX_PER_RUN = Math.max(1, Number(process.env.LITE_MAX_AUDITS_PER_RUN || 3));
const STALE_MINUTES = Math.max(5, Number(process.env.LITE_STALE_MINUTES || 20));
const MAX_PAGES = Math.max(1, Math.min(8, Number(process.env.LITE_MAX_PAGES || 5)));

async function runOneAudit(item) {
  const shotsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lite-shots-'));
  try {
    const crawl = await crawlSiteBrowser(item.website_url, {
      maxPages: MAX_PAGES,
      delayMs: 400,
      timeoutMs: 25_000,
      screenshotDir: shotsDir // ephemeral; the stored report is text + JSON only
    });
    if (!crawl.pages.length) {
      const first = crawl.errors?.[0];
      throw new Error(first?.error || (first?.status ? `HTTP ${first.status}` : 'No public pages could be crawled'));
    }
    const findings = deterministicAudit(crawl, {});
    const report = buildReport(crawl, findings);
    await completeAudit(q, {
      requestId: item.id,
      domain: item.domain,
      score: report.score,
      summary: report.summary,
      findings: report.findings
    });
    console.log(`[lite] done ${item.domain} — score ${report.score} (${report.grade}), ${report.findings.length} findings, ${report.summary.pagesVisited} pages`);
    return true;
  } finally {
    await fs.rm(shotsDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function notifyLeads() {
  const leads = await pendingLeads(q, 20);
  if (!leads.length) return;
  for (const lead of leads) {
    // Actions logs may be visible to repository collaborators or the public.
    // Never print lead email, name, or message; PostgreSQL remains the source.
    console.log(formatPendingLeadLog(lead));
    const result = await sendOwnerEmail({
      subject: `New implementation lead — ${lead.domain}`,
      text: [
        `Website: ${lead.domain} (${lead.website_url})`,
        `Lead email: ${lead.email}`,
        lead.name ? `Name: ${lead.name}` : null,
        lead.message ? `Message:\n${lead.message}` : null
      ].filter(Boolean).join('\n')
    });
    if (result.ok) {
      await markLeadNotified(q, lead.id);
      console.log(`[lite] lead ${lead.id} emailed to owner`);
    } else if (result.skipped) {
      console.log(`[lite] lead email skipped (${result.reason}) — the lead above is stored in PostgreSQL`);
    } else {
      console.warn(`[lite] lead email failed (${result.status || ''} ${result.error || ''}) — will retry next run`);
    }
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log('[lite] DATABASE_URL is not set. Add the LITE_DATABASE_URL repository secret to activate scheduled audits. Nothing to do.');
    return;
  }
  await ensureSchema();
  const staleBefore = new Date(Date.now() - STALE_MINUTES * 60_000);
  const swept = await sweepStaleRequests(q, { staleBefore, maxAttempts: MAX_ATTEMPTS });
  if (swept) console.log(`[lite] marked ${swept} stale run(s) as failed`);

  let done = 0, failed = 0;
  for (let i = 0; i < MAX_PER_RUN; i++) {
    const item = await claimNextAudit(q, { staleBefore, maxAttempts: MAX_ATTEMPTS });
    if (!item) break;
    console.log(`[lite] auditing ${item.domain} (attempt ${item.attempts}/${MAX_ATTEMPTS})`);
    try {
      await runOneAudit(item);
      done++;
    } catch (error) {
      failed++;
      console.error(`[lite] audit failed for ${item.domain}: ${error.message}`);
      const status = await failAudit(q, { requestId: item.id, error: error.message, maxAttempts: MAX_ATTEMPTS });
      console.error(`[lite] ${item.domain} → ${status === 'failed' ? 'failed permanently' : 'requeued for retry'}`);
    }
  }

  await notifyLeads();
  console.log(`[lite] run complete — ${done} done, ${failed} failed this run`);
}

main()
  .catch(error => {
    console.error('[lite] worker infrastructure error:', error);
    process.exitCode = 1;
  })
  .finally(() => closePool().catch(() => {}));
