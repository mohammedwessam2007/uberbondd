import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reachableFromEntryPoints } from '../scripts/system-readiness.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const PRODUCTION_ENTRY_POINTS = ['server.mjs', 'worker.mjs', 'scripts/agent-mesh-tick.mjs'];

function filesIn(dir, extension = '.mjs') {
  try {
    return readdirSync(join(repoRoot, dir))
      .filter(name => name.endsWith(extension))
      .map(name => `${dir}/${name}`);
  } catch {
    return [];
  }
}

function liveReachability() {
  const api = filesIn('api');
  const scripts = filesIn('scripts');
  const production = reachableFromEntryPoints([...PRODUCTION_ENTRY_POINTS, ...api]);
  const anyEntry = reachableFromEntryPoints(['server.mjs', 'worker.mjs', ...scripts, ...api]);
  const all = filesIn('src');
  return {
    all: all.length,
    production: all.filter(file => production.has(file)).length,
    operatorOnly: all.filter(file => !production.has(file) && anyEntry.has(file)).length,
    unreachable: all.filter(file => !anyEntry.has(file)).length
  };
}

function claimedReachability() {
  const text = readFileSync(join(repoRoot, 'docs', 'CURRENT_SYSTEM_STATE.md'), 'utf8');
  const prose = text.match(/\*\*([0-9]+) of ([0-9]+) `src` modules have no entry point at all\*\*/);
  const production = text.match(/\| Reachable from production \| ([0-9]+) \|/);
  const operatorOnly = text.match(/\| Reachable only via an operator script \| ([0-9]+) \|/);
  const unreachable = text.match(/\| \*\*No entry point at all\*\* \| \*\*([0-9]+)\*\* \|/);
  assert.ok(prose && production && operatorOnly && unreachable,
    'CURRENT_SYSTEM_STATE reachability claims must remain machine-readable');
  return {
    all: Number(prose[2]),
    proseUnreachable: Number(prose[1]),
    production: Number(production[1]),
    operatorOnly: Number(operatorOnly[1]),
    unreachable: Number(unreachable[1])
  };
}

test('CURRENT_SYSTEM_STATE reachability claims match the live import graph', () => {
  const live = liveReachability();
  const claimed = claimedReachability();
  assert.equal(claimed.all, live.all, `canon claims ${claimed.all} src modules; ${live.all} exist`);
  assert.equal(claimed.production, live.production,
    `canon claims ${claimed.production} production-reachable modules; ${live.production} are reachable`);
  assert.equal(claimed.operatorOnly, live.operatorOnly,
    `canon claims ${claimed.operatorOnly} operator-only modules; ${live.operatorOnly} are operator-only`);
  assert.equal(claimed.unreachable, live.unreachable,
    `canon claims ${claimed.unreachable} unreachable modules; ${live.unreachable} are unreachable`);
  assert.equal(claimed.proseUnreachable, live.unreachable,
    `canon prose claims ${claimed.proseUnreachable} unreachable modules; ${live.unreachable} are unreachable`);
  assert.equal(live.production + live.operatorOnly + live.unreachable, live.all);
});

test('production reachability cannot fall below the current integrated floor', () => {
  const live = liveReachability();
  assert.ok(live.production >= 107,
    `production reachability fell to ${live.production}; current integrated floor is 107`);
});
