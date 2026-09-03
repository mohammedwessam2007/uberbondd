import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { reachableFromEntryPoints } from '../scripts/system-readiness.mjs';

const repoRoot = join(process.cwd(), '..');
const productionEntries = ['server.mjs','worker.mjs','scripts/agent-mesh-tick.mjs'];

function entryPointsIn(dir, extension = '.mjs') {
  const found = [];
  const walk = relative => {
    let entries = [];
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

const api = entryPointsIn('api').filter(file => file !== 'api/reachability-diagnostic.mjs');
const scripts = entryPointsIn('scripts');
const all = entryPointsIn('src');
const production = reachableFromEntryPoints([...productionEntries, ...api]);
const anyEntry = reachableFromEntryPoints(['server.mjs','worker.mjs', ...scripts, ...api]);
const productionFiles = all.filter(file => production.has(file));
const operatorOnly = all.filter(file => !production.has(file) && anyEntry.has(file));
const unreachable = all.filter(file => !anyEntry.has(file));
const config = JSON.parse(readFileSync(join(repoRoot, 'config/reachability-classification.json'), 'utf8'));
const classified = Object.keys(config.modules || {});
const classifiedSet = new Set(classified);
const unclassified = unreachable.filter(file => !classifiedSet.has(file));
const stale = classified.filter(file => anyEntry.has(file));
console.log('UBERBOND_REACHABILITY_DIAGNOSTIC=' + JSON.stringify({
  sourceModules: all.length,
  production: productionFiles.length,
  operatorOnly: operatorOnly.length,
  unreachable: unreachable.length,
  classified: classified.length,
  unclassified,
  stale
}));
