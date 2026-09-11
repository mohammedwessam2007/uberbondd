import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  activateUberStaticDeployment,
  compileUberStaticDeployment,
  deleteUberStaticDeployment,
  listUberStaticDeployments,
  readUberStaticPointer,
  rollbackUberStaticDeployment,
  verifyUberStaticDeployment,
  writeUberStaticDeployment
} from '../src/uberstatic.mjs';
import { startUberStaticServer } from '../src/uberstatic-runtime.mjs';

const SHA = 'a'.repeat(40);
const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'uberstatic-'));
const files = body => [
  { path: 'index.html', content: `<h1>${body}</h1>` },
  { path: 'assets/app.js', content: `window.release=${JSON.stringify(body)}` }
];

async function close(server) {
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

test('deployment identity is deterministic and immutable payload verifies', () => {
  const root = temp();
  try {
    const first = compileUberStaticDeployment({ files: files('one'), labels: ['prod'], sourceCommit: SHA });
    const second = compileUberStaticDeployment({ files: files('one'), labels: ['prod'], sourceCommit: SHA });
    assert.equal(first.manifest.deploymentId, second.manifest.deploymentId);
    const written = writeUberStaticDeployment({ rootDir: root, deployment: first });
    assert.equal(written.ok, true);
    assert.equal(written.status, 'UBERSTATIC_DEPLOYMENT_WRITTEN');
    assert.equal(writeUberStaticDeployment({ rootDir: root, deployment: second }).status, 'UBERSTATIC_DEPLOYMENT_ALREADY_PRESENT');
    assert.equal(listUberStaticDeployments({ rootDir: root }).length, 1);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('traversal duplicate path and invalid source identity fail closed', () => {
  assert.throws(() => compileUberStaticDeployment({ files: [{ path: '../x', content: 'x' }] }), /traversal/);
  assert.throws(() => compileUberStaticDeployment({ files: [{ path: 'a.txt', content: 'x' }, { path: 'a.txt', content: 'y' }] }), /duplicate/);
  assert.throws(() => compileUberStaticDeployment({ files: [{ path: 'a.txt', content: 'x' }], sourceCommit: 'nope' }), /source-commit/);
});

test('payload mutation is detected before activation', () => {
  const root = temp();
  try {
    const deployment = compileUberStaticDeployment({ files: files('one'), sourceCommit: SHA });
    writeUberStaticDeployment({ rootDir: root, deployment });
    const file = path.join(root, 'deployments', deployment.manifest.deploymentId, 'payload', 'index.html');
    fs.writeFileSync(file, 'tampered');
    const verified = verifyUberStaticDeployment({ rootDir: root, deploymentId: deployment.manifest.deploymentId });
    assert.equal(verified.ok, false);
    assert.match(verified.reasonCodes.join(','), /payload-/);
    assert.throws(() => activateUberStaticDeployment({ rootDir: root, deploymentId: deployment.manifest.deploymentId }), /activation-target-invalid/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('cutover and rollback are atomic and preserve immutable history', () => {
  const root = temp();
  try {
    const one = compileUberStaticDeployment({ files: files('one'), sourceCommit: SHA });
    const two = compileUberStaticDeployment({ files: files('two'), sourceCommit: SHA });
    writeUberStaticDeployment({ rootDir: root, deployment: one });
    writeUberStaticDeployment({ rootDir: root, deployment: two });
    activateUberStaticDeployment({ rootDir: root, deploymentId: one.manifest.deploymentId, activatedAt: new Date('2026-09-12T00:00:00Z') });
    activateUberStaticDeployment({ rootDir: root, deploymentId: two.manifest.deploymentId, activatedAt: new Date('2026-09-12T00:01:00Z') });
    let pointer = readUberStaticPointer({ rootDir: root });
    assert.equal(pointer.deploymentId, two.manifest.deploymentId);
    assert.equal(pointer.previousDeploymentId, one.manifest.deploymentId);
    const activationCount = fs.readdirSync(path.join(root, 'activations')).length;
    rollbackUberStaticDeployment({ rootDir: root, activatedAt: new Date('2026-09-12T00:02:00Z') });
    pointer = readUberStaticPointer({ rootDir: root });
    assert.equal(pointer.deploymentId, one.manifest.deploymentId);
    assert.ok(fs.readdirSync(path.join(root, 'activations')).length > activationCount);
    assert.equal(verifyUberStaticDeployment({ rootDir: root, deploymentId: two.manifest.deploymentId }).ok, true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('active deployment cannot be deleted and destructive delete requires exact confirmation', () => {
  const root = temp();
  try {
    const one = compileUberStaticDeployment({ files: files('one') });
    const two = compileUberStaticDeployment({ files: files('two') });
    writeUberStaticDeployment({ rootDir: root, deployment: one });
    writeUberStaticDeployment({ rootDir: root, deployment: two });
    activateUberStaticDeployment({ rootDir: root, deploymentId: one.manifest.deploymentId });
    assert.throws(() => deleteUberStaticDeployment({ rootDir: root, deploymentId: two.manifest.deploymentId, confirmDeploymentId: 'wrong' }), /confirmation/);
    assert.throws(() => deleteUberStaticDeployment({ rootDir: root, deploymentId: one.manifest.deploymentId, confirmDeploymentId: one.manifest.deploymentId }), /active-deployment/);
    const deleted = deleteUberStaticDeployment({ rootDir: root, deploymentId: two.manifest.deploymentId, confirmDeploymentId: two.manifest.deploymentId });
    assert.equal(deleted.ok, true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('HTTP runtime serves current deployment and health exposes exact release identity', async () => {
  const root = temp();
  let server;
  try {
    const deployment = compileUberStaticDeployment({ files: files('live'), sourceCommit: SHA });
    writeUberStaticDeployment({ rootDir: root, deployment });
    activateUberStaticDeployment({ rootDir: root, deploymentId: deployment.manifest.deploymentId });
    const started = await startUberStaticServer({ rootDir: root });
    server = started.server;
    const page = await fetch(`${started.url}/`);
    assert.equal(page.status, 200);
    assert.equal(await page.text(), '<h1>live</h1>');
    assert.equal(page.headers.get('x-uberstatic-deployment'), deployment.manifest.deploymentId);
    const health = await fetch(`${started.url}/__uberstatic/health`).then(response => response.json());
    assert.equal(health.ok, true);
    assert.equal(health.deploymentId, deployment.manifest.deploymentId);
    assert.equal(health.sourceCommit, SHA);
  } finally {
    if (server) await close(server);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('password-protected deployment refuses anonymous and wrong-password reads', async () => {
  const root = temp();
  let server;
  try {
    const deployment = compileUberStaticDeployment({ files: files('secret') });
    writeUberStaticDeployment({ rootDir: root, deployment });
    activateUberStaticDeployment({ rootDir: root, deploymentId: deployment.manifest.deploymentId, password: 'correct-horse' });
    const started = await startUberStaticServer({ rootDir: root });
    server = started.server;
    assert.equal((await fetch(`${started.url}/`)).status, 401);
    assert.equal((await fetch(`${started.url}/`, { headers: { 'x-uberstatic-password': 'wrong' } })).status, 401);
    const allowed = await fetch(`${started.url}/`, { headers: { 'x-uberstatic-password': 'correct-horse' } });
    assert.equal(allowed.status, 200);
    assert.equal(await allowed.text(), '<h1>secret</h1>');
    const health = await fetch(`${started.url}/__uberstatic/health`).then(response => response.json());
    assert.equal(health.protected, true);
  } finally {
    if (server) await close(server);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('encoded traversal never escapes deployment root', async () => {
  const root = temp();
  let server;
  try {
    const deployment = compileUberStaticDeployment({ files: files('safe') });
    writeUberStaticDeployment({ rootDir: root, deployment });
    activateUberStaticDeployment({ rootDir: root, deploymentId: deployment.manifest.deploymentId });
    const started = await startUberStaticServer({ rootDir: root });
    server = started.server;
    const response = await fetch(`${started.url}/%2e%2e/%2e%2e/etc/passwd`);
    assert.notEqual(response.status, 200);
    assert.doesNotMatch(await response.text(), /root:/);
  } finally {
    if (server) await close(server);
    fs.rmSync(root, { recursive: true, force: true });
  }
});
