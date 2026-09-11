#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
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

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] : null;
}

function args(name) {
  const out = [];
  for (let index = 0; index < process.argv.length - 1; index += 1) if (process.argv[index] === name) out.push(process.argv[index + 1]);
  return out;
}

function command() {
  return process.argv[2] || 'help';
}

function rootDir() {
  return path.resolve(arg('--root') || process.env.UBERSTATIC_ROOT || '.uberstatic');
}

function readTree(dir) {
  const root = path.resolve(dir);
  const stat = fs.lstatSync(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('uberstatic-source-directory-required');
  const files = [];
  const walk = current => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(current, entry.name);
      const lstat = fs.lstatSync(absolute);
      if (lstat.isSymbolicLink()) throw new Error(`uberstatic-source-symlink-refused:${path.relative(root, absolute)}`);
      if (lstat.isDirectory()) walk(absolute);
      else if (lstat.isFile()) files.push({ path: path.relative(root, absolute).split(path.sep).join('/'), content: fs.readFileSync(absolute) });
      else throw new Error(`uberstatic-source-entry-refused:${path.relative(root, absolute)}`);
    }
  };
  walk(root);
  return files;
}

function passwordFromArgs() {
  const envName = arg('--password-env');
  if (!envName) return null;
  if (!/^[A-Z_][A-Z0-9_]*$/.test(envName)) throw new Error('uberstatic-password-env-name-invalid');
  const value = process.env[envName];
  if (!value) throw new Error('uberstatic-password-env-missing');
  return value;
}

function output(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function main() {
  const cmd = command();
  const root = rootDir();
  if (cmd === 'deploy') {
    const dir = process.argv[3];
    if (!dir || dir.startsWith('--')) throw new Error('usage: uberstatic deploy <dir> [--activate]');
    const deployment = compileUberStaticDeployment({ files: readTree(dir), labels: args('--label'), sourceCommit: arg('--source') });
    const written = writeUberStaticDeployment({ rootDir: root, deployment });
    let activation = null;
    if (process.argv.includes('--activate')) activation = activateUberStaticDeployment({ rootDir: root, deploymentId: deployment.manifest.deploymentId, password: passwordFromArgs() });
    return output({ ok: true, status: activation ? 'UBERSTATIC_DEPLOYED_AND_ACTIVATED' : written.status, deployment: written.manifest, activation: activation?.pointer || null, root });
  }
  if (cmd === 'list') return output({ ok: true, status: 'UBERSTATIC_DEPLOYMENTS_LISTED', deployments: listUberStaticDeployments({ rootDir: root }), current: readUberStaticPointer({ rootDir: root }) });
  if (cmd === 'get') {
    const deploymentId = process.argv[3];
    return output(verifyUberStaticDeployment({ rootDir: root, deploymentId }));
  }
  if (cmd === 'activate') {
    const deploymentId = process.argv[3];
    return output(activateUberStaticDeployment({ rootDir: root, deploymentId, password: passwordFromArgs() }));
  }
  if (cmd === 'rollback') return output(rollbackUberStaticDeployment({ rootDir: root }));
  if (cmd === 'delete') {
    const deploymentId = process.argv[3];
    return output(deleteUberStaticDeployment({ rootDir: root, deploymentId, confirmDeploymentId: arg('--confirm') }));
  }
  if (cmd === 'serve') {
    const port = Number(arg('--port') || process.env.PORT || 8787);
    const host = arg('--host') || process.env.HOST || '127.0.0.1';
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('uberstatic-port-invalid');
    const started = await startUberStaticServer({ rootDir: root, host, port });
    output({ ok: true, status: 'UBERSTATIC_SERVER_LISTENING', url: started.url, root });
    return;
  }
  output({
    ok: true,
    status: 'UBERSTATIC_HELP',
    commands: [
      'deploy <dir> [--root PATH] [--source SHA] [--label NAME ...] [--activate] [--password-env ENV]',
      'list [--root PATH]',
      'get <deploymentId> [--root PATH]',
      'activate <deploymentId> [--root PATH] [--password-env ENV]',
      'rollback [--root PATH]',
      'delete <deploymentId> --confirm <deploymentId> [--root PATH]',
      'serve [--root PATH] [--host 127.0.0.1] [--port 8787]'
    ],
    businessEffectAuthority: 'STATIC_CONTENT_ONLY'
  });
}

main().catch(error => {
  process.stderr.write(`${JSON.stringify({ ok: false, status: 'UBERSTATIC_COMMAND_FAILED', reason: error?.message || 'unknown-error' })}\n`);
  process.exitCode = 1;
});
