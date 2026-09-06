#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { allocateSovereignCompute, normalizeComputeOffer } from '../src/compute-sovereignty.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const arg = process.argv[i];
  if (!arg.startsWith('--')) continue;
  const next = process.argv[i + 1];
  args.set(arg, next && !next.startsWith('--') ? process.argv[++i] : true);
}

function safeJson(raw) { try { return JSON.parse(String(raw || '')); } catch { return null; } }
function loadOffers() {
  const file = args.get('--offers');
  if (file) {
    try {
      const parsed = JSON.parse(fs.readFileSync(path.resolve(root, String(file)), 'utf8'));
      return Array.isArray(parsed) ? parsed : Array.isArray(parsed?.offers) ? parsed.offers : [];
    } catch { return []; }
  }
  const parsed = safeJson(process.env.UBERBOND_COMPUTE_OFFERS_JSON);
  return Array.isArray(parsed) ? parsed : Array.isArray(parsed?.offers) ? parsed.offers : [];
}

const offers = loadOffers();
const normalized = offers.map(normalizeComputeOffer);
const admissible = normalized.filter(item => item.ok);
const blocked = normalized.filter(item => !item.ok);
const taskClasses = [...new Set(admissible.flatMap(item => item.taskClasses || []))].sort();
const zeroCostTokens = admissible.filter(item => item.costCents === 0).reduce((sum, item) => sum + item.usableTokens, 0);
const paidTokens = admissible.filter(item => item.costCents > 0).reduce((sum, item) => sum + item.usableTokens, 0);
const probeTaskClass = String(args.get('--task-class') || 'general').trim().toLowerCase();
const requestedTokens = Math.max(1, Number(args.get('--tokens') || 1_000_000));
const allocation = admissible.length
  ? allocateSovereignCompute({ taskClass: probeTaskClass, offers, requiredTokens: Math.min(10_000_000_000, Math.floor(requestedTokens)), preferZeroCost: true })
  : { ok: false, status: 'COMPUTE_CAPACITY_BLOCKED', reasonCodes: ['no-admissible-compute-supply'] };

const report = {
  schemaVersion: 'uberbond.compute-sovereignty-doctor.v1',
  generatedAt: new Date().toISOString(),
  offerCount: offers.length,
  admissibleOfferCount: admissible.length,
  rejectedOfferCount: blocked.length,
  taskClasses,
  zeroCostTokens,
  paidTokens,
  allocationProbe: allocation,
  rejectedReasonCodes: [...new Set(blocked.flatMap(item => item.reasonCodes || []))],
  supplyTruth: admissible.map(item => ({ offerId: item.offerId, provider: item.provider, model: item.model, revision: item.revision, rightsClass: item.rightsClass, usableTokens: item.usableTokens, costCents: item.costCents, sourceRef: item.sourceRef, verifiedAt: item.verifiedAt })),
  status: admissible.length ? 'COMPUTE_SOVEREIGNTY_SUPPLY_OBSERVED' : 'COMPUTE_SOVEREIGNTY_NO_PROVEN_SUPPLY',
  businessEffectAuthority: 'NONE',
  externalEffectAuthority: 'NONE',
  truthBoundary: 'NO OFFER IS INVENTED BY THIS DOCTOR. ABSENT PROVENANCED AUTHORIZED SUPPLY, CAPACITY REMAINS ZERO. FREE-TOKEN TARGETS ARE OPTIMIZATION GOALS, NOT ENTITLEMENTS.'
};

const output = args.get('--output');
if (output) {
  const target = path.resolve(root, String(output));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
