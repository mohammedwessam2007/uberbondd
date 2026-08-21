#!/usr/bin/env node
// Parse-check every source file in the repository.
//
// This replaces a package.json script that chained ~186 `node --check` calls
// with `&&`. That string grew with every merge until npm stopped running it
// entirely -- it echoed the command and exited 216 without executing a single
// check, so `npm run check:syntax` reported failure while nothing had been
// checked. A gate that cannot run is worse than no gate: it looks like
// coverage and provides none.
//
// Walking the tree also removes the drift problem the old list had. A new
// module is covered because it exists, not because somebody remembered to
// append it to an 8,000-character line.

import { readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

// Directories that contain source we own. Everything else -- node_modules,
// build output, git internals -- is deliberately excluded.
const ROOTS = ['src', 'api', 'lite', 'scripts', 'public', 'tests'];
const ROOT_FILES = ['server.mjs', 'worker.mjs'];
const SKIP_DIRS = new Set(['node_modules', '.git', 'coverage', 'dist', 'build']);
const EXTENSIONS = ['.mjs', '.js'];

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(join(repoRoot, dir), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
    const rel = join(dir, entry.name);
    if (entry.isDirectory()) walk(rel, out);
    else if (EXTENSIONS.some(ext => entry.name.endsWith(ext))) out.push(rel);
  }
  return out;
}

/** Every file this check covers, repo-relative and sorted. */
export function syntaxCheckTargets() {
  const found = ROOTS.flatMap(root => walk(root));
  const rootFiles = ROOT_FILES.filter(name => {
    try { return statSync(join(repoRoot, name)).isFile(); } catch { return false; }
  });
  return [...new Set([...rootFiles, ...found])].sort();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const targets = syntaxCheckTargets();
  const failures = [];
  for (const file of targets) {
    try {
      execFileSync(process.execPath, ['--check', join(repoRoot, file)], { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      failures.push({ file, detail: String(error.stderr || error.message).split('\n').slice(0, 4).join('\n') });
    }
  }
  if (failures.length) {
    for (const failure of failures) {
      console.error(`\n${relative('.', failure.file)}\n${failure.detail}`);
    }
    console.error(`\n${failures.length} of ${targets.length} file(s) failed to parse.`);
    process.exit(1);
  }
  console.log(`check:syntax — ${targets.length} files parse.`);
}
