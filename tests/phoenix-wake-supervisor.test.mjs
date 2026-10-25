import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const script = 'scripts/codespace/tunnel-supervisor.sh';
const env = extra => ({ ...process.env, XDG_STATE_HOME: mkdtempSync(join(tmpdir(), 'phoenix-supervisor-')), ...extra });
test('shell source parses and invalid numeric configuration refuses', () => {
  assert.equal(spawnSync('bash', ['-n', script]).status, 0);
  assert.equal(spawnSync('bash', ['-n', 'scripts/codespace/phoenix-start.sh']).status, 0);
  const r = spawnSync('bash', [script], { env: env({ COS_TUNNEL_CMD: 'true', COS_HEALTH_INTERVAL: 'bad' }) }); assert.equal(r.status, 2);
});
test('supervisor refuses external health destinations', () => {
  assert.equal(spawnSync('bash', [script], { env: env({ COS_TUNNEL_CMD: 'true', COS_HEALTH_URL: 'https://example.com/' }) }).status, 2);
});
test('crash recovery is bounded and lock is exclusive; shutdown removes owned child', async () => {
  const e = env({ COS_TUNNEL_CMD: 'sleep 60', COS_HEALTH_INTERVAL: '1' });
  const p = spawn('bash', [script], { env: e });
  const done = new Promise(r => p.on('exit', r));
  for (let n = 0; n < 100 && !existsSync(join(e.XDG_STATE_HOME, 'uberbond/tunnel.pid')); n++) await new Promise(r => setTimeout(r, 20));
  const second = spawnSync('bash', [script], { env: e, encoding: 'utf8', timeout: 3000 }); assert.equal(second.status, 0); assert.match(second.stdout, /holds the lock/);
  p.kill('SIGTERM'); await done; assert.equal(existsSync(join(e.XDG_STATE_HOME, 'uberbond/tunnel.pid')), false);
  const crash = spawnSync('bash', [script], { env: env({ COS_TUNNEL_CMD: 'exit 1', COS_HEALTH_INTERVAL: '1', COS_MAX_RESTARTS: '2' }), timeout: 15000, encoding: 'utf8' });
  assert.equal(crash.status, 0); assert.equal((crash.stdout.match(/starting tunnel/g) || []).length, 2); assert.match(crash.stdout, /max restarts reached/);
});
