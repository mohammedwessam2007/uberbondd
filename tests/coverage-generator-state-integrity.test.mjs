import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('coverage generator runs state-evidence integrity before writing the artifact', () => {
  const source = readFileSync('scripts/sovereign-coverage-matrix.mjs', 'utf8');
  const verifyAt = source.indexOf('verifyCoverageStateEvidenceIntegrity(matrix)');
  const writeAt = source.indexOf("writeFileSync(output, `${JSON.stringify(matrix, null, 2)}\\n`, 'utf8')");
  assert.ok(verifyAt >= 0, 'generator must call the independent state/evidence verifier');
  assert.ok(writeAt >= 0, 'test must locate the canonical coverage write');
  assert.ok(verifyAt < writeAt, 'verification must happen before any coverage artifact is persisted');
  assert.match(source, /if \(!stateEvidenceIntegrity\.ok\)/);
  assert.match(source, /status: 'COVERAGE_STATE_EVIDENCE_INTEGRITY_REFUSED'/);
  assert.match(source, /businessEffectAuthority: 'NONE'/);
});

test('coverage generator reuses the canonical verifier instead of restating its policy', () => {
  const source = readFileSync('scripts/sovereign-coverage-matrix.mjs', 'utf8');
  assert.match(source, /import \{ verifyCoverageStateEvidenceIntegrity \} from '\.\.\/src\/coverage-state-evidence-integrity\.mjs'/);
  assert.equal((source.match(/verifyCoverageStateEvidenceIntegrity\(/g) || []).length, 1);
});
