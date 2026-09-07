import { spawnSync } from 'node:child_process';

const focusedModule = spawnSync(process.execPath, [
  '--test',
  'tests/paypal-module-replay-identity-hostile.test.mjs'
], {
  cwd: process.cwd(),
  encoding: 'utf8',
  env: { ...process.env, NODE_OPTIONS: '' },
  maxBuffer: 64 * 1024 * 1024
});
process.stdout.write(`${focusedModule.stdout || ''}${focusedModule.stderr || ''}`);
if (focusedModule.status !== 0) {
  throw new Error(`paypal-module-replay-focused-failed:exit-${focusedModule.status}`);
}

// Preserve and delegate to the original fail-closed foundry. V2 strengthens
// fail-fast coverage without deleting or weakening the proven V1 mechanism.
await import('./paypal-core-closure-foundry.mjs');
