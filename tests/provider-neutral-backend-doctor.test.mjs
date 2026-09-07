import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectPortableBackend } from '../scripts/provider-neutral-backend-doctor.mjs';

const completeEnv = {
  POSTGRES_PASSWORD: 'local-only-password',
  APP_BASE_URL: 'https://backend.example.test',
  ADMIN_TOKEN: 'a'.repeat(32),
  TOKEN_ENCRYPTION_KEY: 'b'.repeat(64)
};

test('portable backend doctor recognizes the compose contract with complete deployment env', () => {
  const report = inspectPortableBackend({ env: completeEnv });
  assert.equal(report.status, 'READY_FOR_HOST_REHEARSAL');
  assert.deepEqual(report.missingFiles, []);
  assert.deepEqual(report.missingComposeMarkers, []);
  assert.equal(report.runtimeProof, 'NONE');
});

test('portable backend doctor refuses missing env and insecure public URL', () => {
  const report = inspectPortableBackend({ env: { APP_BASE_URL: 'http://localhost:8080' } });
  assert.equal(report.status, 'REFUSED');
  assert.ok(report.reasons.includes('deployment-environment-incomplete'));
  assert.ok(report.reasons.includes('APP_BASE_URL-must-use-https'));
});
