// A module reachable only from tests is not reachable. The suite proves it
// behaves; it proves nothing about whether anything can call it.
//
// That distinction cost this repository three separate discoveries: the mesh
// entry point (#88), the occurrence compiler (#100, found by walking imports
// rather than by any failing test), and the operator escalation kernel, which
// knew eleven ways the system could be in trouble and had no caller. Each was
// implemented, tested, green, and dead.
//
// This is the ratchet. Every src module with no production or operator entry
// point must be classified in config/reachability-classification.json with a
// reason. A new dead module fails this test instead of waiting to be noticed.
//
// It does not require everything to be wired. Plenty of modules are correctly
// unreachable -- wiring outreach without an authorisation path is how a system
// contacts someone by accident. It requires the decision to be written down.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reachableFromEntryPoints } from '../scripts/system-readiness.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const PRODUCTION_ENTRY_POINTS = ['server.mjs', 'worker.mjs', 'scripts/agent-mesh-tick.mjs'];

function filesIn(dir, extension = '.mjs') {
  try {
    return readdirSync(join(repoRoot, dir)).filter(name => name.endsWith(extension)).map(name => `${dir}/${name}`);
  } catch {
    return [];
  }
}

function classification() {
  return JSON.parse(readFileSync(join(repoRoot, 'config', 'reachability-classification.json'), 'utf8'));
}

function partition() {
  const api = filesIn('api');
  const scripts = filesIn('scripts');
  const production = reachableFromEntryPoints([...PRODUCTION_ENTRY_POINTS, ...api]);
  const anyEntry = reachableFromEntryPoints(['server.mjs', 'worker.mjs', ...scripts, ...api]);
  const all = filesIn('src');
  return {
    all,
    production: all.filter(file => production.has(file)),
    operatorOnly: all.filter(file => !production.has(file) && anyEntry.has(file)),
    unreachable: all.filter(file => !anyEntry.has(file))
  };
}

test('every unreachable src module is classified with a reason', () => {
  const { unreachable } = partition();
  const { modules } = classification();

  const unclassified = unreachable.filter(file => !modules[file]);
  assert.deepEqual(unclassified, [],
    `these modules have no entry point and no classification:\n  ${unclassified.join('\n  ')}\n`
    + 'Add them to config/reachability-classification.json, or wire them.');
});

test('no classification describes a module that is actually reachable', () => {
  const { production, operatorOnly } = partition();
  const reachable = new Set([...production, ...operatorOnly]);
  const { modules } = classification();

  const stale = Object.keys(modules).filter(file => reachable.has(file));
  assert.deepEqual(stale, [],
    `these modules are reachable and should be removed from the classification:\n  ${stale.join('\n  ')}`);
});

test('no classification names a module that no longer exists', () => {
  const { all } = partition();
  const present = new Set(all);
  const { modules } = classification();

  const missing = Object.keys(modules).filter(file => !present.has(file));
  assert.deepEqual(missing, [], `classification names deleted modules:\n  ${missing.join('\n  ')}`);
});

test('every classification carries a known category and a real reason', () => {
  const { modules, categories } = classification();
  for (const [file, entry] of Object.entries(modules)) {
    assert.ok(categories[entry.category], `${file}: unknown category ${entry.category}`);
    assert.ok(entry.reason && entry.reason.length > 20, `${file}: reason is too thin to be a decision`);
    if (entry.category === 'AWAITING_ACTIVATION') {
      assert.ok(entry.gate, `${file}: AWAITING_ACTIVATION must name the gate it is waiting on`);
    }
  }
});

test('an UNREACHABLE_BUG classification is a defect and fails until it is fixed', () => {
  const { modules } = classification();
  const bugs = Object.entries(modules).filter(([, entry]) => entry.category === 'UNREACHABLE_BUG');
  assert.deepEqual(bugs.map(([file]) => file), [],
    'a module classified UNREACHABLE_BUG should be wired or reclassified, not left sitting');
});

test('the reachability split is reported, so a regression is visible in the numbers', () => {
  const { all, production, operatorOnly, unreachable } = partition();
  assert.equal(production.length + operatorOnly.length + unreachable.length, all.length);
  // Production reachability must not silently fall. This is a ratchet, not a
  // target: raise it when modules get wired, and never lower it to go green.
  assert.ok(production.length >= 98,
    `production-reachable modules fell to ${production.length}; something was unwired`);
});

test('the entry points this ratchet trusts actually exist', () => {
  for (const entry of PRODUCTION_ENTRY_POINTS) {
    assert.ok(readFileSync(join(repoRoot, entry), 'utf8').length > 0, `${entry} is missing`);
  }
});
