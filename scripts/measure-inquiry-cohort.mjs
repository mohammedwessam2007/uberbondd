import fs from 'node:fs';
import crypto from 'node:crypto';
import { probeInquiryPath } from '../src/inquiry-path-probe.mjs';
const manifest = JSON.parse(fs.readFileSync('artifacts/commercialization/frozen-40-home-service-sites-2026-10.json', 'utf8'));
const hash = crypto.createHash('sha256').update(manifest.sites.join('\n')).digest('hex');
if (hash !== manifest.websiteListSha256 || manifest.sites.length !== 40) throw Error('FROZEN_COHORT_MUTATED');
const records = Array(manifest.siteCount);
let cursor = 0;
const startedAt = new Date().toISOString();
await Promise.all(Array.from({ length: 3 }, async () => {
  for (;;) {
    const index = cursor++;
    if (index >= manifest.sites.length) break;
    const website = manifest.sites[index];
    const before = Date.now();
    let result;
    try { result = await probeInquiryPath({ website, maxPages: 2, maxSiteMs: 12000, witnessImpl: null }); }
    catch (error) { result = { ok: false, website, refusals: [{ reason: error?.name ?? 'ERROR', detail: String(error?.code ?? '') }], pages: [], analysis: { verdict: 'NOT_OBSERVABLE_FROM_STATIC_HTML', findings: [] }, runtimeMetrics: { wallClockMs: Date.now() - before, peakRssBytes: process.memoryUsage().rss, pagesFetched: 0, outcome: 'EXCEPTION' } }; }
    records[index] = { index, website, observedAt: result.observedAt ?? new Date().toISOString(), verdict: result.analysis?.verdict ?? 'UNKNOWN', findings: (result.analysis?.findings ?? []).map(f => ({ code: f.code, title: f.title, firstTouchUse: f.firstTouchUse, evidence: f.evidence, disproof: f.thirtySecondDisproof })), questions: result.analysis?.questions?.length ?? 0, refusals: result.refusals ?? [], pages: result.pages ?? [], metrics: result.runtimeMetrics, ledger: result.readOnlyLedger ?? null };
    process.stderr.write(`cohort ${index+1}/40 ${website} pages=${records[index].pages.length} findings=${records[index].findings.length}\n`);
  }
}));
fs.writeFileSync('artifacts/commercialization/field-cohort-40-2026-10.json', JSON.stringify({ schema: 'uberbond.field-cohort-40.readonly.v1', startedAt, finishedAt: new Date().toISOString(), frozenSha256: hash, memoryProfile: process.env.UBERBOND_MEMORY_PROFILE ?? 'UNSPECIFIED', browserWitness: false, records, caveat: 'Automated static probe only; no human independent validation, unknown representativeness. Not chargeable.' }, null, 2) + '\n');
console.log(`Recorded ${records.length} read-only outcomes`);
