import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('real worker starts and drains with empty custody and no provider credentials', { timeout: 40000 }, async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'phoenix-worker-'));
  const child = spawn(process.execPath, ['worker.mjs'], {
    cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'],
    env: { PATH: process.env.PATH, NODE_ENV: 'test', PROCESS_ROLE: 'worker', STORE_BACKEND: 'json', DATA_DIR: dataDir, APP_BASE_URL: 'http://127.0.0.1:8999', ADMIN_TOKEN: 'synthetic-worker-test-only' }
  });
  t.after(async () => { child.kill('SIGKILL'); await rm(dataDir, { recursive: true, force: true }); });
  let logs = '';
  const started = new Promise((resolve, reject) => {
    child.stdout.on('data', chunk => { logs += chunk; if (/UberBond worker .* started using json/.test(logs)) resolve(); });
    child.stderr.on('data', chunk => { logs += chunk; });
    child.on('error', reject);
    child.on('exit', code => reject(new Error(`worker exited before ready: ${code}; ${logs}`)));
  });
  await started;
  const exited = new Promise(resolve => child.once('exit', resolve));
  child.kill('SIGTERM');
  assert.equal(await exited, 0, logs);
  assert.match(logs, /worker is draining active jobs/);
  const state = JSON.parse(await readFile(join(dataDir, 'db.json'), 'utf8'));
  for (const key of ['messages', 'outboundEvents', 'revenueEvents', 'accounts']) assert.deepEqual(state[key], [], key);
});
