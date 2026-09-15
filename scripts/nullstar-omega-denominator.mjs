#!/usr/bin/env node
// Compiles the denominator against this exact tree.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileOmegaDenominator } from '../src/nullstar-omega-denominator.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = 'artifacts/nullstar-omega/denominator.json';

function walk(relative, found = []) {
  let entries;
  try { entries = readdirSync(join(root, relative), { withFileTypes: true }); } catch { return found; }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const child = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) walk(child, found);
    else found.push(child);
  }
  return found;
}

function main() {
  const fileIndex = new Set([
    ...walk('src'), ...walk('scripts'), ...walk('api'), ...walk('tests'),
    ...walk('artifacts'), ...walk('docs'),
    ...readdirSync(root).filter(name => !name.startsWith('.'))
  ]);

  // A prior compile's dimension list, so removal is detectable rather than
  // merely discouraged.
  let previousDimensionIds = [];
  const outPath = join(root, OUTPUT);
  if (existsSync(outPath)) {
    try { previousDimensionIds = (JSON.parse(readFileSync(outPath, 'utf8')).dimensions || []).map(row => row.id); }
    catch (error) {
      console.error(JSON.stringify({ ok: false, status: 'PRIOR_DENOMINATOR_UNREADABLE', detail: error.message }, null, 2));
      return 2;
    }
  }

  let sourceCommit = null;
  try { sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); } catch { /* no git */ }

  // The classifier reads the placement inside a calibration receipt rather
  // than treating the file's existence as the calibration.
  const readJson = relative => {
    try { return JSON.parse(readFileSync(join(root, relative), 'utf8')); } catch { return null; }
  };
  const result = compileOmegaDenominator({ fileIndex, previousDimensionIds, sourceCommit, readJson });
  if (!result.ok) { console.error(JSON.stringify(result, null, 2)); return 1; }

  mkdirSync(join(root, 'artifacts/nullstar-omega'), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`);

  console.log(JSON.stringify({
    status: result.status,
    dimensions: result.counts.dimensions,
    byState: result.counts.byState,
    absent: result.dimensions.filter(row => row.state === 'ABSENT').map(row => `${row.id} ${row.name}`),
    operatingOrBetter: result.dimensions.filter(row => ['OPERATING', 'REALITY_CALIBRATED'].includes(row.state)).map(row => `${row.id} ${row.name}`),
    output: OUTPUT,
    businessEffectAuthority: result.businessEffectAuthority
  }, null, 2));
  return 0;
}

process.exit(main());
