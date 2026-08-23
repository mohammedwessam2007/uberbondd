// Section 60: hunt for secrets in the places a secret would actually end up --
// durable receipts, task packets, error text, model output -- rather than only
// in source files, which is where scanners usually stop looking.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasSecret, validResult, ZERO_EFFECTS } from '../src/cloud-agent-relay.mjs';
import { evaluateWorkerResultTruth } from '../src/agent-worker-result-truth.mjs';
import { sandboxChildEnv } from '../src/claude-code-sandbox-provisioner.mjs';
import { beginAgentMeshCycleReceipt, finishAgentMeshCycleReceipt, listTerminalAgentMeshCycleReceipts } from '../src/agent-mesh-cycle-receipts.mjs';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const SECRET_SHAPES = Object.freeze([
  'Bearer abcdefghijklmnopqrstuvwxyz012345',
  'sk-abcdefghijklmnopqrstuvwxyz012345',
  'ghp_abcdefghijklmnopqrstuvwxyz012345',
  'ghs_abcdefghijklmnopqrstuvwxyz012345',
  '-----BEGIN RSA PRIVATE KEY-----\nMIIEow==\n-----END RSA PRIVATE KEY-----'
]);

function memoryStore() {
  const rows = new Map();
  const order = [];
  return {
    rows,
    async get(key, id) { return structuredClone(rows.get(id) || null); },
    async add(key, item) {
      if (rows.has(item.id)) throw new Error('duplicate');
      rows.set(item.id, structuredClone(item));
      order.push(item.id);
      return structuredClone(item);
    },
    async list(key, options = {}) {
      let out = order.map(id => rows.get(id));
      if (options.filters?.type) out = out.filter(row => row.type === options.filters.type);
      return structuredClone(out.slice(0, options.limit || out.length));
    }
  };
}

function canonicalResult(overrides = {}) {
  return {
    outcome: 'fine',
    changedArtifacts: [],
    testsActuallyRun: [],
    truthTable: [{ claim: 'fine', status: 'VERIFIED' }],
    externalEffectLedger: { ...ZERO_EFFECTS },
    decision: 'CONTINUE',
    ...overrides
  };
}

test('a secret in any field of a worker result is refused', () => {
  const fields = ['outcome', 'decision'];
  for (const secret of SECRET_SHAPES) {
    for (const field of fields) {
      const errors = validResult(canonicalResult({ [field]: secret }));
      assert.ok(errors.includes('secret-like-result-rejected'), `${field} carried ${secret.slice(0, 12)}`);
    }
    // And nested, where a scanner that only checks the top level would miss it.
    const nested = validResult(canonicalResult({
      changedArtifacts: [{ path: 'src/x.mjs', note: secret }]
    }));
    assert.ok(nested.includes('secret-like-result-rejected'), 'nested secret survived');
    const deep = validResult(canonicalResult({
      truthTable: [{ claim: 'fine', status: 'VERIFIED', evidence: { detail: { token: secret } } }]
    }));
    assert.ok(deep.includes('secret-like-result-rejected'), 'deeply nested secret survived');
  }
});

test('a secret-shaped key with a string value is refused even under a benign name', () => {
  assert.equal(hasSecret({ notes: { apiKey: 'anything at all' } }), true);
  assert.equal(hasSecret({ config: { password: 'hunter2' } }), true);
  assert.equal(hasSecret({ auth: { authorization: 'Basic abc' } }), true);
  // A token-shaped key holding a counter is a counter, and stays allowed.
  assert.equal(hasSecret({ usage: { tokenBudget: 50_000 } }), false);
  assert.equal(hasSecret({ usage: { totalTokens: null } }), false);
});

test('a terminal result carrying a secret cannot end a run', () => {
  for (const secret of SECRET_SHAPES) {
    const truth = evaluateWorkerResultTruth({
      result: canonicalResult({ decision: 'DONE', outcome: secret })
    });
    assert.equal(truth.ok, false);
    assert.ok(truth.reasonCodes.includes('secret-like-result-rejected'));
  }
});

test('no secret reaches a durable mesh-cycle receipt through a worker reason code', async () => {
  const store = memoryStore();
  const begun = await beginAgentMeshCycleReceipt({
    store, occurrenceKey: 'occ/secret', startedAt: '2026-08-23T00:00:00.000Z',
    sourceCommit: 'abc1234', policyVersions: ['p1'],
    workers: [{ targetAgent: 'claude-code', provider: 'anthropic', workerId: 'w1', budgetId: 'b1' }]
  });
  await finishAgentMeshCycleReceipt({
    store, cycleId: begun.cycleId, finishedAt: '2026-08-23T00:01:00.000Z',
    sourceCommit: 'abc1234', policyVersions: ['p1'], status: 'DEGRADED',
    reasonCodes: SECRET_SHAPES,
    workers: [{ targetAgent: 'claude-code', provider: 'anthropic', workerId: 'w1', status: 'FAILED', reasonCodes: SECRET_SHAPES }]
  });

  const persisted = JSON.stringify(await listTerminalAgentMeshCycleReceipts({ store }));
  // A receipt truncates reason codes; what matters is that no complete
  // credential survives into durable history.
  for (const secret of SECRET_SHAPES) {
    assert.ok(!persisted.includes(secret), `a full secret reached durable history: ${secret.slice(0, 16)}`);
  }
});

test('the sandbox child environment carries no credential at all', () => {
  const env = sandboxChildEnv({
    PATH: '/usr/bin',
    ANTHROPIC_API_KEY: SECRET_SHAPES[1],
    GITHUB_TOKEN: SECRET_SHAPES[2],
    DATABASE_URL: 'postgres://user:pass@host:5432/db',
    SOME_WEBHOOK_URL: 'https://hooks.example/abc'
  });
  const serialized = JSON.stringify(env);
  for (const secret of [...SECRET_SHAPES, 'postgres://user:pass@host', 'hooks.example']) {
    assert.ok(!serialized.includes(secret), `${secret.slice(0, 20)} survived into the sandbox env`);
  }
});

test('no tracked file in the repository carries a real credential', async () => {
  const skipDirs = new Set(['node_modules', '.git', 'historical-archive', 'public']);
  const patterns = [
    // A bare PEM header is a marker; a header followed by base64 is a key.
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\r\n]+[A-Za-z0-9+/=]{40,}/,
    /\bAKIA[0-9A-Z]{16}\b/,
    /\bghp_[A-Za-z0-9]{36}\b/,
    /\bsk-(?:proj-)?[A-Za-z0-9]{40,}\b/,
    /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/
  ];
  const findings = [];

  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') && entry.name !== '.env.example' && entry.name !== '.github') continue;
      if (skipDirs.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { await walk(full); continue; }
      if (!/\.(mjs|js|json|md|yml|yaml|example)$/.test(entry.name)) continue;
      let content;
      try { content = await readFile(full, 'utf8'); } catch { continue; }
      // The suites in this file deliberately contain secret-shaped strings.
      if (full.endsWith('secret-leakage-sweep.test.mjs')) continue;
      for (const pattern of patterns) {
        if (pattern.test(content)) findings.push(`${path.relative(repoRoot, full)} :: ${pattern}`);
      }
    }
  }

  await walk(repoRoot);
  assert.deepEqual(findings, [], `credential-shaped material found:\n${findings.join('\n')}`);
});
