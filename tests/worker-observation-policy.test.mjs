import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { workerObservationEnabled } from '../src/worker-observation-policy.mjs';

const publicFlag = 'UBERMIND_PUBLIC_ISSUE_INTAKE_ENABLED';
const smtpFlag = 'WINNR_SMTP_READINESS_PROBE_ENABLED';

for (const flag of [publicFlag, smtpFlag]) {
  test(`${flag}: absent or null environment disables`, () => {
    assert.equal(workerObservationEnabled({}, flag), false);
    assert.equal(workerObservationEnabled(null, flag), false);
  });
  test(`${flag}: exact explicit true enables`, () => {
    assert.equal(workerObservationEnabled({[flag]:'true'}, flag), true);
  });
  test(`${flag}: ambiguous values fail closed`, () => {
    for (const value of ['TRUE', 'True', '1', 'yes', 'false', '', ' true ', true, 1]) {
      assert.equal(workerObservationEnabled({[flag]:value}, flag), false, String(value));
    }
  });
  test(`${flag}: inherited flags fail closed`, () => {
    assert.equal(workerObservationEnabled(Object.create({[flag]:'true'}), flag), false);
  });
}
test('unknown flag cannot authorize observation', () => {
  assert.equal(workerObservationEnabled({OUTBOUND_ENABLED:'true'}, 'OUTBOUND_ENABLED'), false);
});
test('does not mutate supplied environment', () => {
  const env = Object.freeze({[smtpFlag]:'true'});
  assert.equal(workerObservationEnabled(env, smtpFlag), true);
});
test('worker callsites guard both network probes', () => {
  const worker = readFileSync(fileURLToPath(new URL('../worker.mjs', import.meta.url)), 'utf8');
  assert.match(worker, /if \(workerObservationEnabled\(process\.env, 'UBERMIND_PUBLIC_ISSUE_INTAKE_ENABLED'\)\) \{\s*void tickUberMindPublicIssueBacklog\(\);\s*const publicIssueIntakeInterval=/);
  assert.match(worker, /if \(workerObservationEnabled\(process\.env, 'WINNR_SMTP_READINESS_PROBE_ENABLED'\)\) \{\s*await refreshWinnrSmtpReadiness\(\);\s*smtpReadinessTimer = setInterval/);
});
test('worker imports the audited policy module', () => {
  const worker = readFileSync(fileURLToPath(new URL('../worker.mjs', import.meta.url)), 'utf8');
  assert.match(worker, /import \{ workerObservationEnabled \} from '\.\/src\/worker-observation-policy\.mjs';/);
});
