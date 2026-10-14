import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ledger = JSON.parse(readFileSync(new URL('../artifacts/outreach/phoenix-h10-20261015-30-gate-falsifier.json', import.meta.url), 'utf8'));
const gateById = new Map(ledger.gates.map(gate => [gate.id, gate]));
const highRisk = ['N09','N10','N11','N12','N13','N14','N20','N21','N22','N23','N24','N25','N26','N27','N28'];

test('N01-N30 are present once, with external unknowns explicit rather than silently closed', () => {
  const ids = Array.from({ length: 30 }, (_, i) => 'N' + String(i + 1).padStart(2, '0'));
  assert.deepEqual([...gateById.keys()].sort(), ids.sort());
  assert.equal(gateById.size, 30);
  for (const gate of ledger.gates) {
    assert.ok(gate.layer && gate.blocker);
    assert.ok(Array.isArray(gate.source_test_run_ids));
    assert.equal(gate.source_test_verdict, gate.source_test_run_ids.length ? 'SCOPE_LIMITED_PASS' : 'NOT_VERIFIED_IN_THIS_SESSION');
    assert.ok(gate.source_test_run_ids.every(id => /^[0-9]{11}$/.test(id)));
    if (!gate.cleared_external_gate) assert.ok(gate.blocker.length > 10);
  }
});

test('test-pass receipts cannot self-promote to deploy, provider approval, recipient or cleared revenue', () => {
  for (const id of highRisk) {
    const gate = gateById.get(id);
    assert.equal(gate.cleared_external_gate, false, id);
    assert.equal(gate.current_production_verified, false, id);
    assert.equal(gate.current_provider_verified, false, id);
    assert.equal(gate.legal_and_owner_authority_verified, false, id);
  }
  assert.notEqual(ledger.released_source_candidate_sha, ledger.deployed_render_sha);
  assert.equal(ledger.release_state, 'HELD_NOT_DEPLOYED');
  assert.equal(ledger.campaign_state, 'HELD_NO_APPROVED_RECIPIENT');
});

test('historic 57-table replay does not become source-current database/key/app proof', () => {
  assert.equal(ledger.historical_neon_digest_tables_matched, 57);
  assert.equal(ledger.historical_neon_digest_rows_matched, 1259);
  assert.equal(ledger.historical_archive_byte_sha256_verified, 3);
  assert.equal(ledger.source_current_backup_verified, false);
  assert.equal(ledger.original_runtime_key_verified, false);
  assert.ok(Date.parse(ledger.historical_neon_snapshot_utc) < Date.parse(ledger.render_db_deadline_utc));
  assert.equal(gateById.get('N26').cleared_external_gate, false);
});

test('cold send and economic effects stay impossible with no exact approval or recipient', () => {
  assert.deepEqual(ledger.approved_send_set, []);
  assert.equal(ledger.lawful_contact_route_verified, false);
  assert.equal(ledger.exact_send_approval_verified, false);
  assert.equal(ledger.live_sending_proven, false);
  assert.equal(ledger.independent_receiver_proven, false);
  assert.equal(ledger.cleared_revenue_proven, false);
  assert.equal(ledger.economic_state, 'UNKNOWN_NOT_CLEARED');
  assert.equal(gateById.get('N28').cleared_external_gate, false);
  assert.equal(gateById.get('N29').cleared_external_gate, false);
});

test('green CI and the finished synthetic donor suites remain source evidence only', () => {
  assert.ok(gateById.get('N24').source_test_run_ids.includes('38647116178'));
  assert.ok(gateById.get('N13').source_test_run_ids.includes('38635683660'));
  assert.ok(gateById.get('N22').source_test_run_ids.includes('38647325463'));
  assert.ok(gateById.get('N06').source_test_run_ids.includes('38647697536'));
  assert.ok(gateById.get('N19').source_test_run_ids.includes('38648144118'));
  assert.ok(ledger.gates.every(g => !g.cleared_external_gate));
});
