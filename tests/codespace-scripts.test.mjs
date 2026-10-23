import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DOCTOR = 'scripts/codespace/claude-auth-doctor.sh';
const SUP = 'scripts/codespace/tunnel-supervisor.sh';
const baseEnv = (home, extra = {}) => ({ PATH: process.env.PATH, HOME: home, XDG_STATE_HOME: join(home, 'state'), ...extra });
const run = (file, args, env) => spawnSync('bash', [file, ...args], { env, encoding: 'utf8' });

test('all scripts and devcontainer parse', () => {
  for (const f of ['setup.sh', 'start.sh', 'claude-auth-doctor.sh', 'tunnel-supervisor.sh']) {
    assert.equal(spawnSync('bash', ['-n', `scripts/codespace/${f}`]).status, 0, f);
  }
  const dc = JSON.parse(readFileSync('.devcontainer/devcontainer.json', 'utf8'));
  assert.equal(dc.onCreateCommand, 'bash scripts/codespace/setup.sh');
  assert.ok(dc.secrets.CLAUDE_CODE_OAUTH_TOKEN);
  assert.ok(!JSON.stringify(dc).includes('ANTHROPIC_API_KEY'), 'devcontainer must not configure a paid API key');
});

test('doctor flags a paid API key and never echoes secret values', () => {
  const home = mkdtempSync(join(tmpdir(), 'cad-'));
  const r = run(DOCTOR, [], baseEnv(home, { ANTHROPIC_API_KEY: 'sk-ant-SECRETVALUE', CLAUDE_CODE_OAUTH_TOKEN: 'tok-SECRETTOKEN-0123456789-0123456789-0123' }));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /ANTHROPIC_API_KEY is set/);
  assert.doesNotMatch(r.stdout + r.stderr, /SECRETVALUE|SECRETTOKEN/);
});

test('doctor detects whitespace and truncated oauth token', () => {
  const home = mkdtempSync(join(tmpdir(), 'cad-'));
  const r = run(DOCTOR, [], baseEnv(home, { CLAUDE_CODE_OAUTH_TOKEN: 'abc\n' }));
  assert.match(r.stdout, /whitespace/);
  assert.match(r.stdout, /truncated/);
});

test('doctor --fix backs up corrupt credentials instead of deleting them', () => {
  const home = mkdtempSync(join(tmpdir(), 'cad-'));
  mkdirSync(join(home, '.claude'));
  writeFileSync(join(home, '.claude/.credentials.json'), '{not json');
  const r = run(DOCTOR, ['--fix'], baseEnv(home));
  assert.match(r.stdout, /moved stale credentials/);
  assert.ok(!existsSync(join(home, '.claude/.credentials.json')));
  const bk = readdirSync(home).find((d) => d.startsWith('.claude-backup-'));
  assert.ok(bk && existsSync(join(home, bk, '.credentials.json')));
});

test('doctor --brief emits a single line and exits 0', () => {
  const home = mkdtempSync(join(tmpdir(), 'cad-'));
  const r = run(DOCTOR, ['--brief'], baseEnv(home));
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim().split('\n').length, 1);
});

test('supervisor restarts a dying tunnel with backoff and stops at the cap', () => {
  const home = mkdtempSync(join(tmpdir(), 'sup-'));
  const r = spawnSync('bash', [SUP], {
    env: baseEnv(home, { COS_TUNNEL_CMD: 'exit 1', COS_MAX_RESTARTS: '2', COS_HEALTH_INTERVAL: '1' }),
    encoding: 'utf8', timeout: 30000,
  });
  assert.equal(r.status, 0);
  assert.equal((r.stdout.match(/starting tunnel/g) || []).length, 2);
  assert.match(r.stdout, /max restarts reached/);
});

test('supervisor kills and restarts a tunnel that fails health checks', () => {
  const home = mkdtempSync(join(tmpdir(), 'sup-'));
  const r = spawnSync('bash', [SUP], {
    env: baseEnv(home, {
      COS_TUNNEL_CMD: 'sleep 300', COS_HEALTH_URL: 'http://127.0.0.1:9/never', COS_HEALTH_INTERVAL: '1',
      COS_HEALTH_FAILS: '2', COS_MAX_RESTARTS: '1',
    }),
    encoding: 'utf8', timeout: 30000,
  });
  assert.match(r.stdout, /unhealthy; killing tunnel/);
});

test('supervisor refuses to run without a command', () => {
  const home = mkdtempSync(join(tmpdir(), 'sup-'));
  const r = run(SUP, [], baseEnv(home));
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /COS_TUNNEL_CMD/);
});
