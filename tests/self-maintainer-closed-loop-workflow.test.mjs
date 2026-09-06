import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync('.github/workflows/uberbond-self-maintainer.yml', 'utf8');
const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'));

test('self-maintainer keeps its one existing schedule and does not add a second proposal watcher', () => {
  const schedules = [...workflow.matchAll(/cron:\s*'([^']+)'/g)].map(match => match[1]);
  assert.deepEqual(schedules, ['17 * * * *']);
  assert.equal((vercel.crons || []).some(row => String(row.path || '').includes('self-maintainer-proposal')), false);
  assert.equal(Object.hasOwn(vercel.functions || {}, 'api/self-maintainer-proposal.mjs'), true);
});

test('existing self-maintainer workflow performs proposal generation between initial and final verification ticks', () => {
  const initial = workflow.indexOf('Run initial whole-brain self-maintenance tick');
  const proposal = workflow.indexOf('Generate and submit canonical proposal when worker result is absent');
  const final = workflow.indexOf('Run verification and review-promotion tick against exact proposal');
  assert.ok(initial >= 0);
  assert.ok(proposal > initial);
  assert.ok(final > proposal);
  assert.match(workflow, /self-maintainer-proposal-dispatch\.mjs/);
  assert.match(workflow, /id-token:\s*write/);
});

test('workflow never hands proposal generation merge, deployment, customer, payment, DNS or credential authority', () => {
  assert.doesNotMatch(workflow, /gh\s+pr\s+merge|git\s+push|vercel\s+deploy|curl[^\n]+customer|payment-action|change-dns|change-credentials/i);
  assert.match(workflow, /OUTBOUND_ENABLED:\s*'false'/);
  assert.match(workflow, /DISCOVERY_ENABLED:\s*'false'/);
  assert.match(workflow, /ALLOW_TEST_PAYMENT_UNLOCK:\s*'false'/);
  assert.match(workflow, /persist-credentials:\s*false/);
});

test('proposal evidence is persisted alongside initial and final maintenance truth', () => {
  assert.match(workflow, /self-maintainer-initial\.json/);
  assert.match(workflow, /self-maintainer-proposal-dispatch\.json/);
  assert.match(workflow, /self-maintainer-latest\.json/);
  assert.match(workflow, /Upload complete self-maintenance evidence packet/);
});
