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

// Entry points have to be found recursively, and this is not a tidiness point.
//
// `filesIn` reads one directory level. Every route used to live directly under
// `api/`, so that was invisibly sufficient -- until `api/webhooks/billing.mjs`
// and `api/admin/health-check.mjs` landed. Four modules those routes import
// were then reported as having no entry point at all.
//
// The damage is not a red test. It is what a red test of this shape invites: the
// obvious way to make it green is to add the four modules to the classification
// file as AWAITING_ACTIVATION behind some gate, which would record, durably and
// in the canonical place, that production code wired to a live route is waiting
// on an activation that does not exist. The ratchet exists to stop exactly that
// kind of false statement, so it must not be the thing that produces one.
//
// `src` is now walked recursively too. It was not, and that exemption was never
// a decision -- it was an accident of a single-level `readdirSync` that left
// `src/overnight` and `src/omnia-v9` (58 modules, 11,210 lines) entirely outside
// the ratchet. Six of them are production-reachable, including an outbound
// admission path; 48 had no entry point and no classification, and nothing would
// ever have said so. That is precisely the condition this file exists to make
// impossible, applied to a fifth of the source tree.
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
  return found;
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

test('the reachability split is reported, so a regression is visible in the numbers', () => {
  const { all, production, operatorOnly, unreachable } = partition();
  assert.equal(production.length + operatorOnly.length + unreachable.length, all.length);

  // Production reachability must not silently fall. The previous floor of 103
  // was not raised after the integrated graph reached 107, leaving four modules
  // free to become dead without tripping the ratchet.
  assert.ok(production.length >= 107,
    `production-reachable modules fell to ${production.length}; something was unwired`);

  // CURRENT_SYSTEM_STATE is the human-readable canonical surface. Its static
  // prose previously stayed at 151/103 after the machine-readable readiness
  // artifact had moved to 155/107. Bind the prose to the same live graph so a
  // docs refresh cannot silently leave contradictory reachability truth behind.
  const canon = readFileSync(join(repoRoot, 'docs', 'CURRENT_SYSTEM_STATE.md'), 'utf8');
  const prose = canon.match(/\*\*([0-9]+) of ([0-9]+) `src` modules have no entry point at all\*\*/);
  const claimedProduction = canon.match(/\| Reachable from production \| ([0-9]+) \|/);
  const claimedOperatorOnly = canon.match(/\| Reachable only via an operator script \| ([0-9]+) \|/);
  const claimedUnreachable = canon.match(/\| \*\*No entry point at all\*\* \| \*\*([0-9]+)\*\* \|/);
  assert.ok(prose && claimedProduction && claimedOperatorOnly && claimedUnreachable,
    'CURRENT_SYSTEM_STATE reachability claims must remain machine-readable');
  assert.equal(Number(prose[2]), all.length,
    `canon claims ${prose[2]} src modules; ${all.length} exist`);
  assert.equal(Number(prose[1]), unreachable.length,
    `canon prose claims ${prose[1]} unreachable modules; ${unreachable.length} are unreachable`);
  assert.equal(Number(claimedProduction[1]), production.length,
    `canon claims ${claimedProduction[1]} production-reachable modules; ${production.length} are reachable`);
  assert.equal(Number(claimedOperatorOnly[1]), operatorOnly.length,
    `canon claims ${claimedOperatorOnly[1]} operator-only modules; ${operatorOnly.length} are operator-only`);
  assert.equal(Number(claimedUnreachable[1]), unreachable.length,
    `canon table claims ${claimedUnreachable[1]} unreachable modules; ${unreachable.length} are unreachable`);
});

test('the entry points this ratchet trusts actually exist', () => {
  for (const entry of PRODUCTION_ENTRY_POINTS) {
    assert.ok(readFileSync(join(repoRoot, entry), 'utf8').length > 0, `${entry} is missing`);
  }
});

// The gate registry. Before it existed, `AWAITING_ACTIVATION` required only
// that `gate` be truthy -- `gate: "TODO_FIGURE_THIS_OUT_LATER"` passed all
// seven tests above. That made AWAITING_ACTIVATION a resting state reachable by
// typing anything, which is precisely the failure the ratchet exists to
// prevent: a decision that was never made, wearing the shape of one.
//
// Now a gate must be declared in config/reachability-classification.json with
// what it is and what would release it. Minting a new gate is still allowed --
// it is a reviewable edit to a registry, not a string typed into one module.

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
    // A release condition that restates the gate name is not a condition.
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
