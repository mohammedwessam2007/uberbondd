import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

function tempTask(root, baseRevision) {
  const task = path.join(root, 'task.json');
  const result = path.join(root, 'result.json');
  fs.writeFileSync(task, JSON.stringify({
    taskId: 'context-admission-test',
    consequenceClass: 'LOCAL_PREPARATION',
    baseRevision,
    objective: 'Do not reach model before context admission.'
  }));
  return { task, result };
}

test('native isolated worker refuses before model access when Context Projection is absent', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'uberbond-worker-context-admission-'));
  try {
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const { task, result } = tempTask(tmp, head);
    const execution = spawnSync(process.execPath, ['scripts/sovereign-native-local-model-worker.mjs', task, result], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        UBERBOND_SOURCE_ROOT: process.cwd(),
        UBERBOND_WORKER_CONTEXT_PATH: path.join(tmp, 'missing-context.json'),
        UBERBOND_MODEL_PROXY_SOCKET: path.join(tmp, 'must-not-be-contacted.sock')
      },
      encoding: 'utf8'
    });
    assert.equal(execution.status, 2);
    const receipt = JSON.parse(fs.readFileSync(result, 'utf8'));
    assert.equal(receipt.ok, false);
    assert.ok(receipt.reasonCodes.includes('verified-worker-context-projection-required'));
    assert.ok(receipt.reasonCodes.includes('context-projection-object-required'));
    assert.equal(fs.existsSync(path.join(tmp, 'must-not-be-contacted.sock')), false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('worker source and authorctl encode the Context Projection boundary before model reasoning', () => {
  const worker = readFileSync(new URL('../scripts/sovereign-native-local-model-worker.mjs', import.meta.url), 'utf8');
  const authorctl = readFileSync(new URL('../ops/sovereign/uberbond-authorctl', import.meta.url), 'utf8');
  assert.match(worker, /verifyContextProjection/);
  assert.match(worker, /audience:'isolated-worker'/);
  assert.ok(worker.indexOf('verifyContextProjection') < worker.indexOf('callModel'));
  assert.match(worker, /context:sovereign-context-projection/);
  assert.match(authorctl, /scripts\/sovereign-context-project-worker\.mjs/);
  const wake = authorctl.slice(authorctl.indexOf('wake(){'), authorctl.indexOf('\nverify(){'));
  assert.ok(wake.indexOf('context_sync') < wake.indexOf('publish_worker_context'));
  assert.ok(wake.indexOf('publish_worker_context') < wake.indexOf('scripts/sovereign-autonomy-pulse.mjs'));
});
