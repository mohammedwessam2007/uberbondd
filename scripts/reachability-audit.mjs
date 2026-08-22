#!/usr/bin/env node
// Which modules are actually reachable, and from where.
//
// A fully tested module that nothing can reach is not a finished feature, it
// is a finished artefact. The distinction stops mattering right up until
// somebody reads a green suite as evidence the system does the thing.
//
// Classification, strongest first:
//   REACHABLE_PRODUCTION  imported (transitively) by server.mjs, worker.mjs or api/
//   REACHABLE_OPERATOR    reachable only from scripts/ -- a human runs it
//   TEST_ONLY             reachable only from tests/ -- proven, not wired
//   UNREACHABLE           nothing imports it, tests included
//
// TEST_ONLY is not automatically wrong: new architecture lands proven before
// it lands wired, and the safety kernels are deliberately not in a live send
// path. UNREACHABLE is different -- nothing is asserting anything about it,
// so whatever it claims to enforce, it does not.

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const rel = target => relative(repoRoot, target).replaceAll('\\', '/');

// Matches every import form. A partial matcher here understates reachability,
// which is the failure mode that produces a false "delete this" verdict.
const IMPORT_PATTERNS = Object.freeze([
  /\bimport\s+[\s\S]*?\sfrom\s+["'](\.[^"']+)["']/g,
  /\bimport\s+["'](\.[^"']+)["']/g,
  /\bimport\s*\(\s*["'](\.[^"']+)["']\s*\)/g,
  /\bexport\s+[\s\S]*?\sfrom\s+["'](\.[^"']+)["']/g
]);

function localImportsOf(file) {
  let source = '';
  try { source = readFileSync(file, 'utf8'); } catch { return []; }
  const found = new Set();
  for (const pattern of IMPORT_PATTERNS) {
    for (const match of source.matchAll(pattern)) {
      let target = resolve(dirname(file), match[1]);
      if (existsSync(target) && statSync(target).isDirectory()) target = join(target, 'index.mjs');
      if (existsSync(target)) found.add(target);
    }
  }
  return [...found];
}

function closureFrom(seeds) {
  const seen = new Set();
  const stack = [...seeds];
  while (stack.length) {
    const file = stack.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    for (const child of localImportsOf(file)) stack.push(child);
  }
  return seen;
}

function walk(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    const target = join(dir, name);
    if (statSync(target).isDirectory()) out.push(...walk(target));
    else if (target.endsWith('.mjs')) out.push(target);
  }
  return out;
}

export function auditReachability() {
  const production = [join(repoRoot, 'server.mjs'), join(repoRoot, 'worker.mjs'), ...walk(join(repoRoot, 'api'))].filter(existsSync);
  const operator = walk(join(repoRoot, 'scripts'));
  const tests = walk(join(repoRoot, 'tests'));

  const productionReach = closureFrom(production);
  const operatorReach = closureFrom(operator);
  const testReach = closureFrom(tests);

  const classified = { REACHABLE_PRODUCTION: [], REACHABLE_OPERATOR: [], TEST_ONLY: [], UNREACHABLE: [] };
  for (const file of walk(join(repoRoot, 'src'))) {
    const name = rel(file);
    if (productionReach.has(file)) classified.REACHABLE_PRODUCTION.push(name);
    else if (operatorReach.has(file)) classified.REACHABLE_OPERATOR.push(name);
    else if (testReach.has(file)) classified.TEST_ONLY.push(name);
    else classified.UNREACHABLE.push(name);
  }
  for (const list of Object.values(classified)) list.sort();
  return classified;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const classified = auditReachability();
  const total = Object.values(classified).reduce((sum, list) => sum + list.length, 0);
  console.log(`reachability audit — ${total} modules under src/\n`);
  for (const [bucket, list] of Object.entries(classified)) {
    console.log(`${bucket}: ${list.length}`);
  }
  if (classified.UNREACHABLE.length) {
    console.log('\nUNREACHABLE — nothing imports these, tests included:');
    for (const name of classified.UNREACHABLE) console.log(`  ${name}`);
  }
  if (process.argv.includes('--json')) console.log(`\n${JSON.stringify(classified, null, 2)}`);
  process.exit(0);
}
