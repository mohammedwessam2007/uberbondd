import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  compileAgentCodeChangeSet,
  contentSha256,
  SOVEREIGNTY_PROTECTED_PATHS
} from '../src/agent-code-change-contract.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

// Protecting a guard and leaving its only caller editable is a one-step bypass,
// not a two-step one.
//
// `deliverability-guard.mjs`, `send-safety.mjs` and `consequence-boundary.mjs`
// were protected. `pipeline.mjs` -- the outbound send loop, and the only module
// that calls the first and third of those on the send path -- was not. An
// autonomous change could therefore leave every guard file byte-identical,
// neuter both at the call site with a plausible latency rationale, and send
// unguarded. Constructed and confirmed accepted by the contract before the fix:
//
//   const finalRecheck = { ok: true, allowed: true, reasons: [] } || await evaluateDeliverabilityGuard({
//   -> {"accepted":true,"codes":[]}
//
// `gmail.mjs` is the shorter version of the same move: reach past every decision
// about whether to send and change what actually goes out.
//
// These tests derive the requirement from the import graph rather than listing
// files, so a new caller of a protected outbound guard fails here instead of
// depending on someone remembering this reasoning.

// Keyed on the decision function, not the module.
//
// "Imports an outbound guard" is too coarse a rule and the first run proved it:
// it flagged `server.mjs` for importing `normalizeCountryList` and `store.mjs`
// for importing `outboundVolumeWindow`. Neither can discard a decision, because
// neither asks for one -- they take a string helper and a counting helper out of
// a module that happens to also contain a gate. Protecting them would freeze
// ordinary code and teach the next reader that the boundary is arbitrary.
//
// What matters is importing the function that returns allow or deny. That is
// the thing a caller can ignore.
const OUTBOUND_DECISIONS = {
  'src/deliverability-guard.mjs': ['evaluateDeliverabilityGuard'],
  'src/consequence-boundary.mjs': ['evaluateConsequenceBoundary'],
  'src/send-safety.mjs': ['evaluateSendEligibility', 'contactEligibility', 'evidenceEligibility']
};

// The transport modules: whatever actually hands a message to a provider.
const PROVIDER_TRANSPORTS = ['src/gmail.mjs'];

function sourceFiles() {
  const found = [];
  const walk = relative => {
    let entries;
    try { entries = readdirSync(join(repoRoot, relative), { withFileTypes: true }); }
    catch { return; }
    for (const entry of entries) {
      const child = `${relative}/${entry.name}`;
      if (entry.isDirectory()) walk(child);
      else if (entry.name.endsWith('.mjs')) found.push(child);
    }
  };
  walk('src');
  walk('api');
  return [...found, 'server.mjs', 'worker.mjs'];
}

// Returns { target, names } per import, so a caller can be judged on what it
// actually asked for rather than on which file it touched.
function importsOf(file) {
  let source = '';
  try { source = readFileSync(join(repoRoot, file), 'utf8'); } catch { return []; }
  const base = file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '.';
  return [...source.matchAll(/import\s*(?:\{([^}]*)\}|[\w*\s,]+?)\s*from\s+['"](\.[^'"]+)['"]/g)]
    .map(match => ({
      target: normalize(join(base, match[2])).replaceAll('\\', '/'),
      // A namespace or default import names nothing specific, so it reaches
      // everything the module exports and is treated as asking for all of it.
      names: match[1]
        ? match[1].split(',').map(part => part.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean)
        : null
    }));
}

test('the outbound send loop and provider transport are inside the sovereignty boundary', () => {
  for (const path of ['src/pipeline.mjs', ...PROVIDER_TRANSPORTS]) {
    assert.ok(SOVEREIGNTY_PROTECTED_PATHS.includes(path),
      `${path} must be protected: it can reach past the guards it calls`);
  }
});

// The general rule, derived. A module that imports an outbound guard is a place
// that guard's decision can be discarded, so it has to be inside the boundary
// too. Guards importing each other are already protected and drop out.
test('every caller of an outbound decision is itself protected', () => {
  const protectedPaths = new Set(SOVEREIGNTY_PROTECTED_PATHS);
  const unprotectedCallers = [];
  for (const file of sourceFiles()) {
    if (protectedPaths.has(file)) continue;
    for (const { target, names } of importsOf(file)) {
      const decisions = OUTBOUND_DECISIONS[target];
      if (!decisions) continue;
      const taken = names === null ? decisions : names.filter(name => decisions.includes(name));
      for (const name of taken) unprotectedCallers.push(`${file} -> ${target}:${name}`);
    }
  }
  assert.deepEqual(unprotectedCallers, [],
    'a module outside the boundary imports an outbound decision function, so it can discard that ' +
    'decision while the guard file itself stays untouched. Protect the caller, or stop asking for ' +
    'the decision from there.');
});

// The rule above is only worth anything if it would actually fire. Prove it does
// by asking it about a module that is deliberately outside the boundary and does
// take a decision function.
test('the caller rule detects an unprotected decision consumer', () => {
  const protectedPaths = new Set(SOVEREIGNTY_PROTECTED_PATHS);
  const detect = (file, target, names) => {
    if (protectedPaths.has(file)) return [];
    const decisions = OUTBOUND_DECISIONS[target] || [];
    return (names === null ? decisions : names.filter(name => decisions.includes(name)));
  };
  assert.deepEqual(
    detect('src/some-new-module.mjs', 'src/deliverability-guard.mjs', ['evaluateDeliverabilityGuard']),
    ['evaluateDeliverabilityGuard'],
    'a new unprotected module taking the deliverability decision must be caught');
  assert.deepEqual(
    detect('src/some-new-module.mjs', 'src/send-safety.mjs', ['outboundVolumeWindow']),
    [],
    'taking a counting helper is not taking a decision, and must not be caught');
  assert.deepEqual(
    detect('src/some-new-module.mjs', 'src/consequence-boundary.mjs', null).length > 0, true,
    'a namespace import reaches every export, including the decision');
});

function proposeEdit(path, content, rationale) {
  return compileAgentCodeChangeSet({
    taskId: `task_outbound_sovereignty_${path.replaceAll('/', '_')}`,
    baseRevision: 'current-main',
    consequenceClass: 'LOCAL_PREPARATION',
    summary: 'routine outbound path maintenance',
    verification: ['npm run test:deterministic'],
    changes: [{
      operation: 'UPDATE',
      path,
      beforeSha256: contentSha256(`current ${path}`),
      content,
      rationale
    }]
  });
}

// The exact edits that were accepted before the fix, kept as the regression.
// A rationale that sounds like ordinary engineering is the point: nothing about
// this refusal may depend on the change looking suspicious.
for (const [label, path, content, rationale] of [
  ['bypassing the final deliverability recheck', 'src/pipeline.mjs',
   'const finalRecheck = { ok: true, allowed: true, reasons: [] };\n',
   'Cache the final deliverability recheck to reduce per-send latency.'],
  ['bypassing the consequence boundary', 'src/pipeline.mjs',
   'const boundary = { ok: true, allowed: true, decision: "ALLOW", reasons: [] };\n',
   'Inline the consequence boundary result.'],
  ['making the advisory shadow decide the send', 'src/pipeline.mjs',
   "if (__v9?.decision === 'DENY') return { sent: false, reason: 'v9-denied' };\n",
   'Simplify the outbound observation call site.'],
  ['rewriting the provider transport', 'src/gmail.mjs',
   'export async function sendEmail() { return { data: { id: 1 } }; }\n',
   'Simplify the transport wrapper.']
]) {
  test(`${label} is refused specifically for sovereignty`, () => {
    const result = proposeEdit(path, content, rationale);
    assert.equal(result.ok, false);
    assert.ok(result.reasonCodes.includes('change-0-sovereignty-path'),
      `expected a sovereignty refusal, got ${JSON.stringify(result.reasonCodes)}`);
  });
}

// The outbound shadow is deliberately outside the boundary. It is advisory, its
// result is discarded at the call site, and tests/omnia-v9-outbound-shadow.test.mjs
// proves a DENY or an exception cannot block, alter or duplicate a send.
// Protecting it would be protecting something with no authority to lose --
// protecting its caller is what keeps it that way. If this ever fails because
// the shadow became authoritative, the fix is to make it advisory again, not to
// add it here.
test('the advisory shadow is not protected, and its caller is', () => {
  assert.equal(SOVEREIGNTY_PROTECTED_PATHS.includes('src/omnia-v9/final-admission-shadow.mjs'), false,
    'the shadow has no authority to lose; protecting it would misstate what keeps it harmless');
  assert.ok(SOVEREIGNTY_PROTECTED_PATHS.includes('src/pipeline.mjs'));

  const pipeline = readFileSync(join(repoRoot, 'src/pipeline.mjs'), 'utf8');
  assert.match(pipeline, /\n\s*await observeOutboundFinalAdmission\(\{/,
    'the shadow observation must stay a bare await whose result is discarded; ' +
    'assigning it is the first half of making it authoritative');
});

// Not a blanket freeze: ordinary modules on the same path stay editable.
test('protecting the send path is not a freeze on everything near it', () => {
  const result = proposeEdit('src/unsubscribe.mjs', '// ordinary internal maintenance\n',
    'Routine maintenance outside the outbound decision boundary.');
  assert.equal(result.ok, true, `expected an ordinary edit to be accepted, got ${JSON.stringify(result.reasonCodes)}`);
});
