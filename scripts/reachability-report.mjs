import { readdirSync } from 'node:fs';
import { reachableFromEntryPoints } from './system-readiness.mjs';

const PRODUCTION_ENTRY_POINTS = ['server.mjs', 'worker.mjs', 'scripts/agent-mesh-tick.mjs'];

function entryPointsIn(dir, extension = '.mjs') {
  const found = [];
  const walk = relative => {
    let entries;
    try { entries = readdirSync(relative, { withFileTypes: true }); }
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

const api = entryPointsIn('api');
const scripts = entryPointsIn('scripts');
const productionReachable = reachableFromEntryPoints([...PRODUCTION_ENTRY_POINTS, ...api]);
const anyEntryReachable = reachableFromEntryPoints(['server.mjs', 'worker.mjs', ...scripts, ...api]);
const all = entryPointsIn('src');
const production = all.filter(file => productionReachable.has(file));
const operatorOnly = all.filter(file => !productionReachable.has(file) && anyEntryReachable.has(file));
const unreachable = all.filter(file => !anyEntryReachable.has(file));

const receipt = {
  schema: 'uberbond.reachability-report.v1',
  srcModules: all.length,
  reachableFromProduction: production.length,
  reachableFromOperatorScriptsOnly: operatorOnly.length,
  noEntryPointAtAll: unreachable.length,
  partitionExact: production.length + operatorOnly.length + unreachable.length === all.length,
  externalEffectAuthority: 'NONE'
};

console.log(`UBERBOND_REACHABILITY ${JSON.stringify(receipt)}`);
