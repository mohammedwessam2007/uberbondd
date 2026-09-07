import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ledger = JSON.parse(fs.readFileSync('artifacts/work/gpt459-capability-reuse-ledger.json', 'utf8'));
const matrix = JSON.parse(fs.readFileSync('artifacts/sovereign/implementation-coverage-matrix.json', 'utf8'));
const eligible = matrix.rows.filter(row => row.class === 'CAPABILITY_DOMAIN' || row.class === 'CAPABILITY_ATOM');

test('#459 ledger has complete current capability-domain/atom denominator', () => {
  assert.equal(ledger.rowCount, eligible.length);
  assert.equal(ledger.expectedClasses.CAPABILITY_DOMAIN, eligible.filter(row => row.class === 'CAPABILITY_DOMAIN').length);
  assert.equal(ledger.expectedClasses.CAPABILITY_ATOM, eligible.filter(row => row.class === 'CAPABILITY_ATOM').length);
  assert.equal(new Set(ledger.rows.map(row => row.canonicalId)).size, ledger.rowCount);
  assert.equal(Object.values(ledger.counts).reduce((a, b) => a + b, 0) + ledger.pendingCount, ledger.rowCount);
});

test('#459 reuse disposition requires behavioral evidence and metadata-only atoms stay gaps', () => {
  for (const row of ledger.rows) {
    if (row.disposition === 'VERIFIED_REUSE') {
      assert.ok(row.sourceModules.length > 0);
      assert.ok(row.focusedTests.length > 0);
      assert.notEqual(row.reachability, 'UNREACHABLE_OR_UNPROVEN');
      assert.notEqual(row.authorityClass, undefined);
      assert.notEqual(row.privacyClass, undefined);
    }
    if (row.class === 'CAPABILITY_ATOM' && row.priorState === 'SPEC_ONLY') {
      assert.equal(row.priorDisposition, 'GENUINE_GAP');
      assert.equal(row.disposition, null);
      assert.match(row.implementationProof, /metadata|no-behavioral/);
    }
  }
});
