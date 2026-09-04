#!/usr/bin/env node
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reachableFromEntryPoints } from './system-readiness.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const PRODUCTION_ENTRY_POINTS = ['server.mjs', 'worker.mjs', 'scripts/agent-mesh-tick.mjs'];

function entryPointsIn(dir, extension = '.mjs') {
  const found = [];
  const walk = relative => {
    let entries;
    try { entries = readdirSync(join(repoRoot, relative), { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const child = `${relative}/${entry.name}`;
      if (entry.isDirectory()) walk(child);
      else if (entry.name.endsWith(extension)) found.push(child);
    }
  };
  walk(dir);
  return found;
}

const api = entryPointsIn('api');
const scripts = entryPointsIn('scripts');
const productionGraph = reachableFromEntryPoints([...PRODUCTION_ENTRY_POINTS, ...api]);
const anyEntry = reachableFromEntryPoints(['server.mjs', 'worker.mjs', ...scripts, ...api]);
const all = entryPointsIn('src');
const production = all.filter(file => productionGraph.has(file));
const operatorOnly = all.filter(file => !productionGraph.has(file) && anyEntry.has(file));
const unreachable = all.filter(file => !anyEntry.has(file));
console.log(`GENESIS_CLOSURE_MEASURE ${JSON.stringify({srcModules: all.length, reachableFromProduction: production.length, reachableFromOperatorScriptsOnly: operatorOnly.length, noEntryPointAtAll: unreachable.length})}`);
