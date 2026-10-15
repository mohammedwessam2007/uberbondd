import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const v1=JSON.parse(readFileSync(new URL('../artifacts/outreach/phoenix-h10-20261015-30-gate-falsifier.json',import.meta.url)));
const v2=JSON.parse(readFileSync(new URL('../artifacts/outreach/phoenix-high-session-20261015-30-gate-reconciled.json',import.meta.url)));
test('updated version preserves all 30 original gate identities and historical evidence without erasing entries',()=>{
  assert.equal(v2.gates.length,30);assert.deepEqual(v2.gates.map(g=>g.id),v1.gates.map(g=>g.id));
  for(const previous of v1.gates){const after=v2.gates.find(g=>g.id===previous.id);
    for(const run of previous.source_test_run_ids) assert.ok(after.source_test_run_ids.includes(run),previous.id);
    assert.equal(after.source_test_verdict,after.source_test_run_ids.length?'SCOPE_LIMITED_PASS':'NOT_VERIFIED_IN_THIS_SESSION');
    assert.ok(after.source_test_run_ids.every(x=>/^\d{11}$/.test(x)),after.id);
  }
});
test('newest security host receipts are source-only and cannot promote production, provider, permission or cash',()=>{
  const m=new Map(v2.gates.map(g=>[g.id,g]));
  assert.ok(m.get('N23').source_test_run_ids.includes('38659225987'));
  assert.ok(m.get('N24').source_test_run_ids.includes('38659219498'));
  assert.ok(m.get('N26').source_test_run_ids.includes('38634589923'));
  assert.equal(v2.released_source_candidate_sha,'15a43485cf5adc5873bc5e4f6bdd97fc5563817b');
  assert.notEqual(v2.released_source_candidate_sha,v2.deployed_render_sha);
  for(const gate of v2.gates){assert.equal(gate.cleared_external_gate,false,gate.id);assert.equal(gate.current_production_verified,false,gate.id);
    assert.equal(gate.current_provider_verified,false,gate.id);assert.equal(gate.legal_and_owner_authority_verified,false,gate.id);}
});
test('Render original account, historical backup and empty second restore target stay explicit',()=>{
  assert.equal(v2.render_db_deadline_utc,'2026-10-16T23:22:29.055606Z');
  assert.equal(v2.historical_neon_digest_tables_matched,57);
  assert.equal(v2.historical_neon_digest_rows_matched,1259);
  assert.equal(v2.historical_archive_byte_sha256_verified,3);
  assert.equal(v2.source_current_backup_verified,false);
  assert.equal(v2.original_runtime_key_verified,false);
  assert.equal(v2.latest_live_observation.neon_rehearsal_v2_public_tables,0);
  assert.equal(v2.latest_live_observation.source_current_query_via_connector,'BLOCKED_BY_EMPTY_EXTERNAL_ALLOWLIST');
  assert.match(v2.restored_snapshot_proof,/HISTORICAL/);
});
test('no real sender, protected fleet import, delivered campaign or paid client is invented',()=>{
  assert.deepEqual(v2.approved_send_set,[]);
  assert.equal(v2.current_winnr_50plus3_import_verified,false);
  for(const key of ['lawful_contact_route_verified','exact_send_approval_verified','live_sending_proven','independent_receiver_proven','cleared_revenue_proven'])assert.equal(v2[key],false,key);
  assert.equal(v2.campaign_state,'HELD_NO_APPROVED_RECIPIENT');
  assert.equal(v2.release_state,'HELD_NOT_DEPLOYED');
  assert.equal(v2.economic_state,'UNKNOWN_NOT_CLEARED');
});
