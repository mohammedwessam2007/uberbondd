// CI coverage for the Revenue OS V2 preview + commit demonstration (PR #6 repair): runs the same
// fixture batch the CLI script runs, in-process, and proves preview writes zero durable business
// records while commit persists exactly what preview predicted, including the owner gate linked to
// the one fixture that needs a binding action.
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

test('runRevenueOsDryRun: preview predicts two accepted opportunities, one policy rejection, and one owner gate', async () => {
  // runRevenueOsDryRun runs preview THEN commit against the same store in one call (by design --
  // it demonstrates the real CLI workflow), so store state can't be inspected mid-way through a
  // single call; preview's "writes nothing" guarantee is proven directly, against a store that
  // never sees a commit call at all, by commercial-intelligence-import.test.mjs's preview-mode
  // tests. This test only checks preview's own predicted report shape.
  const store = await tempStore();
  const report = await runRevenueOsDryRun(store, { at });
  assert.equal(report.fixtureCount, 4);
  assert.equal(report.preview.durableWrites, false);
  assert.equal(report.preview.accepted.length, 2);
  assert.equal(report.preview.policyRejected.length, 1);
  assert.equal(report.preview.ownerGatesCreated.length, 1);
});

test('runRevenueOsDryRun: commit persists exactly what preview predicted', async () => {
  const store = await tempStore();
  const report = await runRevenueOsDryRun(store, { at });
  assert.equal(report.commit.durableWrites, true);
  assert.equal(report.commit.accepted.length, 2);
  assert.equal(report.commit.policyRejected.length, 1);
  assert.equal(report.commit.ownerGatesCreated.length, 1);
  const evidence = await store.list('sourceEvidence');
  assert.equal(evidence.length, 3, 'all three opportunity fixtures reach evidence storage, including the one that later fails policy');
  const opportunities = await store.list('opportunities');
  assert.equal(opportunities.length, 3);
  const gates = await store.list('ownerGates');
  assert.equal(gates.length, 1);
  assert.equal(gates[0].opportunityId, 'fixture-opp-2');
});

test('runRevenueOsDryRun: fixture-3 is recorded with a policy rejection and the canonical contact-domain-mismatch reason code, not a double-prefixed one', async () => {
  const store = await tempStore();
  await runRevenueOsDryRun(store, { at });
  const decisions = await store.list('policyDecisions');
  assert.equal(decisions.length, 3, 'a policy decision is recorded for every opportunity that reached policy evaluation');
  const rejected = decisions.find(d => d.decision === 'reject');
  assert.ok(rejected, 'at least one fixture must be rejected by policy');
  assert.ok(rejected.reasonCodes.includes('contact-domain-mismatch'), `expected the canonical contact-domain-mismatch reason code, got: ${rejected.reasonCodes.join(', ')}`);
  assert.ok(!rejected.reasonCodes.includes('contact-contact-domain-mismatch'));
});

test('runRevenueOsDryRun: an owner gate is created ONLY for the fixture whose pursuit needs a binding action', async () => {
  const store = await tempStore();
  const report = await runRevenueOsDryRun(store, { at });
  assert.equal(report.commit.ownerGatesCreated.length, 1, 'exactly one of the three opportunity fixtures needs a binding action');
  assert.equal(report.commit.ownerGatesCreated[0].gateType, 'marketplace-submission');
  assert.equal(report.commit.ownerGatesCreated[0].opportunityId, 'fixture-opp-2');
});

test('runRevenueOsDryRun: the low-value fixture (below the owner-gate value floor) passes policy but never gets a gate', async () => {
  const store = await tempStore();
  const report = await runRevenueOsDryRun(store, { at });
  const smallOpp = report.commit.accepted.find(o => o.id === 'fixture-opp-1');
  assert.ok(smallOpp, 'fixture-opp-1 must have been accepted (it passes policy)');
  assert.ok(!report.commit.ownerGatesCreated.some(g => g.opportunityId === 'fixture-opp-1'));
});

test('runRevenueOsDryRun: report.zeroLiveSend is true, and no mail-sending capability is imported anywhere in the dry-run path', async () => {
  const store = await tempStore();
  const report = await runRevenueOsDryRun(store, { at });
  assert.equal(report.zeroLiveSend, true);
  const scriptSource = await fs.readFile(new URL('../scripts/dry-run-revenue-os.mjs', import.meta.url), 'utf8');
  assert.ok(!/gmail|smtp|nodemailer|sendMail/i.test(scriptSource), 'the dry-run script must not import any mail-sending capability');
});

test('runRevenueOsDryRun: is idempotent-safe -- running it twice against the same store does not duplicate opportunities or gates', async () => {
  const store = await tempStore();
  const first = await runRevenueOsDryRun(store, { at });
  const second = await runRevenueOsDryRun(store, { at });
  const opportunities = await store.list('opportunities');
  assert.equal(opportunities.length, 3, 'all three fixtures are stored exactly once, whether policy passed or rejected');
  assert.equal(second.commit.accepted.length + second.commit.policyRejected.length, 0, 'the second commit finds every opportunity fixture already present and imports none of them again');
  assert.equal(first.commit.ownerGatesCreated.length, 1);
  assert.equal(second.commit.ownerGatesCreated.length, 0, 'the second commit does not create a duplicate owner gate for an opportunity that already has one');
});

test('buildFixtureRecords: every opportunity fixture uses a .invalid (RFC 2606 reserved) domain', () => {
  const fixtures = buildFixtureRecords(at).filter(f => f.record_type === 'opportunity');
  assert.equal(fixtures.length, 3);
  for (const fixture of fixtures) assert.ok(fixture.organization_domain.endsWith('.invalid'), `fixture ${fixture.id} must use a .invalid domain, got ${fixture.organization_domain}`);
});
