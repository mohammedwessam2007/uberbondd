import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import {
  activateUberStaticDeployment,
  compileUberStaticDeployment,
  readUberStaticPointer,
  writeUberStaticDeployment
} from '../src/uberstatic.mjs';

const temp = prefix => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

test('current pointer mutation is refused even when deployment itself remains valid', () => {
  const root = temp('uberstatic-pointer-');
  try {
    const deployment = compileUberStaticDeployment({ files: [{ path: 'index.html', content: 'safe' }] });
    writeUberStaticDeployment({ rootDir: root, deployment });
    activateUberStaticDeployment({ rootDir: root, deploymentId: deployment.manifest.deploymentId, activatedAt: new Date('2026-09-12T00:00:00Z') });
    const pointerFile = path.join(root, 'state', 'current.json');
    const pointer = JSON.parse(fs.readFileSync(pointerFile, 'utf8'));
    pointer.activatedAt = '2026-09-12T00:00:01.000Z';
    fs.writeFileSync(pointerFile, `${JSON.stringify(pointer, null, 2)}\n`);
    assert.throws(() => readUberStaticPointer({ rootDir: root }), /pointer-integrity-failed/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('operator CLI deploys a directory and activates it without source mutation', () => {
  const root = temp('uberstatic-cli-root-');
  const site = temp('uberstatic-cli-site-');
  try {
    fs.mkdirSync(path.join(site, 'assets'));
    fs.writeFileSync(path.join(site, 'index.html'), '<h1>cli</h1>');
    fs.writeFileSync(path.join(site, 'assets', 'app.js'), 'console.log("cli")');
    const result = spawnSync(process.execPath, ['scripts/uberstatic.mjs', 'deploy', site, '--root', root, '--activate', '--label', 'test'], {
      cwd: path.resolve('.'), encoding: 'utf8'
    });
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.status, 'UBERSTATIC_DEPLOYED_AND_ACTIVATED');
    assert.match(parsed.deployment.deploymentId, /^uberstatic_[0-9a-f]{32}$/);
    const listed = spawnSync(process.execPath, ['scripts/uberstatic.mjs', 'list', '--root', root], { cwd: path.resolve('.'), encoding: 'utf8' });
    assert.equal(listed.status, 0, listed.stderr);
    const state = JSON.parse(listed.stdout);
    assert.equal(state.deployments.length, 1);
    assert.equal(state.current.deploymentId, parsed.deployment.deploymentId);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(site, { recursive: true, force: true });
  }
});

test('operator CLI refuses source symlinks', () => {
  const root = temp('uberstatic-cli-root-');
  const site = temp('uberstatic-cli-site-');
  try {
    fs.writeFileSync(path.join(site, 'index.html'), 'safe');
    fs.symlinkSync(path.join(site, 'index.html'), path.join(site, 'alias.html'));
    const result = spawnSync(process.execPath, ['scripts/uberstatic.mjs', 'deploy', site, '--root', root], { cwd: path.resolve('.'), encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /source-symlink-refused/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(site, { recursive: true, force: true });
  }
});
