import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync('.github/workflows/uberbond-self-maintainer.yml', 'utf8');
const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'));

test('self-maintainer is evidence-triggered instead of resurrecting the retired hourly retry loop', () => {
  const schedules = [...workflow.matchAll(/cron:\s*'([^']+)'/g)].map(match => match[1]);
  assert.deepEqual(schedules, [], 'self-maintainer must not regain a blind hourly cron');
  assert.match(workflow, /push:\s*\n\s*branches:\s*\n\s*- main/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.equal((vercel.crons || []).some(row => String(row.path || '').includes('self-maintainer-proposal')), false);
  assert.equal(Object.hasOwn(vercel.functions || {}, 'api/self-maintainer-proposal.mjs'), true,
    'bounded proposal surface may remain callable without becoming a timer-owned loop');
});

test('evidence-triggered self-maintainer performs proposal generation only between justified initial and final ticks', () => {
  const preflight = workflow.indexOf('Enforce prior continuation before same-base reentry');
  const initial = workflow.indexOf('Run initial whole-brain self-maintenance tick');
  const proposal = workflow.indexOf('Generate and submit canonical proposal only when proposal work is actually pending');
  const final = workflow.indexOf('Run verification and review-promotion tick only after successful proposal dispatch');
  assert.ok(preflight >= 0);
  assert.ok(initial > preflight);
  assert.ok(proposal > initial);
  assert.ok(final > proposal);
  assert.match(workflow, /steps\.preflight\.outputs\.run_tick == 'true'/);
  assert.match(workflow, /RELAY_TASK_QUEUED/);
  assert.match(workflow, /WAITING_FOR_WORKER_RESULT/);
  assert.match(workflow, /steps\.proposal\.outputs\.proposal_status == '0'/);
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

test('explicit STOP is the only legacy candidate rejection normalized into a successful no-op', () => {
  const stopPredicates = [...workflow.matchAll(/v\.status==='CANDIDATE_REJECTED'&&Array\.isArray\(v\.reasonCodes\)&&v\.reasonCodes\.includes\('worker-decision-stop'\)/g)];
  const zeroAssignments = [...workflow.matchAll(/^\s*tick_status=0\s*$/gm)];
  assert.equal(stopPredicates.length, 2, 'initial and final pass must use the same narrow STOP condition');
  assert.equal(zeroAssignments.length, 2, 'only those two explicit STOP branches may normalize the exit code');
  assert.doesNotMatch(workflow, /continue-on-error\s*:\s*true/i);
  // `|| true` matters because a step that cannot fail cannot stop a bad
  // promotion. A teardown is the one place it is correct: removing a temporary
  // worktree must not fail the job, and it decides nothing. So the guard names
  // the allowed shape instead of banning the operator outright -- a blanket ban
  // failed the moment cleanup was added, which teaches the next session to
  // delete the assertion rather than to look at the line.
  const swallowed = workflow.split('\n').filter(line => /\|\|\s*true/.test(line));
  const teardown = /cleanup\(\)|trap\s|git worktree remove|rm -rf/;
  assert.deepEqual(
    swallowed.filter(line => !teardown.test(line)),
    [],
    'only teardown may swallow a failure; a step whose result decides anything must be able to fail'
  );
});

test('continuation memory prevents same-base blind repetition and preserves evidence', () => {
  assert.match(workflow, /self-maintainer-pulse-preflight\.mjs/);
  assert.match(workflow, /self-maintainer-continuation-receipt\.mjs/);
  assert.match(workflow, /resumeExistingAttemptOnly/);
  assert.match(workflow, /Save continuation guard for the next pulse/);
  assert.match(workflow, /self-maintainer-initial\.json/);
  assert.match(workflow, /self-maintainer-proposal-dispatch\.json/);
  assert.match(workflow, /self-maintainer-latest\.json/);
  assert.match(workflow, /Upload complete self-maintenance evidence packet/);
});
