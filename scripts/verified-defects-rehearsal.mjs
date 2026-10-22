#!/usr/bin/env node
// Sale rehearsal for the Verified Inquiry-Path Defects mechanism: runs the
// exact sale protocol against real public websites with a recording ledger
// instead of a payment provider. Nothing is charged, sent or submitted.
//   node scripts/verified-defects-rehearsal.mjs --websites https://a.example/,https://b.example/ --out <file> [--first-seen <registry.json>]
// --first-seen is a finding registry this script maintains: every finding ever
// seen is re-verified on each run, so a fixed defect shows up as fixed.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { runVerifiedDefectsSale, inquiryReprobeVerifier } from '../src/inquiry-findings.mjs';
import { defectSurvival, reverifyFinding } from '../src/self-verifying-findings.mjs';
import { probeInquiryPath } from '../src/inquiry-path-probe.mjs';
import { witnessRuntimeTelLinks } from '../src/inquiry-path-runtime-witness.mjs';
import { createProcessChargeReservations } from '../src/charge-reservations.mjs';

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
  // One local process with a recording ledger: a single-process reservation is
  // the true guarantee here, and nothing reaches a payment provider.
  reservations: createProcessChargeReservations(),
  requiredGuarantee: 'ATOMIC_SINGLE_PROCESS',
  charge: async event => { recorded.push(event); return { status: 'CONFIRMED' }; },
  pushItem: async item => items.push(item)
});

// Decay observations. Every finding in the registry is re-verified now, not just
// the ones this run rediscovered: otherwise a fixed defect silently vanishes and
// survival is 1.0 by construction.
const registryPath = flag('first-seen');
const registry = registryPath && existsSync(registryPath) ? JSON.parse(readFileSync(registryPath, 'utf8')) : {};
const at = new Date().toISOString();
const deliveredIds = new Set(receipt.billingOutcomes.map(entry => entry.findingId));
const refusedOutcome = new Map(receipt.refusals.map(refusal => [refusal.findingId, refusal.outcome]));
for (const finding of receipt.discoveredFindings) registry[finding.id] ??= { finding, firstSeen: at };
const verifier = inquiryReprobeVerifier({ probe });
const observations = [];
for (const [id, { finding, firstSeen }] of Object.entries(registry)) {
  const outcome = deliveredIds.has(id) ? 'REPRODUCED' : refusedOutcome.get(id) ?? (await reverifyFinding(finding, verifier)).outcome;
  observations.push({ findingId: id, code: finding.code, firstSeen, verifiedAt: at, outcome });
}
if (registryPath) writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
const out = {
  schema: 'uberbond.verified-defects-sale-rehearsal.v1',
  mode: 'REHEARSAL_RECORDING_LEDGER_NO_PAYMENT_PROVIDER',
  receipt: { ...receipt, discoveredFindings: receipt.discoveredFindings.map(finding => finding.id) },
  deliveredItems: items,
  recordedChargeEvents: recorded.length,
  survivalObservations: observations.length,
  survival: defectSurvival(observations),
  revenueTier: 'NONE: recorded events are rehearsal decisions, not charges'
};
mkdirSync(dirname(flag('out')), { recursive: true });
writeFileSync(flag('out'), `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify({ websites: receipt.websites, discovered: receipt.discovered, delivered: receipt.delivered, wouldCharge: receipt.charged, refused: receipt.refused, notObservable: receipt.notObservable, defects: items.map(item => `${item.website} ${item.defect}`) }, null, 2));
