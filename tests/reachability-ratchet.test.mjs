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
import { measureReachability, reachableFromEntryPoints } from '../scripts/system-readiness.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const PRODUCTION_ENTRY_POINTS = ['server.mjs', 'worker.mjs', 'scripts/agent-mesh-tick.mjs'];

// Entry points have to be found recursively, and this is not a tidiness point.
//
// Every route used to live directly under api/, so a one-level read was
// invisibly sufficient until nested routes landed. src is walked recursively
// for the same reason: a nested source tree cannot be allowed to fall outside
// the reachability ratchet by accident.
function entryPointsIn(dir, extension = '.mjs') {
  const found = [];
  const walk = relative => {
    let entries;
    try { entries = readdirSync(join(repoRoot, relative), { withFileTypes: true }); }
    catch { return; }
    for (const entry of entries) {
      const child = `${relative}/${entry.name}`;
      if (entry.isDirectory()) walk(child);
      else if (entry.name.endsWith(extension)) found.push(child);
    }
  };
  walk(dir);
  return found.sort();
}

function classification() {
  return JSON.parse(readFileSync(join(repoRoot, 'config', 'reachability-classification.json'), 'utf8'));
}

function partition() {
  const api = entryPointsIn('api');
  const scripts = entryPointsIn('scripts');
  const production = reachableFromEntryPoints([...PRODUCTION_ENTRY_POINTS, ...api]);
  const anyEntry = reachableFromEntryPoints(['server.mjs', 'worker.mjs', ...scripts, ...api]);
  const all = entryPointsIn('src');
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

test('the reachability split is live-computed and production reachability cannot silently fall', () => {
  const { all, production, operatorOnly, unreachable } = partition();
  assert.equal(production.length + operatorOnly.length + unreachable.length, all.length);

  // Production reachability must not silently fall. The floor is intentionally
  // conservative; live graph totals may increase as capabilities are wired.
  assert.ok(production.length >= 107,
    `production-reachable modules fell to ${production.length}; something was unwired`);

  // The readiness generator is the machine-readable present-tense surface.
  // Bind it to this same executable partition instead of trusting an older
  // recorded packet from config/system-readiness-input.json.
  const measured = measureReachability();
  assert.equal(measured.measurementMode, 'LIVE_COMPUTED_FROM_IMPORT_GRAPH');
  assert.equal(measured.srcModules, all.length);
  assert.equal(measured.reachableFromProduction, production.length);
  assert.equal(measured.reachableFromOperatorScriptsOnly, operatorOnly.length);
  assert.equal(measured.noEntryPointAtAll, unreachable.length);
  assert.equal(measured.partitionExact, true);

  // Do not duplicate volatile live graph counts in prose. That practice failed
  // repeatedly: CURRENT_SYSTEM_STATE stayed numerically stale while the graph
  // moved. Human canon identifies the executable authority and leaves counts to
  // the live-generated readiness/report surfaces.
  const canon = readFileSync(join(repoRoot, 'docs', 'CURRENT_SYSTEM_STATE.md'), 'utf8');
  assert.match(canon,
    /Reachability source:\s*`tests\/reachability-ratchet\.test\.mjs`\s*\(LIVE_COMPUTED\)/,
    'CURRENT_SYSTEM_STATE must identify the live-computed reachability gate');
  assert.doesNotMatch(canon, /\| Reachable from production \|\s*[0-9]+\s*\|/,
    'human canon must not duplicate a live production-reachability count');
  assert.doesNotMatch(canon, /\| Reachable only via an operator script \|\s*[0-9]+\s*\|/,
    'human canon must not duplicate a live operator-only count');
});

test('the entry points this ratchet trusts actually exist', () => {
  for (const entry of PRODUCTION_ENTRY_POINTS) {
    assert.ok(readFileSync(join(repoRoot, entry), 'utf8').length > 0, `${entry} is missing`);
  }
});

// The gate registry. Before it existed, AWAITING_ACTIVATION required only that
// gate be truthy. Now a gate must be declared with what it is and what observable
// condition would release it.
test('every AWAITING_ACTIVATION module names a gate that is actually registered', () => {
  const { modules, gates } = classification();
  assert.ok(gates, 'the classification must declare a gates registry');
  const unregistered = Object.entries(modules)
    .filter(([, entry]) => entry.category === 'AWAITING_ACTIVATION' && !gates[entry.gate])
    .map(([file, entry]) => `${file} -> ${entry.gate}`);
  assert.deepEqual(unregistered, [],
    `these modules wait on gates that do not exist:\n  ${unregistered.join('\n  ')}\n`
    + 'Register the gate with a description and a release condition, or use an existing one.');
});

test('every registered gate is still holding something back', () => {
  const { modules, gates } = classification();
  const used = new Set(Object.values(modules).map(entry => entry.gate).filter(Boolean));
  const stale = Object.keys(gates).filter(gate => !used.has(gate));
  assert.deepEqual(stale, [],
    `these gates block nothing and should be removed:\n  ${stale.join('\n  ')}`);
});

test('every gate states what it is and what would release it', () => {
  const { gates } = classification();
  for (const [gate, entry] of Object.entries(gates)) {
    assert.ok(entry.description && entry.description.length > 40,
      `${gate}: description is too thin to explain what is blocked`);
    assert.ok(entry.releasedBy && entry.releasedBy.length > 20,
      `${gate}: must state the observable condition that releases it`);
    assert.notEqual(entry.releasedBy.trim().toUpperCase(), gate,
      `${gate}: releasedBy restates the gate name instead of naming a condition`);
  }
});

test('a module may not sit in NEEDS_TRIAGE while also claiming a gate', () => {
  const { modules } = classification();
  const confused = Object.entries(modules)
    .filter(([, entry]) => entry.category === 'NEEDS_TRIAGE' && entry.gate)
    .map(([file]) => file);
  assert.deepEqual(confused, [],
    'NEEDS_TRIAGE means no decision has been made; naming a gate is a decision');
});
