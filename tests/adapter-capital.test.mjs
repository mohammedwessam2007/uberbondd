import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  compileAdapterManifest,
  evaluateAdapterAccess,
  prepareAdapterDryRun,
  logAdapterContractReceipt,
  ADAPTER_CONTRACT_POLICY_VERSION
} from '../src/adapter-contracts.mjs';
import {
  planCapitalAllocation,
  logCapitalAllocation,
  CAPITAL_ALLOCATOR_POLICY_VERSION
} from '../src/capital-allocator.mjs';
import { createJobHandlers } from '../src/job-handlers.mjs';

const date = new Date('2026-08-18T12:00:00.000Z');

function manifest(overrides = {}) {
  return compileAdapterManifest({
    adapterId: 'youtube.public', sourceKind: 'PUBLIC_PLATFORM', termsUrl: 'https://example.com/terms',
    purpose: 'Discover public commercial signals', allowedFields: ['title', 'url', 'observedAt'],
    capabilities: ['read-public-metadata'], killSwitch: true, date, ...overrides
  });
}

test('adapter manifests require terms, purpose, fields, and a default kill switch', () => {
  assert.equal(compileAdapterManifest({ adapterId: 'x', date }).ok, false);
  assert.equal(manifest({ killSwitch: false }).ok, false);
  const result = manifest();
  assert.equal(result.status, 'MANIFEST_ONLY');
  assert.equal(result.credentialsStored, false);
  assert.equal(result.liveAccessProven, false);
});

test('adapter access stays dry-run without explicit owner receipt', () => {
  const result = evaluateAdapterAccess({ manifest: manifest(), date });
  assert.equal(result.status, 'DRY_RUN_ONLY');
  assert.ok(result.reasonCodes.includes('owner-authorized-access-required'));
  assert.equal(result.networkCalls, 0);
  const authorized = evaluateAdapterAccess({ manifest: manifest({ authStatus: 'OWNER_AUTHORIZED' }), authorizationReceipt: { receiptId: 'auth-1' }, date });
  assert.equal(authorized.status, 'OWNER_AUTHORIZED_REVIEW_REQUIRED');
  assert.equal(authorized.liveAccess, 'EXTERNAL_PROOF_REQUIRED');
});

test('adapter dry-run bounds candidates and stores only digests', () => {
  const result = prepareAdapterDryRun({ manifest: manifest(), candidates: [{ id: 'a', secret: 'never-store' }, { id: 'b' }], maxCandidates: 1, date });
  assert.equal(result.status, 'DRY_RUN_PREPARED');
  assert.equal(result.boundedCount, 1);
  assert.equal(result.candidates[0].status, 'NOT_FETCHED');
  assert.equal(result.candidates[0].secret, undefined);
  assert.equal(result.networkCalls, 0);
});

test('capital plan refuses unknown budget or insufficient payment proof', () => {
  const unknown = planCapitalAllocation({ candidates: [], date });
  assert.equal(unknown.status, 'DO_NOT_ALLOCATE');
  const noProof = planCapitalAllocation({ candidates: [{ modelId: 'a', verifiedPaymentCount: 1, knownContributionMarginCents: 1000, buildCostCents: 100 }], availableBudgetCents: 1000, reserveCents: 100, date });
  assert.equal(noProof.status, 'DO_NOT_ALLOCATE');
  assert.equal(noProof.externalEffectLedger.spendCents, 0);
});

test('capital plan ranks measured candidates but never spends or approves', () => {
  const result = planCapitalAllocation({
    candidates: [
      { modelId: 'b', verifiedPaymentCount: 3, knownContributionMarginCents: 1000, buildCostCents: 500 },
      { modelId: 'a', verifiedPaymentCount: 4, knownContributionMarginCents: 1000, buildCostCents: 100 }
    ], availableBudgetCents: 1000, reserveCents: 200, maxAllocationCents: 300, date
  });
  assert.equal(result.status, 'PLAN_ONLY_OWNER_REVIEW');
  assert.equal(result.candidates[0].modelId, 'a');
  assert.equal(result.candidates[0].approval, 'OWNER_REQUIRED');
  assert.equal(result.allocation.actualSpendCents, 0);
  assert.equal(result.allocation.automatic, false);
});

test('handlers and receipts use canonical auditLog without provider or money effects', async () => {
  const calls = [];
  const handlers = createJobHandlers({ store: { log: async (type, detail) => { calls.push({ type, detail }); return { id: type }; } }, cfg: {} });
  const m = await handlers['prometheus.adapter.manifest']({ adapterId: 'x', sourceKind: 'PUBLIC', termsUrl: 'https://x.test/terms', purpose: 'test', allowedFields: ['url'], date });
  const dry = await handlers['prometheus.adapter.dry-run']({ manifest: m, candidates: [{ id: 'x' }], date });
  const cap = await handlers['prometheus.capital.plan']({ candidates: [{ modelId: 'a', verifiedPaymentCount: 3, knownContributionMarginCents: 100, buildCostCents: 10 }], availableBudgetCents: 100, reserveCents: 20, date });
  assert.equal(dry.ok, true);
  assert.equal(cap.ok, true);
  assert.deepEqual(calls.map(call => call.type), ['adapter_manifest', 'adapter_dry_run', 'capital_allocation_plan']);
});

test('receipt writers omit raw payloads and source modules have no I/O boundary', async () => {
  const calls = [];
  await logAdapterContractReceipt({ log: async (type, detail) => { calls.push({ type, detail }); return { id: 'a' }; } }, 'adapter_manifest', { ok: true, policyVersion: ADAPTER_CONTRACT_POLICY_VERSION, status: 'x', raw: 'secret' });
  await logCapitalAllocation({ log: async (type, detail) => { calls.push({ type, detail }); return { id: 'c' }; } }, { ok: true, policyVersion: CAPITAL_ALLOCATOR_POLICY_VERSION, status: 'x', raw: 'secret' });
  assert.equal(calls[0].detail.raw, undefined);
  assert.equal(calls[1].detail.raw, undefined);
  const adapterSource = await fs.readFile(new URL('../src/adapter-contracts.mjs', import.meta.url), 'utf8');
  const capitalSource = await fs.readFile(new URL('../src/capital-allocator.mjs', import.meta.url), 'utf8');
  for (const source of [adapterSource, capitalSource]) assert.doesNotMatch(source, /fetch\(|http\.request|https\.request|readFile\(|writeFile\(|spawn\(|exec\(|process\.env/);
});
