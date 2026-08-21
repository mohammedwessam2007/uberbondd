import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CLAIMED_LABEL,
  DONE_LABEL,
  TASK_LABEL,
  buildClaimComment,
  buildHeartbeatComment,
  decodeHtmlEntities,
  claimGithubRelayTask,
  createGithubRelayTask,
  heartbeatGithubRelayTask,
  parseTaskIssueBody,
  pollGithubRelayTasks,
  readGithubRelayTask,
  githubRelayTaskEnvelope,
  resolveLease,
  submitGithubRelayResult,
  summarizeRelayQueue,
  buildTaskIssueBody,
  validateRelayReceipt
} from '../src/github-relay.mjs';
import { hasSecret } from '../src/cloud-agent-relay.mjs';

// A deterministic stand-in for the GitHub API surface this transport uses.
// Comment ids increase monotonically exactly as GitHub's do, because
// resolveLease()'s race tie-break depends on that ordering being real.
function fakeGithub() {
  const issues = new Map();
  const comments = new Map();
  let nextIssue = 1;
  let nextComment = 1000;
  const client = {
    async createIssue({ title, body, labels = [] }) {
      const number = nextIssue++;
      const issue = {
        number, title, body, state: 'open',
        labels: labels.map(name => ({ name })),
        html_url: `https://github.com/o/r/issues/${number}`,
        created_at: '2026-08-19T10:00:00.000Z'
      };
      issues.set(number, issue);
      comments.set(number, []);
      return issue;
    },
    async listIssues({ labels = [] }) {
      return [...issues.values()].filter(issue =>
        issue.state === 'open'
        && labels.every(want => issue.labels.some(label => label.name === want)));
    },
    async getIssue({ issueNumber }) { return issues.get(issueNumber) || null; },
    async getComments({ issueNumber }) { return comments.get(issueNumber) || []; },
    async addComment({ issueNumber, body }) {
      const comment = { id: nextComment++, body, html_url: `https://github.com/o/r/issues/${issueNumber}#c` };
      comments.get(issueNumber).push(comment);
      return comment;
    },
    async addLabels({ issueNumber, labels }) {
      const issue = issues.get(issueNumber);
      for (const name of labels) if (!issue.labels.some(label => label.name === name)) issue.labels.push({ name });
      return issue;
    },
    async closeIssue({ issueNumber, stateReason }) {
      const issue = issues.get(issueNumber);
      Object.assign(issue, { state: 'closed', state_reason: stateReason });
      return issue;
    }
  };
  return { client, issues, comments };
}

function input(overrides = {}) {
  return {
    taskId: 'gh-task-1',
    objective: 'Inspect repository state and report the branch SHA',
    originAgent: 'chatgpt',
    targetAgent: 'claude-code',
    requiredOutputs: ['outcome'],
    acceptanceTests: ['result parses and ledger is zero'],
    evidenceRefs: ['task:gh-brief'],
    consequenceClass: 'LOCAL_PREPARATION',
    ...overrides
  };
}

function result(overrides = {}) {
  return {
    outcome: 'Inspected repository state.',
    changedArtifacts: [],
    testsActuallyRun: [{ command: 'node --test tests/github-relay.test.mjs', result: 'PASS' }],
    truthTable: { githubRelay: 'PASS_LOCAL' },
    externalEffectLedger: {
      providerCalls: 0, messages: 0, purchases: 0, deployments: 0,
      credentialChanges: 0, dnsChanges: 0, productionMutations: 0, spendCents: 0
    },
    decision: 'PROCEED',
    ...overrides
  };
}

const T0 = new Date('2026-08-19T10:00:00.000Z');

test('createGithubRelayTask opens a labelled issue carrying a machine-parseable packet', async () => {
  const { client, issues } = fakeGithub();
  const created = await createGithubRelayTask({ client, owner: 'o', repo: 'r', input: input(), date: T0 });
  assert.equal(created.ok, true, JSON.stringify(created));
  assert.equal(created.status, 'QUEUED');
  assert.equal(created.issueNumber, 1);

  const issue = issues.get(1);
  assert.ok(issue.labels.some(label => label.name === TASK_LABEL));
  assert.ok(issue.labels.some(label => label.name === 'agent-relay:for:claude-code'));
  const parsed = parseTaskIssueBody(issue.body);
  assert.equal(parsed.taskId, 'gh-task-1');
  assert.equal(parsed.targetAgent, 'claude-code');
  // Free prose surrounds the fenced packet; parsing must survive that.
  assert.match(issue.body, /Bounded UberBond relay task/);
});

test('a secret-bearing task is rejected before anything is written to GitHub', async () => {
  const { client, issues } = fakeGithub();
  const rejected = await createGithubRelayTask({
    client, owner: 'o', repo: 'r', date: T0,
    input: input({ note: 'Bearer eyJhbGciOiJIUzI1NiJ9.example' })
  });
  assert.equal(rejected.ok, false);
  assert.ok(rejected.reasonCodes.includes('secret-or-oversized-task-rejected'));
  assert.equal(issues.size, 0, 'a rejected task must never reach GitHub at all');
});

test('poll returns only open, matching-target, not-yet-done tasks', async () => {
  const { client } = fakeGithub();
  await createGithubRelayTask({ client, owner: 'o', repo: 'r', input: input({ taskId: 'a' }), date: T0 });
  await createGithubRelayTask({ client, owner: 'o', repo: 'r', input: input({ taskId: 'b', targetAgent: 'some-other-agent' }), date: T0 });

  const mine = await pollGithubRelayTasks({ client, owner: 'o', repo: 'r', targetAgent: 'claude-code' });
  assert.equal(mine.count, 1);
  assert.equal(mine.tasks[0].taskId, 'a');

  const theirs = await pollGithubRelayTasks({ client, owner: 'o', repo: 'r', targetAgent: 'some-other-agent' });
  assert.equal(theirs.count, 1);
  assert.equal(theirs.tasks[0].taskId, 'b');
});

test('full lifecycle: claim -> heartbeat -> submit -> issue closed with a durable receipt', async () => {
  const { client, issues } = fakeGithub();
  await createGithubRelayTask({ client, owner: 'o', repo: 'r', input: input(), date: T0 });

  const claim = await claimGithubRelayTask({ client, owner: 'o', repo: 'r', issueNumber: 1, workerId: 'claude-code:test', now: T0 });
  assert.equal(claim.ok, true, JSON.stringify(claim));
  assert.equal(claim.status, 'CLAIMED');
  assert.ok(issues.get(1).labels.some(label => label.name === CLAIMED_LABEL));

  const beat = await heartbeatGithubRelayTask({
    client, owner: 'o', repo: 'r', issueNumber: 1, workerId: 'claude-code:test',
    now: new Date('2026-08-19T10:10:00.000Z')
  });
  assert.equal(beat.ok, true, JSON.stringify(beat));
  assert.equal(beat.status, 'HEARTBEAT_ACCEPTED');

  const submitted = await submitGithubRelayResult({
    client, owner: 'o', repo: 'r', issueNumber: 1, workerId: 'claude-code:test',
    status: 'COMPLETED', result: result(), now: new Date('2026-08-19T10:20:00.000Z')
  });
  assert.equal(submitted.ok, true, JSON.stringify(submitted));
  assert.equal(submitted.status, 'RECEIVED');
  assert.equal(issues.get(1).state, 'closed');
  assert.ok(issues.get(1).labels.some(label => label.name === DONE_LABEL));

  const read = await readGithubRelayTask({ client, owner: 'o', repo: 'r', issueNumber: 1, now: new Date('2026-08-19T10:21:00.000Z') });
  assert.equal(read.resultStatus, 'COMPLETED');
  assert.equal(read.submittedBy, 'claude-code:test');
  assert.equal(read.result.outcome, 'Inspected repository state.');
});

test('hostile: a non-owner cannot heartbeat or submit against another worker\'s live lease', async () => {
  const { client } = fakeGithub();
  await createGithubRelayTask({ client, owner: 'o', repo: 'r', input: input(), date: T0 });
  await claimGithubRelayTask({ client, owner: 'o', repo: 'r', issueNumber: 1, workerId: 'claude-code:owner', now: T0 });

  const stolenBeat = await heartbeatGithubRelayTask({ client, owner: 'o', repo: 'r', issueNumber: 1, workerId: 'claude-code:thief', now: T0 });
  assert.equal(stolenBeat.ok, false);
  assert.ok(stolenBeat.reasonCodes.includes('lease-owner-mismatch'));

  const stolenSubmit = await submitGithubRelayResult({
    client, owner: 'o', repo: 'r', issueNumber: 1, workerId: 'claude-code:thief', result: result(), now: T0
  });
  assert.equal(stolenSubmit.ok, false);
  assert.ok(stolenSubmit.reasonCodes.includes('lease-owner-mismatch'));

  const stolenClaim = await claimGithubRelayTask({ client, owner: 'o', repo: 'r', issueNumber: 1, workerId: 'claude-code:thief', now: T0 });
  assert.equal(stolenClaim.ok, false);
  assert.ok(stolenClaim.reasonCodes.includes('lease-held-by-another-worker'));
});

test('hostile: a result claiming any nonzero external effect is rejected, not recorded', async () => {
  const { client, comments } = fakeGithub();
  await createGithubRelayTask({ client, owner: 'o', repo: 'r', input: input(), date: T0 });
  await claimGithubRelayTask({ client, owner: 'o', repo: 'r', issueNumber: 1, workerId: 'claude-code:test', now: T0 });
  const before = comments.get(1).length;

  for (const effect of ['providerCalls', 'messages', 'purchases', 'deployments', 'spendCents']) {
    const unsafe = await submitGithubRelayResult({
      client, owner: 'o', repo: 'r', issueNumber: 1, workerId: 'claude-code:test', now: T0,
      result: result({ externalEffectLedger: { ...result().externalEffectLedger, [effect]: 1 } })
    });
    assert.equal(unsafe.ok, false, `${effect} should have been rejected`);
    assert.ok(unsafe.reasonCodes.includes('nonzero-external-effect-ledger-rejected'));
  }
  assert.equal(comments.get(1).length, before, 'a rejected result must not be posted to the issue');
});

test('hostile: a secret-bearing result is rejected, and a completed task cannot be replayed', async () => {
  const { client } = fakeGithub();
  await createGithubRelayTask({ client, owner: 'o', repo: 'r', input: input(), date: T0 });
  await claimGithubRelayTask({ client, owner: 'o', repo: 'r', issueNumber: 1, workerId: 'claude-code:test', now: T0 });

  const leaky = await submitGithubRelayResult({
    client, owner: 'o', repo: 'r', issueNumber: 1, workerId: 'claude-code:test', now: T0,
    result: result({ outcome: 'here is a key sk-abcdefghijklmnopqrst' })
  });
  assert.equal(leaky.ok, false);
  assert.ok(leaky.reasonCodes.includes('secret-like-result-rejected'));

  const good = await submitGithubRelayResult({
    client, owner: 'o', repo: 'r', issueNumber: 1, workerId: 'claude-code:test', result: result(), now: T0
  });
  assert.equal(good.ok, true);

  const replay = await submitGithubRelayResult({
    client, owner: 'o', repo: 'r', issueNumber: 1, workerId: 'claude-code:test', result: result(), now: T0
  });
  assert.equal(replay.ok, false);
  assert.ok(replay.reasonCodes.includes('task-already-completed'));
});

test('resolveLease: two racing claims converge on the earliest by comment id, for both askers', () => {
  const raced = [
    { id: 2001, body: buildClaimComment({ workerId: 'worker-a', observedAt: T0 }) },
    { id: 2002, body: buildClaimComment({ workerId: 'worker-b', observedAt: T0 }) }
  ];
  const lease = resolveLease(raced, new Date('2026-08-19T10:05:00.000Z'));
  assert.equal(lease.state, 'HELD');
  assert.equal(lease.holder, 'worker-a', 'earliest server-assigned comment id must win');
  // Reversed input order must not change the answer -- the tie-break is on id, not array order.
  assert.equal(resolveLease([...raced].reverse(), new Date('2026-08-19T10:05:00.000Z')).holder, 'worker-a');
});

test('resolveLease: an abandoned lease expires, and a heartbeat keeps it alive', () => {
  const claimOnly = [{ id: 3001, body: buildClaimComment({ workerId: 'worker-a', observedAt: T0, leaseSeconds: 600 }) }];
  assert.equal(resolveLease(claimOnly, new Date('2026-08-19T10:05:00.000Z')).state, 'HELD');
  assert.equal(resolveLease(claimOnly, new Date('2026-08-19T10:30:00.000Z')).state, 'EXPIRED');

  const keptAlive = [
    ...claimOnly,
    { id: 3002, body: buildHeartbeatComment({ workerId: 'worker-a', observedAt: new Date('2026-08-19T10:09:00.000Z'), leaseSeconds: 600 }) }
  ];
  const stillHeld = resolveLease(keptAlive, new Date('2026-08-19T10:15:00.000Z'));
  assert.equal(stillHeld.state, 'HELD');
  assert.equal(stillHeld.holder, 'worker-a');
});

test('resolveLease: a second worker may take over only after the first lease actually expires', async () => {
  const { client } = fakeGithub();
  await createGithubRelayTask({ client, owner: 'o', repo: 'r', input: input(), date: T0 });
  await claimGithubRelayTask({
    client, owner: 'o', repo: 'r', issueNumber: 1, workerId: 'claude-code:first', now: T0, leaseSeconds: 600
  });
  const tooEarly = await claimGithubRelayTask({
    client, owner: 'o', repo: 'r', issueNumber: 1, workerId: 'claude-code:second',
    now: new Date('2026-08-19T10:05:00.000Z'), leaseSeconds: 600
  });
  assert.equal(tooEarly.ok, false);

  const afterExpiry = await claimGithubRelayTask({
    client, owner: 'o', repo: 'r', issueNumber: 1, workerId: 'claude-code:second',
    now: new Date('2026-08-19T10:30:00.000Z'), leaseSeconds: 600
  });
  assert.equal(afterExpiry.ok, true, JSON.stringify(afterExpiry));
  assert.equal(afterExpiry.workerId, 'claude-code:second');
});

test('hostile: a malformed or missing task packet never yields a claimable task', async () => {
  const { client, issues } = fakeGithub();
  await client.createIssue({ title: 'hand-written, no packet', body: 'just some prose', labels: [TASK_LABEL] });
  await client.createIssue({ title: 'broken fence', body: '```uberbond-task\n{not json\n```', labels: [TASK_LABEL] });

  const polled = await pollGithubRelayTasks({ client, owner: 'o', repo: 'r', targetAgent: 'claude-code' });
  assert.equal(polled.count, 0, 'unparseable issues must not surface as tasks');

  const claimed = await claimGithubRelayTask({ client, owner: 'o', repo: 'r', issueNumber: 1, workerId: 'claude-code:test', now: T0 });
  assert.equal(claimed.ok, false);
  assert.ok(claimed.reasonCodes.includes('task-packet-unparseable'));
  assert.equal(issues.get(1).labels.some(label => label.name === CLAIMED_LABEL), false);
});

test('a packet survives a client that HTML-escapes the issue body (found live against real issue #30)', () => {
  // Regression test for a real interoperability defect caught by the first live
  // run, not by any fixture: GitHub's REST API returns issue bodies raw, but
  // some clients -- including the MCP GitHub server this repo is driven
  // through -- return them with entities escaped, so `"` arrives as `&#34;`.
  // The packet was then unparseable and the relay reported zero claimable
  // tasks while a perfectly valid task sat open on the repo.
  const escaped = [
    'Bounded UberBond relay task.',
    '',
    '```uberbond-task',
    '{',
    '  &#34;taskId&#34;: &#34;argus-live-canary-1&#34;,',
    '  &#34;targetAgent&#34;: &#34;claude-code&#34;,',
    '  &#34;objective&#34;: &#34;run the suite&#34;',
    '}',
    '```'
  ].join('\n');
  const parsed = parseTaskIssueBody(escaped);
  assert.ok(parsed, 'an HTML-escaped packet must still parse');
  assert.equal(parsed.taskId, 'argus-live-canary-1');
  assert.equal(parsed.targetAgent, 'claude-code');
});

test('entity decoding is single-pass: a literal &amp;#34; in content is never double-decoded into a quote', () => {
  assert.equal(decodeHtmlEntities('&amp;#34;'), '&#34;');
  assert.equal(decodeHtmlEntities('A &amp; B'), 'A & B');
  assert.equal(decodeHtmlEntities('&#x41;&#66;'), 'AB');
  assert.equal(decodeHtmlEntities('&notarealentity;'), '&notarealentity;', 'unknown entities pass through untouched');

  // A raw packet whose content legitimately contains an ampersand must round-trip
  // unchanged -- the decoder must not fire on the happy path at all.
  const raw = '```uberbond-task\n' + JSON.stringify({ objective: 'A & B', literal: '&amp;#34;' }) + '\n```';
  assert.deepEqual(parseTaskIssueBody(raw), { objective: 'A & B', literal: '&amp;#34;' });
});

test('the submitted receipt carries every field the relay contract mandates', async () => {
  const { client } = fakeGithub();
  await createGithubRelayTask({ client, owner: 'o', repo: 'r', input: input(), date: T0 });
  await claimGithubRelayTask({ client, owner: 'o', repo: 'r', issueNumber: 1, workerId: 'claude-code:test', now: T0 });
  const submitted = await submitGithubRelayResult({
    client, owner: 'o', repo: 'r', issueNumber: 1, workerId: 'claude-code:test',
    status: 'COMPLETED', result: result(), now: T0,
    sourceCommit: 'abc1234', confidence: 'HIGH',
    limitations: ['ran only the focused suite'], duration: 1200
  });
  assert.equal(submitted.ok, true, JSON.stringify(submitted));

  const read = await readGithubRelayTask({ client, owner: 'o', repo: 'r', issueNumber: 1, now: T0 });
  const r = read.receipt;
  assert.ok(r, 'reviewer read path must expose the receipt');
  for (const field of ['taskId', 'workerId', 'status', 'sourceCommit', 'commands', 'tests', 'artifacts',
                       'findings', 'limitations', 'confidence', 'externalEffects', 'cost', 'duration', 'submittedAt']) {
    assert.ok(field in r, `receipt is missing mandated field: ${field}`);
  }
  assert.equal(r.taskId, 'gh-task-1', 'receipt must bind to the task it answers');
  assert.equal(r.sourceCommit, 'abc1234');
  assert.equal(r.confidence, 'HIGH');
  assert.deepEqual(r.commands, ['node --test tests/github-relay.test.mjs'], 'commands derive from what actually ran');
  assert.deepEqual(r.externalEffects, result().externalEffectLedger);
});

test('a receipt is refused if it invents confidence or claims an external effect', () => {
  const base = {
    taskId: 't', workerId: 'w', status: 'COMPLETED', sourceCommit: 'abc',
    commands: [], tests: [], artifacts: [], findings: [], limitations: [],
    confidence: 'HIGH', cost: { usdCents: 0, tokens: null }, duration: 1, submittedAt: T0.toISOString(),
    externalEffects: {
      providerCalls: 0, messages: 0, purchases: 0, deployments: 0,
      credentialChanges: 0, dnsChanges: 0, productionMutations: 0, spendCents: 0
    }
  };
  assert.deepEqual(validateRelayReceipt(base), [], JSON.stringify(validateRelayReceipt(base)));

  assert.ok(validateRelayReceipt({ ...base, confidence: 'TOTALLY_SURE' }).includes('receipt-invalid-confidence'));
  assert.ok(validateRelayReceipt({ ...base, status: 'DEPLOYED' }).includes('receipt-invalid-status'));
  assert.ok(validateRelayReceipt({ ...base, taskId: '' }).includes('receipt-task-id-required'));

  for (const effect of ['messages', 'spendCents', 'deployments', 'productionMutations']) {
    const claimed = { ...base, externalEffects: { ...base.externalEffects, [effect]: 1 } };
    assert.ok(
      validateRelayReceipt(claimed).includes('receipt-nonzero-external-effects-rejected'),
      `${effect} must be refused at the receipt layer too, not only in validResult`
    );
  }

  const { taskId, ...missingTaskId } = base;
  assert.ok(validateRelayReceipt(missingTaskId).includes('receipt-missing-taskId'));
});

test('the shared secret scanner does not false-positive on the relay contract\'s own fields', () => {
  // Both of these were real rejections of perfectly clean receipts, found by
  // running the contract rather than by reading it:
  //   - `cost.tokens` matches the token-shaped key pattern
  //   - `externalEffects.credentialChanges` matches the credential pattern,
  //     because only `externalEffectLedger` had the ledger-shape special case
  const zero = {
    providerCalls: 0, messages: 0, purchases: 0, deployments: 0,
    credentialChanges: 0, dnsChanges: 0, productionMutations: 0, spendCents: 0
  };
  assert.equal(hasSecret({ cost: { usdCents: 0, tokens: null } }), false);
  assert.equal(hasSecret({ cost: { usdCents: 0, tokens: 1234 } }), false);
  assert.equal(hasSecret({ externalEffects: zero }), false);
  assert.equal(hasSecret({ externalEffectLedger: zero }), false);

  // A third instance turned up in the autonomy worker: `coordination.tokenBudget`.
  // Three separate names for the same idea -- a compute counter this codebase
  // insists on calling tokens -- each rejecting a legitimate payload. Naming
  // exceptions one at a time was treating the symptom, so the rule now keys off
  // TYPE, not name: an authentication token is a string, a counter is a number.
  assert.equal(hasSecret({ coordination: { tokenBudget: 1000 } }), false);
  assert.equal(hasSecret({ budget: { maxTokens: 200000 } }), false);
  assert.equal(hasSecret({ someFutureTokenCount: 0 }), false);

  // The consequence of a type-based rule, stated openly rather than buried:
  // `accessToken: 1` is now allowed through, where the old name-based rule
  // caught it. That is the intended trade. The integer 1 is not a usable
  // credential, so rejecting it bought no safety while the strict reading cost
  // three real false positives. What the scanner exists to stop -- a
  // high-entropy string leaking into a public issue -- is unaffected.
  assert.equal(hasSecret({ accessToken: 1 }), false);

  // ...and the exemption stays narrow in the ways that matter. A credential is
  // a string, so a string under a token-shaped key is still caught. Only
  // /token/i is exempted: names with no counter meaning stay blocked whatever
  // their value. Negative counts are not counts. Unrecognised ledger effects
  // are still refused.
  assert.equal(hasSecret({ cost: { tokens: 'Bearer abcdefghijkl' } }), true);
  assert.equal(hasSecret({ coordination: { tokenBudget: 'ghp_abcdefghijklmno' } }), true);
  assert.equal(hasSecret({ cost: { tokens: -5 } }), true);
  assert.equal(hasSecret({ cost: { tokens: 1.5 } }), true);
  assert.equal(hasSecret({ password: 1 }), true);
  assert.equal(hasSecret({ apiKey: 1 }), true);
  assert.equal(hasSecret({ clientSecret: 0 }), true);
  assert.equal(hasSecret({ externalEffects: { ...zero, sneakyEffect: 0 } }), true);
});

test('githubRelayTaskEnvelope derives mutable state from GitHub without duplicating storage', async () => {
  const { client, issues, comments } = fakeGithub();
  await createGithubRelayTask({ client, owner: 'o', repo: 'r', input: input(), date: T0 });

  const queued = githubRelayTaskEnvelope({ issue: issues.get(1), comments: comments.get(1), now: T0 });
  assert.equal(queued.status, 'QUEUED');
  assert.equal(queued.attempts, 0);
  assert.equal(queued.idempotencyKey, 'github-issue:1', 'the issue itself is the idempotency key');
  assert.deepEqual(queued.resultRefs, []);
  assert.equal(queued.parentTaskId, null);

  await claimGithubRelayTask({ client, owner: 'o', repo: 'r', issueNumber: 1, workerId: 'claude-code:test', now: T0 });
  const claimed = githubRelayTaskEnvelope({ issue: issues.get(1), comments: comments.get(1), now: T0 });
  assert.equal(claimed.status, 'CLAIMED');
  assert.equal(claimed.attempts, 1, 'each claim comment is one real attempt');
  assert.equal(claimed.lease.holder, 'claude-code:test');

  await submitGithubRelayResult({
    client, owner: 'o', repo: 'r', issueNumber: 1, workerId: 'claude-code:test',
    result: result(), now: T0, confidence: 'MEDIUM'
  });
  const done = githubRelayTaskEnvelope({ issue: issues.get(1), comments: comments.get(1), now: T0 });
  assert.equal(done.status, 'COMPLETED');
  assert.equal(done.confidence, 'MEDIUM');
  assert.equal(done.resultRefs.length, 1);
});

test('hostile: invalid worker ids and result statuses are refused', async () => {
  const { client } = fakeGithub();
  await createGithubRelayTask({ client, owner: 'o', repo: 'r', input: input(), date: T0 });

  for (const bad of ['', '   ', 'has spaces', '-leading-dash', 'x'.repeat(200)]) {
    const claimed = await claimGithubRelayTask({ client, owner: 'o', repo: 'r', issueNumber: 1, workerId: bad, now: T0 });
    assert.equal(claimed.ok, false, `worker id ${JSON.stringify(bad)} should be refused`);
    assert.ok(claimed.reasonCodes.includes('invalid-worker-id'));
  }

  await claimGithubRelayTask({ client, owner: 'o', repo: 'r', issueNumber: 1, workerId: 'claude-code:test', now: T0 });
  const bogusStatus = await submitGithubRelayResult({
    client, owner: 'o', repo: 'r', issueNumber: 1, workerId: 'claude-code:test',
    status: 'DEPLOYED_TO_PROD', result: result(), now: T0
  });
  assert.equal(bogusStatus.ok, false);
  assert.ok(bogusStatus.reasonCodes.includes('invalid-result-status'));
});

// --- queue visibility -------------------------------------------------------
// A relay nobody can see the state of is a relay nobody trusts. These pin the
// three situations that are operationally different but look identical on the
// GitHub issue list.

function queueEntry({ number, taskId, createdAt, labels = [TASK_LABEL], comments = [] }) {
  return {
    issue: {
      number,
      created_at: createdAt,
      html_url: `https://github.com/o/r/issues/${number}`,
      labels: labels.map(name => ({ name })),
      body: buildTaskIssueBody({ ...input({ taskId }), ok: true, createdAt, status: 'READY_FOR_REVIEW' })
    },
    comments
  };
}

test('summarizeRelayQueue reports an idle queue as IDLE rather than healthy-looking silence', () => {
  const summary = summarizeRelayQueue({ tasks: [], now: T0 });
  assert.equal(summary.verdict, 'IDLE');
  assert.equal(summary.total, 0);
  assert.equal(summary.oldestQueuedSeconds, null);
  assert.deepEqual(summary.stranded, []);
});

test('summarizeRelayQueue distinguishes waiting work from work in flight', () => {
  const now = new Date('2026-08-19T10:10:00.000Z');
  const summary = summarizeRelayQueue({
    tasks: [
      queueEntry({ number: 1, taskId: 'waiting', createdAt: '2026-08-19T10:05:00.000Z' }),
      queueEntry({
        number: 2, taskId: 'running', createdAt: '2026-08-19T10:00:00.000Z',
        labels: [TASK_LABEL, CLAIMED_LABEL],
        comments: [{ id: 10, body: buildClaimComment({ workerId: 'worker-a', observedAt: now, leaseSeconds: 900 }) }]
      })
    ],
    now
  });
  assert.equal(summary.verdict, 'ACTIVE');
  assert.equal(summary.counts.QUEUED, 1);
  assert.equal(summary.counts.CLAIMED, 1);
  assert.equal(summary.inFlight[0].holder, 'worker-a');
  assert.equal(summary.oldestQueuedSeconds, 300);
});

test('summarizeRelayQueue surfaces a task whose worker claimed it and then died', () => {
  // This is the failure the transport could never announce: the lease lapsed,
  // so the task is claimable again, but work may have been done and thrown
  // away and the issue still reads "claimed". It outranks an idle queue --
  // idle means nobody started; stranded means someone started and vanished.
  const claimedAt = new Date('2026-08-19T10:00:00.000Z');
  const now = new Date('2026-08-19T11:00:00.000Z');
  const summary = summarizeRelayQueue({
    tasks: [queueEntry({
      number: 7, taskId: 'abandoned', createdAt: '2026-08-19T09:55:00.000Z',
      labels: [TASK_LABEL, CLAIMED_LABEL],
      comments: [{ id: 20, body: buildClaimComment({ workerId: 'worker-ghost', observedAt: claimedAt, leaseSeconds: 600 }) }]
    })],
    now
  });
  assert.equal(summary.verdict, 'STRANDED');
  assert.equal(summary.counts.LEASE_EXPIRED, 1);
  assert.equal(summary.stranded.length, 1);
  assert.equal(summary.stranded[0].issueNumber, 7);
  assert.equal(summary.stranded[0].attempts, 1);
  // Naming the worker that vanished is the point. Reporting a stranded task
  // without saying who dropped it leaves the reader nowhere to look.
  assert.equal(summary.stranded[0].lastHolder, 'worker-ghost');
  assert.equal(summary.stranded[0].lapsedAt, '2026-08-19T10:10:00.000Z');
});

test('resolveLease keeps holder null on an expired lease but still names who let it lapse', () => {
  // holder must stay null -- nobody holds an expired lease and callers branch
  // on that. lastHolder is a separate field precisely so adding it cannot
  // change any existing decision.
  const lease = resolveLease(
    [{ id: 1, body: buildClaimComment({ workerId: 'worker-ghost', observedAt: T0, leaseSeconds: 600 }) }],
    new Date('2026-08-19T11:00:00.000Z')
  );
  assert.equal(lease.state, 'EXPIRED');
  assert.equal(lease.holder, null);
  assert.equal(lease.lastHolder, 'worker-ghost');
});

test('summarizeRelayQueue calls a long-waiting queue with nothing running STALLED', () => {
  // Not broken -- nobody is home. Worth saying out loud, because an idle
  // worker and a crashed one look the same from the issue list.
  const summary = summarizeRelayQueue({
    tasks: [queueEntry({ number: 3, taskId: 'ancient', createdAt: '2026-08-19T08:00:00.000Z' })],
    now: T0,
    staleQueuedSeconds: 3600
  });
  assert.equal(summary.verdict, 'STALLED');
  assert.equal(summary.oldestQueuedSeconds, 7200);
});

test('summarizeRelayQueue does not call a queue STALLED while a worker is actually running', () => {
  const summary = summarizeRelayQueue({
    tasks: [
      queueEntry({ number: 3, taskId: 'ancient', createdAt: '2026-08-19T08:00:00.000Z' }),
      queueEntry({
        number: 4, taskId: 'running', createdAt: '2026-08-19T09:59:00.000Z',
        labels: [TASK_LABEL, CLAIMED_LABEL],
        comments: [{ id: 30, body: buildClaimComment({ workerId: 'worker-a', observedAt: T0, leaseSeconds: 900 }) }]
      })
    ],
    now: T0,
    staleQueuedSeconds: 3600
  });
  assert.equal(summary.verdict, 'ACTIVE');
});

test('summarizeRelayQueue flags repeatedly-retried tasks, which read as ordinary claims on GitHub', () => {
  const summary = summarizeRelayQueue({
    tasks: [queueEntry({
      number: 9, taskId: 'thrashing', createdAt: '2026-08-19T09:50:00.000Z',
      labels: [TASK_LABEL, CLAIMED_LABEL],
      comments: [
        { id: 40, body: buildClaimComment({ workerId: 'worker-a', observedAt: T0, leaseSeconds: 900 }) },
        { id: 41, body: buildClaimComment({ workerId: 'worker-b', observedAt: T0, leaseSeconds: 900 }) },
        { id: 42, body: buildClaimComment({ workerId: 'worker-c', observedAt: T0, leaseSeconds: 900 }) }
      ]
    })],
    now: T0
  });
  assert.equal(summary.retried.length, 1);
  assert.equal(summary.retried[0].attempts, 3);
});

test('summarizeRelayQueue reports a strictly zero effect ledger -- reading a queue changes nothing', () => {
  const summary = summarizeRelayQueue({ tasks: [], now: T0 });
  assert.deepEqual(summary.externalEffectLedger, {
    providerCalls: 0, messages: 0, purchases: 0, deployments: 0,
    credentialChanges: 0, dnsChanges: 0, productionMutations: 0, spendCents: 0
  });
});
