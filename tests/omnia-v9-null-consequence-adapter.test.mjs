import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NullConsequenceAdapter, NullConsequenceAdapterError, NULL_SINK_RESULT } from '../src/omnia-v9/integrations/null-consequence-adapter.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const adapterPath = path.join(root, 'src/omnia-v9/integrations/null-consequence-adapter.mjs');

const NETWORK_CAPABLE_BUILTINS = new Set(['http', 'https', 'net', 'tls', 'dgram', 'dns', 'node:http', 'node:https', 'node:net', 'node:tls', 'node:dgram', 'node:dns']);
// Matched only against actual import/require specifiers (never prose/comments),
// so a doc comment explaining "this does not import gmail.mjs" cannot trip it.
const FORBIDDEN_SPECIFIER = /gmail|googleapis|oauth|smtp|nodemailer/i;

function extractImportSpecifiers(source) {
  const specifiers = [];
  const importRe = /import\s+(?:[\w*{}\s,]+from\s+)?['"]([^'"]+)['"]/g;
  let match;
  while ((match = importRe.exec(source))) specifiers.push(match[1]);
  return specifiers;
}

async function walkImportGraph(entryPath) {
  const visitedFiles = new Set();
  const visitedBuiltins = new Set();
  const visitedSpecifiers = new Set();
  const queue = [entryPath];
  while (queue.length) {
    const filePath = queue.shift();
    if (visitedFiles.has(filePath)) continue;
    visitedFiles.add(filePath);
    const source = await fs.readFile(filePath, 'utf8');
    for (const specifier of extractImportSpecifiers(source)) {
      visitedSpecifiers.add(specifier);
      assert.doesNotMatch(specifier, FORBIDDEN_SPECIFIER, `${path.relative(root, filePath)} imports a forbidden-shaped specifier: ${specifier}`);
      if (specifier.startsWith('.')) {
        const resolved = path.resolve(path.dirname(filePath), specifier);
        queue.push(resolved);
      } else {
        visitedBuiltins.add(specifier);
        assert(!NETWORK_CAPABLE_BUILTINS.has(specifier), `${path.relative(root, filePath)} imports network-capable builtin ${specifier}`);
      }
    }
  }
  return { visitedFiles, visitedBuiltins, visitedSpecifiers };
}

test('static import-graph inspection: null-consequence-adapter.mjs cannot reach Gmail, any network builtin, or any credential-shaped identifier', async () => {
  const { visitedFiles, visitedBuiltins } = await walkImportGraph(adapterPath);
  assert(visitedFiles.size >= 1);
  for (const file of visitedFiles) {
    assert(!file.toLowerCase().includes('gmail'), `import graph must never include a gmail-named module, found ${file}`);
  }
  for (const builtin of visitedBuiltins) {
    assert(!NETWORK_CAPABLE_BUILTINS.has(builtin), `import graph must never include network-capable builtin ${builtin}`);
  }
});

test('null-consequence-adapter.mjs source text contains no Gmail import statement', async () => {
  const source = await fs.readFile(adapterPath, 'utf8');
  assert.doesNotMatch(source, /from\s+['"].*gmail/i);
  assert.doesNotMatch(source, /require\(['"].*gmail/i);
});

test('execute() records NULL_SINK_ACCEPTED, never EMAIL_SENT or DELIVERED', async () => {
  const adapter = new NullConsequenceAdapter();
  const receipt = await adapter.execute({
    intentDigest: 'a'.repeat(64), authorizationDigest: 'b'.repeat(64),
    tenantId: 'campaign:canary', reservationId: 'res_1', actionClass: 'outbound.null_execute'
  });
  assert.equal(receipt.result, NULL_SINK_RESULT);
  assert.equal(receipt.result, 'NULL_SINK_ACCEPTED');
  assert.notEqual(receipt.result, 'EMAIL_SENT');
  assert.notEqual(receipt.result, 'DELIVERED');
  assert.match(receipt.receiptDigest, /^[a-f0-9]{64}$/);
  assert.equal(adapter.executionCount(), 1);
});

test('execute() rejects incomplete input rather than silently defaulting', async () => {
  const adapter = new NullConsequenceAdapter();
  await assert.rejects(adapter.execute({ intentDigest: '', tenantId: 't', reservationId: 'r', actionClass: 'a' }), NullConsequenceAdapterError);
  await assert.rejects(adapter.execute({ intentDigest: 'a'.repeat(64), tenantId: '', reservationId: 'r', actionClass: 'a' }), NullConsequenceAdapterError);
  assert.equal(adapter.executionCount(), 0);
});

test('two calls to execute() produce two independent receipts, each incrementing the execution count', async () => {
  const adapter = new NullConsequenceAdapter();
  await adapter.execute({ intentDigest: 'a'.repeat(64), tenantId: 't', reservationId: 'r1', actionClass: 'outbound.null_execute' });
  await adapter.execute({ intentDigest: 'b'.repeat(64), tenantId: 't', reservationId: 'r2', actionClass: 'outbound.null_execute' });
  assert.equal(adapter.executionCount(), 2);
  assert.notEqual(adapter.executions[0].receiptDigest, adapter.executions[1].receiptDigest);
});
