#!/usr/bin/env node
// Sale rehearsal for the Verified Inquiry-Path Defects mechanism: runs the
// exact sale protocol against real public websites with a recording ledger
// instead of a payment provider. Nothing is charged, sent or submitted.
//   node scripts/verified-defects-rehearsal.mjs --websites https://a.example/,https://b.example/ --out <file> [--first-seen <file>]
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { runVerifiedDefectsSale } from '../src/inquiry-findings.mjs';
import { defectSurvival } from '../src/self-verifying-findings.mjs';
import { probeInquiryPath } from '../src/inquiry-path-probe.mjs';
import { witnessRuntimeTelLinks } from '../src/inquiry-path-runtime-witness.mjs';

const args = process.argv.slice(2);
const flag = name => { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : null; };
const websites = (flag('websites') ?? '').split(',').filter(Boolean);
if (!websites.length || !flag('out')) { console.error('--websites and --out are required'); process.exit(2); }

const recorded = [];
const items = [];
const probe = website => probeInquiryPath({ website, maxPages: 5, witnessImpl: witnessRuntimeTelLinks });
const receipt = await runVerifiedDefectsSale({
  buyerId: 'rehearsal-no-payment',
  websites,
  probe,
  verifyProbe: probe,
  pricePerVerifiedCents: 50,
  charge: async event => { recorded.push(event); return { ok: true }; },
  pushItem: async item => items.push(item)
});

// Decay observations: findings first seen in an earlier receipt and re-verified now.
const firstSeen = flag('first-seen') && existsSync(flag('first-seen')) ? JSON.parse(readFileSync(flag('first-seen'), 'utf8')) : {};
const observations = [
  ...items.map(item => ({ code: item.defect, firstSeen: firstSeen[`${item.website}|${item.claim}`] ?? item.verifiedAt, verifiedAt: item.verifiedAt, outcome: 'REPRODUCED' })),
  ...receipt.refusals.map(refusal => ({ code: 'UNKNOWN', firstSeen: new Date().toISOString(), verifiedAt: new Date().toISOString(), outcome: refusal.outcome }))
];
const out = {
  schema: 'uberbond.verified-defects-sale-rehearsal.v1',
  mode: 'REHEARSAL_RECORDING_LEDGER_NO_PAYMENT_PROVIDER',
  receipt,
  deliveredItems: items,
  recordedChargeEvents: recorded.length,
  survival: defectSurvival(observations),
  revenueTier: 'NONE: recorded events are rehearsal decisions, not charges'
};
mkdirSync(dirname(flag('out')), { recursive: true });
writeFileSync(flag('out'), `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify({ websites: receipt.websites, discovered: receipt.discovered, delivered: receipt.delivered, wouldCharge: receipt.charged, refused: receipt.refused, notObservable: receipt.notObservable, defects: items.map(item => `${item.website} ${item.defect}`) }, null, 2));
