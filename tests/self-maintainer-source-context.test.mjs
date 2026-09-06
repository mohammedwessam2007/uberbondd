import test from 'node:test';
import assert from 'node:assert/strict';
import { contentSha256 } from '../src/agent-code-change-contract.mjs';
import {
  buildLocalSourceContext,
  buildLocalSourceInventory,
  normalizeSourcePath,
  validateSourceContextEnvelope,
  validateSourceInventoryEnvelope
} from '../.github/workflows/runtime/self-maintainer-source-context.mjs';

const BASE = 'b'.repeat(40);

function gitRunner(paths = ['tests/a.test.mjs', 'src/a.mjs', './src/a.mjs', 'assets/logo.png', 'node_modules/x.mjs']) {
  return async (_repoRoot, args) => {
    if (args[0] === 'rev-parse') return `${BASE}\n`;
    if (args[0] === 'ls-files') return `${paths.join('\0')}\0`;
    throw new Error(`unexpected git command ${args.join(' ')}`);
  };
}

test('exact checkout inventory is canonical, deterministic, deduped and excludes binary/vendor paths', async () => {
  const inventory = await buildLocalSourceInventory({ repoRoot: '/repo', expectedSha: BASE, runGit: gitRunner() });
  assert.equal(inventory.ok, true, JSON.stringify(inventory));
  assert.deepEqual(inventory.paths, ['src/a.mjs', 'tests/a.test.mjs']);
  assert.equal(inventory.pathCount, 2);
  assert.equal(inventory.inventoryDigest, contentSha256(JSON.stringify(inventory.paths)));
  assert.equal(inventory.byteLength, Buffer.byteLength(JSON.stringify(inventory.paths)));

  const validated = validateSourceInventoryEnvelope(inventory, BASE);
  assert.equal(validated.ok, true, JSON.stringify(validated));
  assert.deepEqual(validated.paths, inventory.paths);
});

test('inventory proof rejects wrong checkout SHA, tampered digest, noncanonical path and ordering drift', async () => {
  const mismatch = await buildLocalSourceInventory({
    repoRoot: '/repo', expectedSha: BASE,
    runGit: async (_root, args) => args[0] === 'rev-parse' ? `${'c'.repeat(40)}\n` : 'src/a.mjs\0'
  });
  assert.equal(mismatch.ok, false);
  assert.ok(mismatch.reasonCodes.includes('local-checkout-sha-mismatch'));

  const inventory = await buildLocalSourceInventory({ repoRoot: '/repo', expectedSha: BASE, runGit: gitRunner(['src/a.mjs', 'tests/a.test.mjs']) });
  const tampered = validateSourceInventoryEnvelope({ ...inventory, inventoryDigest: 'f'.repeat(64) }, BASE);
  assert.equal(tampered.ok, false);
  assert.ok(tampered.reasonCodes.includes('source-inventory-digest-mismatch'));

  const reordered = validateSourceInventoryEnvelope({
    ...inventory,
    paths: [...inventory.paths].reverse(),
    inventoryDigest: contentSha256(JSON.stringify([...inventory.paths].reverse()))
  }, BASE);
  assert.equal(reordered.ok, false);
  assert.ok(reordered.reasonCodes.includes('source-inventory-path-order-invalid'));

  assert.equal(normalizeSourcePath('../escape.mjs'), null);
  assert.equal(normalizeSourcePath('/absolute.mjs'), null);
  assert.equal(normalizeSourcePath('C:\\escape.mjs'), null);
});

test('selected context reads exact bytes locally and binds per-file SHA-256 to the inventory', async () => {
  const inventory = await buildLocalSourceInventory({ repoRoot: '/repo', expectedSha: BASE, runGit: gitRunner(['src/a.mjs', 'tests/a.test.mjs']) });
  const bytes = new Map([
    ['/repo/src/a.mjs', Buffer.from('export const a = 1;\n')],
    ['/repo/tests/a.test.mjs', Buffer.from('test();\n')]
  ]);
  const context = await buildLocalSourceContext({
    repoRoot: '/repo',
    expectedSha: BASE,
    inventory,
    selectedPaths: ['src/a.mjs'],
    runGit: gitRunner(['src/a.mjs', 'tests/a.test.mjs']),
    readFile: async absolute => bytes.get(absolute)
  });
  assert.equal(context.ok, true, JSON.stringify(context));
  assert.equal(context.files.length, 1);
  assert.equal(context.files[0].path, 'src/a.mjs');
  assert.equal(context.files[0].sha256, contentSha256('export const a = 1;\n'));
  assert.equal(context.inventoryDigest, inventory.inventoryDigest);
  assert.match(context.sourceContextDigest, /^[a-f0-9]{64}$/);

  const validated = validateSourceContextEnvelope(context, BASE);
  assert.equal(validated.ok, true, JSON.stringify(validated));
  assert.equal(validated.files[0].content, 'export const a = 1;\n');
});

test('context selection cannot escape exact inventory and tampered content fails digest validation', async () => {
  const inventory = await buildLocalSourceInventory({ repoRoot: '/repo', expectedSha: BASE, runGit: gitRunner(['src/a.mjs']) });
  const outside = await buildLocalSourceContext({
    repoRoot: '/repo', expectedSha: BASE, inventory, selectedPaths: ['src/not-tracked.mjs'],
    runGit: gitRunner(['src/a.mjs']), readFile: async () => Buffer.from('x')
  });
  assert.equal(outside.ok, false);
  assert.ok(outside.reasonCodes.some(code => code.includes('not-in-exact-inventory')));

  const context = await buildLocalSourceContext({
    repoRoot: '/repo', expectedSha: BASE, inventory, selectedPaths: ['src/a.mjs'],
    runGit: gitRunner(['src/a.mjs']), readFile: async () => Buffer.from('export const a = 1;\n')
  });
  const tampered = structuredClone(context);
  tampered.files[0].content = 'export const a = 999;\n';
  const rejected = validateSourceContextEnvelope(tampered, BASE);
  assert.equal(rejected.ok, false);
  assert.ok(rejected.reasonCodes.some(code => code.includes('digest-mismatch')));
});
