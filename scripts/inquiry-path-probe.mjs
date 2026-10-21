#!/usr/bin/env node
// Read-only Inquiry Path Coherence probe.
//   node scripts/inquiry-path-probe.mjs --website https://example.com --name "Example Co" --out <dir>
//   node scripts/inquiry-path-probe.mjs --cohort artifacts/research/uberwarm-cohorts/<file>.json --out <dir> [--runtime]
// Writes one JSON receipt and one Markdown snapshot per site. Sends nothing.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { probeInquiryPath } from '../src/inquiry-path-probe.mjs';
import { witnessRuntimeTelLinks } from '../src/inquiry-path-runtime-witness.mjs';

// --runtime adds the headless-browser second witness for contested call buttons.
const witnessImpl = process.argv.includes('--runtime') ? witnessRuntimeTelLinks : null;

const args = process.argv.slice(2);
const flag = name => { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : null; };
const out = flag('out');
if (!out) { console.error('--out <dir> is required'); process.exit(2); }

const targets = flag('cohort')
  ? JSON.parse(readFileSync(flag('cohort'), 'utf8')).researchCandidates.map(item => ({ id: item.id, name: item.business, website: item.website }))
  : [{ id: flag('id') ?? 'site', name: flag('name'), website: flag('website') }];
if (targets.some(target => !target.website)) { console.error('--website or --cohort is required'); process.exit(2); }

mkdirSync(out, { recursive: true });
const summary = [];
for (const target of targets) {
  const receipt = await probeInquiryPath({ website: target.website, business: { id: target.id, name: target.name, website: target.website }, maxPages: Number(flag('max-pages') ?? 5), witnessImpl });
  writeFileSync(join(out, `${target.id}.json`), `${JSON.stringify(receipt, null, 2)}\n`);
  writeFileSync(join(out, `${target.id}.md`), `${receipt.snapshotMarkdown}\n`);
  summary.push({ id: target.id, name: target.name, verdict: receipt.analysis.verdict, findings: receipt.analysis.findings.map(item => `${item.code}:${item.firstTouchUse}`), pages: receipt.pages.length, refusals: receipt.refusals.length, ledger: receipt.readOnlyLedger });
}
console.log(JSON.stringify(summary, null, 2));
