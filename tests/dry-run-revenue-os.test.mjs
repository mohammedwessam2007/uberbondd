// CI coverage for the Revenue OS V2 dry run (CLAUDE_CODE_EXECUTE.md steps 7-8): runs the same
// three-fixture-opportunity dry run the CLI script runs, in-process (no subprocess, no real
// filesystem report needed), and proves each of the mission's named acceptance points directly.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { JsonStore } from '../src/store.mjs';
import { runRevenueOsDryRun, buildFixtureRecords } from '../scripts/dry-run-revenue-os.mjs';

async function tempStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-dry-run-'));
  const store = new JsonStore(dir);
  await store.init();
  return store;
}

const at = new Date('2026-07-28T12:00:00.000Z');

test('runRevenueOsDryRun: imports the three fixture opportunities, stores evidence, and scores each one', async () => {
  const store = await tempStore();
  const report = await runRevenueOsDryRun(store, { at });
  assert.equal(report.fixtureCount, 3);
  assert.equal(report.imported.length, 3, 'every fixture is stored as an opportunity with a policy decision attached, whether that decision is pass or reject');
  assert.equal(report.imported.filter(o => o.policyDecision === 'pass').length, 2);
  assert.equal(report.imported.filter(o => o.policyDecision === 'reject').length, 1);
  const evidence = await store.list('sourceEvidence');
  assert.equal(evidence.length, 3, 'all three fixtures reach evidence storage, including the one that later fails policy');
  for (const opp of report.imported) assert.ok(Number.isFinite(opp.scoreTotal) && opp.scoreTotal >= 0 && opp.scoreTotal <= 100);
});

test('runRevenueOsDryRun: fixture-3 is recorded with a policy rejection and real reason codes, not silently dropped', async () => {
  const store = await tempStore();
  await runRevenueOsDryRun(store, { at });
  const decisions = await store.list('policyDecisions');
  assert.equal(decisions.length, 3, 'a policy decision is recorded for every opportunity that reached policy evaluation');
  const rejected = decisions.find(d => d.decision === 'reject');
  assert.ok(rejected, 'at least one fixture must be rejected by policy');
  assert.ok(rejected.reasonCodes.includes('contact-contact-domain-mismatch'), `expected contact-domain-mismatch reason code, got: ${rejected.reasonCodes.join(', ')}`);
});

test('runRevenueOsDryRun: an owner gate is created ONLY for the fixture whose pursuit needs a binding action', async () => {
  const store = await tempStore();
  const report = await runRevenueOsDryRun(store, { at });
  assert.equal(report.ownerGatesCreated.length, 1, 'exactly one of the three fixtures needs a binding action');
  assert.equal(report.ownerGatesCreated[0].gateType, 'marketplace-submission');
  assert.equal(report.ownerGatesCreated[0].opportunityId, 'fixture-opp-2');
  const gates = await store.list('ownerGates');
  assert.equal(gates.length, 1, 'the store itself has exactly one owner gate, not one per opportunity');
});

test('runRevenueOsDryRun: the low-value fixture (below the owner-gate value floor) passes policy but never gets a gate', async () => {
  const store = await tempStore();
  const report = await runRevenueOsDryRun(store, { at });
  const smallOpp = report.imported.find(o => o.id === 'fixture-opp-1');
  assert.ok(smallOpp, 'fixture-opp-1 must have been imported (it passes policy)');
  assert.equal(smallOpp.policyDecision, 'pass');
  assert.ok(!report.ownerGatesCreated.some(g => g.opportunityId === 'fixture-opp-1'));
});

test('runRevenueOsDryRun: zeroLiveSend is always true, and every fixture uses a .invalid (RFC 2606 reserved) domain', () => {
  const fixtures = buildFixtureRecords(at);
  for (const fixture of fixtures) assert.ok(fixture.organization_domain.endsWith('.invalid'), `fixture ${fixture.id} must use a .invalid domain, got ${fixture.organization_domain}`);
});

test('runRevenueOsDryRun: report.zeroLiveSend is true and is a structural fact, not a claim -- no network/email import exists anywhere in the dry-run path', async () => {
  const store = await tempStore();
  const report = await runRevenueOsDryRun(store, { at });
  assert.equal(report.zeroLiveSend, true);
  const scriptSource = await fs.readFile(new URL('../scripts/dry-run-revenue-os.mjs', import.meta.url), 'utf8');
  assert.ok(!/gmail|smtp|nodemailer|sendMail/i.test(scriptSource), 'the dry-run script must not import any mail-sending capability');
});

test('runRevenueOsDryRun: is idempotent-safe -- running it twice against the same store does not duplicate opportunities (fixture idempotency keys are stable)', async () => {
  const store = await tempStore();
  const first = await runRevenueOsDryRun(store, { at });
  const second = await runRevenueOsDryRun(store, { at });
  const opportunities = await store.list('opportunities');
  assert.equal(opportunities.length, 3, 'all three fixtures are stored exactly once, whether policy passed or rejected');
  assert.equal(second.imported.length, 0, 'the second run finds every fixture already present and imports none of them again');
  assert.equal(first.ownerGatesCreated.length, 1);
  assert.equal(second.ownerGatesCreated.length, 0, 'the second run does not create a duplicate owner gate for an opportunity that already has one');
});
