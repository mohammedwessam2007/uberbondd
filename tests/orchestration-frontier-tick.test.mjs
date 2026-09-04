import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(new URL('..', import.meta.url).pathname);

test('orchestration frontier tick turns relevant Gamechanger evidence into research-only candidates', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uberbond-orchestration-frontier-'));
  const input = path.join(dir, 'gamechanger.json');
  const output = path.join(dir, 'orchestration.json');
  fs.writeFileSync(input, JSON.stringify({
    tournament: {
      ranked: [
        {
          fingerprint: 'a'.repeat(64),
          score: 83,
          attentionState: 'ATOMIZE',
          observation: {
            sourceId: 'search-orchestration-skills-frontier',
            url: 'https://github.com/example/new-orchestrator',
            title: 'New bounded planner-worker orchestration framework',
            summary: 'Claude Code and Codex task DAG with independent verification.',
            claims: [],
            observedAt: '2026-09-04T00:00:00Z'
          }
        },
        {
          fingerprint: 'b'.repeat(64),
          score: 70,
          attentionState: 'RESEARCH',
          observation: {
            sourceId: 'github-trending',
            url: 'https://github.com/example/database',
            title: 'Database release',
            summary: 'A database engine with no agent coordination features.',
            claims: [],
            observedAt: '2026-09-04T00:00:00Z'
          }
        },
        {
          fingerprint: 'c'.repeat(64),
          score: 68,
          attentionState: 'RESEARCH',
          observation: {
            sourceId: 'github-trending',
            url: 'https://github.com/example/swarm-review',
            title: 'Worktree swarm review system',
            summary: 'A multi-agent subagent worktree workflow with adversarial review.',
            claims: [],
            observedAt: '2026-09-04T00:00:00Z'
          }
        }
      ]
    }
  }, null, 2));

  const run = spawnSync(process.execPath, [
    path.join(root, 'scripts/orchestration-frontier-tick.mjs'),
    '--input', input,
    '--output', output
  ], { cwd: root, encoding: 'utf8' });

  assert.equal(run.status, 0, run.stderr || run.stdout);
  const receipt = JSON.parse(fs.readFileSync(output, 'utf8'));
  assert.equal(receipt.schemaVersion, 'uberbond.orchestration-frontier-candidates.v1');
  assert.equal(receipt.candidateCount, 2);
  assert.deepEqual(new Set(receipt.candidates.map(item => item.source)), new Set([
    'https://github.com/example/new-orchestrator',
    'https://github.com/example/swarm-review'
  ]));
  assert.ok(receipt.candidates.every(item => item.state === 'DISCOVERED_RESEARCH_REQUIRED'));
  assert.ok(receipt.candidates.every(item => item.sourceRef === null));
  assert.ok(receipt.candidates.every(item => item.license === 'UNRESOLVED'));
  assert.ok(receipt.candidates.every(item => item.installationApproved === false));
  assert.ok(receipt.candidates.every(item => item.promotionApproved === false));
  assert.equal(receipt.installationAuthority, 'NONE');
  assert.equal(receipt.promotionAuthority, 'NONE');
  assert.equal(receipt.externalEffectLedger.messages, 0);
  assert.equal(receipt.externalEffectLedger.spendCents, 0);
});

test('orchestration frontier tick rejects malformed Gamechanger artifacts instead of inventing candidates', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uberbond-orchestration-frontier-invalid-'));
  const input = path.join(dir, 'bad.json');
  const output = path.join(dir, 'out.json');
  fs.writeFileSync(input, JSON.stringify({ tournament: { ranked: 'not-an-array' } }));
  const run = spawnSync(process.execPath, [
    path.join(root, 'scripts/orchestration-frontier-tick.mjs'),
    '--input', input,
    '--output', output
  ], { cwd: root, encoding: 'utf8' });
  assert.notEqual(run.status, 0);
  assert.equal(fs.existsSync(output), false);
});
