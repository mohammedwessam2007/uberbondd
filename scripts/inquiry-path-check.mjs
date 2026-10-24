#!/usr/bin/env node
// Buyer-nominated inquiry-path check against the buyer's declared numbers.
//   node scripts/inquiry-path-check.mjs --site https://example.com --declare "5125552671:main line" [--declare ...] --out-dir <dir> [--max-pages 5] [--no-witness]
// Read-only: robots-respecting public GETs through the existing probe. No form
// is submitted, nothing is sent, nothing is charged.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { probeInquiryPath } from '../src/inquiry-path-probe.mjs';
import { extractInquirySurface } from '../src/inquiry-path-coherence.mjs';
import { reconcileDeclaredNumbers, renderDeclaredNumberReport } from '../src/declared-number-reconciliation.mjs';
import { readBoundedResponseClone } from '../src/inquiry-path-bounded-capture.mjs';

const args = process.argv.slice(2);
const values = name => args.flatMap((arg, i) => (arg === `--${name}` ? [args[i + 1]] : []));
const site = values('site')[0];
const outDir = values('out-dir')[0];
const maxPages = Number(values('max-pages')[0] ?? 5);
const declared = values('declare').map(entry => { const [number, ...purpose] = String(entry).split(':'); return { number, purpose: purpose.join(':') || 'business line' }; });
if (!site || !outDir || !declared.length || !Number.isInteger(maxPages) || maxPages < 1 || maxPages > 10) { console.error('--site, --out-dir, at least one --declare and --max-pages 1..10 are required'); process.exit(2); }

// Capture only a bounded clone: the site may supply untrusted large bodies.
const bodies = new Map();
const capturingFetch = async (url, init) => {
  const response = await fetch(url, init);
  if ((init?.method ?? 'GET') === 'GET' && response.status >= 200 && response.status < 300) {
    bodies.set(String(url), readBoundedResponseClone(response.clone()).catch(() => null));
  }
  return response;
};
// The browser witness needs Playwright; load it only when it is wanted.
const witnessImpl = args.includes('--no-witness') ? null : (await import('../src/inquiry-path-runtime-witness.mjs')).witnessRuntimeTelLinks;
const result = await probeInquiryPath({ website: site, maxPages, fetchImpl: capturingFetch, witnessImpl });
if (!result.ok) { console.error(JSON.stringify(result, null, 2)); process.exit(1); }
const surfaces = [];
for (const page of result.pages) {
  const html = await bodies.get(page.url);
  if (html == null) continue;
  const surface = extractInquirySurface({ url: page.url, html, fetchedAt: page.fetchedAt, status: page.status });
  if (surface.sourceSha256 === page.sourceSha256) surfaces.push(surface); // only bytes the probe itself analysed
}
const reconciliation = reconcileDeclaredNumbers({ pages: surfaces, declared });
if (reconciliation.verdict === 'CLEAN' && (result.refusals.length || result.pages.length !== surfaces.length)) reconciliation.verdict = 'PARTIAL';
const report = renderDeclaredNumberReport(reconciliation, { site, checkedAt: result.observedAt, pathDefects: result.analysis.findings, refusals: result.refusals });
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'report.md'), report);
writeFileSync(join(outDir, 'receipt.json'), `${JSON.stringify({ schema: 'uberbond.inquiry-path-check.v1', site, observedAt: result.observedAt, pages: result.pages, surfacesMatched: surfaces.length, refusals: result.refusals, reconciliation, standardFindings: result.analysis.findings.map(f => ({ code: f.code, title: f.title })), readOnlyLedger: result.readOnlyLedger, runtimeWitness: result.runtimeWitness, businessEffectAuthority: 'NONE' }, null, 2)}\n`);
console.log(JSON.stringify({ verdict: reconciliation.verdict, pagesChecked: reconciliation.pagesChecked, surfacesMatched: surfaces.length, probePages: result.pages.length, findings: reconciliation.findings.map(f => f.code), ledger: result.readOnlyLedger }, null, 2));
