#!/usr/bin/env node
// CD012. Per-module archaeology on the stranded pre-rewrite src lineage.
//
// These modules exist only on branches rooted at the old history. Ancestry can
// never settle them -- those commits will not become ancestors of main -- so
// the only question that matters is whether any concept they carry is absent
// from main. The previous ledger had checked three of a hundred and one and
// refused to round the rest down, which was correct and also not an answer.
//
// The check is export-level first because a name match in the same domain is
// evidence rather than resemblance. Concept-level is weaker and is labelled as
// such. A module that produces neither comes back ABSENT and gets read, which
// is the point: a checker that cannot return ABSENT is a rubber stamp.
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.NULLSTAR_SUPERSESSION_OUT
  || 'artifacts/nullstar-terminal/stranded-supersession.json';
const git = (...args) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).trim();

/** Named exports, ignoring re-exports and default. A name is the unit of evidence. */
export function exportedNames(source) {
  const names = new Set();
  const patterns = [
    /export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
    /export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g,
    /export\s+class\s+([A-Za-z_$][\w$]*)/g
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) names.add(match[1]);
  }
  // `export { a, b as c }` exports the local name under the alias.
  for (const match of source.matchAll(/export\s*\{([^}]*)\}(?!\s*from)/g)) {
    for (const part of match[1].split(',')) {
      const alias = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (alias && /^[A-Za-z_$][\w$]*$/.test(alias)) names.add(alias);
    }
  }
  return [...names];
}

/**
 * Tokens distinctive enough that finding one in main means something.
 *
 * Splitting a filename on hyphens and keeping the long parts gives terms like
 * "circulation" or "wormhole". Short and structural words are dropped because
 * "src", "core" and "runtime" appear everywhere and would match anything.
 */
const GENERIC = new Set([
  'src', 'core', 'runtime', 'config', 'store', 'state', 'base', 'util', 'utils',
  'index', 'main', 'job', 'jobs', 'handler', 'handlers', 'adapter', 'contract',
  'engine', 'system', 'module', 'service', 'manager', 'bridge', 'doctor', 'v2'
]);
export function conceptTokens(path) {
  return basename(path, '.mjs')
    .split('-')
    .filter(token => token.length >= 5 && !GENERIC.has(token));
}

function main() {
  const mainSha = git('rev-parse', 'origin/main');
  const branchDebt = JSON.parse(
    execFileSync('cat', ['artifacts/nullstar-terminal/branch-debt.json'], { cwd: root, encoding: 'utf8' })
  );
  const stranded = branchDebt.strandedFiles.filter(file => file.startsWith('src/'));

  // Which pre-rewrite branch still holds each stranded path.
  const branches = git('for-each-ref', '--format=%(refname:short)', 'refs/remotes/origin')
    .split('\n').filter(b => b && b !== 'origin/HEAD' && b !== 'origin/main');
  const holderOf = new Map();
  for (const branch of branches) {
    if (holderOf.size >= stranded.length) break;
    let files;
    try {
      files = new Set(git('ls-tree', '-r', '--name-only', branch, '--', 'src/').split('\n'));
    } catch { continue; }
    for (const file of stranded) if (!holderOf.has(file) && files.has(file)) holderOf.set(file, branch);
  }

  // Main's export index, name -> modules defining it.
  const mainSrc = git('ls-tree', '-r', '--name-only', 'origin/main', '--', 'src/')
    .split('\n').filter(f => f.endsWith('.mjs'));
  const mainExports = new Map();
  const mainBodies = new Map();
  for (const file of mainSrc) {
    let body;
    try { body = git('show', `origin/main:${file}`); } catch { continue; }
    mainBodies.set(file, body);
    for (const name of exportedNames(body)) {
      if (!mainExports.has(name)) mainExports.set(name, []);
      mainExports.get(name).push(file);
    }
  }

  const rows = stranded.map(file => {
    const branch = holderOf.get(file);
    if (!branch) {
      return { module: file, verdict: 'UNREADABLE__NO_BRANCH_HOLDS_IT', exports: [], successors: [] };
    }
    let body;
    try { body = git('show', `${branch}:${file}`); } catch {
      return { module: file, verdict: 'UNREADABLE__SHOW_FAILED', exports: [], successors: [] };
    }

    const names = exportedNames(body);
    const matched = names.filter(name => mainExports.has(name));
    if (matched.length) {
      const successors = [...new Set(matched.flatMap(name => mainExports.get(name)))];
      return {
        module: file,
        heldBy: branch,
        verdict: 'SUPERSEDED__EXPORT_LEVEL',
        exports: names,
        matchedExports: matched,
        matchRatio: Number((matched.length / Math.max(names.length, 1)).toFixed(3)),
        successors,
        evidence: `${matched.length} of ${names.length} named exports are defined in main`
      };
    }

    const tokens = conceptTokens(file);
    const tokenHits = tokens.map(token => {
      const hits = mainSrc.filter(candidate => basename(candidate).includes(token));
      return { token, modules: hits };
    }).filter(hit => hit.modules.length);
    if (tokenHits.length) {
      return {
        module: file,
        heldBy: branch,
        verdict: 'SUPERSEDED__CONCEPT_LEVEL',
        exports: names,
        matchedExports: [],
        successors: [...new Set(tokenHits.flatMap(hit => hit.modules))],
        conceptTokens: tokenHits.map(hit => hit.token),
        evidence: 'no export name survives; a distinctive filename token names a module in main',
        evidenceStrength: 'WEAKER_THAN_EXPORT_MATCH__NAME_CORRESPONDENCE_ONLY'
      };
    }

    return {
      module: file,
      heldBy: branch,
      verdict: 'ABSENT__NO_SUCCESSOR_FOUND',
      exports: names,
      matchedExports: [],
      successors: [],
      evidence: 'no named export and no distinctive filename token appears in main src'
    };
  });

  const counts = rows.reduce((acc, row) => { acc[row.verdict] = (acc[row.verdict] ?? 0) + 1; return acc; }, {});

  const artifact = {
    schemaVersion: 'uberbond-nullstar-stranded-supersession-1.0.0',
    debtItem: 'CD012-STRANDED-PRE-REWRITE-MODULES-UNVERIFIED',
    generatedAt: new Date().toISOString(),
    mainSha,
    method: 'Export-name identity first, distinctive filename token second, ABSENT when neither. Computed from the branch tree and main tree, not asserted.',
    totalStrandedSrc: rows.length,
    counts,
    evidenceClasses: {
      SUPERSEDED__EXPORT_LEVEL: 'A named export of the stranded module is defined in main. Same name, same domain: this is identity evidence.',
      SUPERSEDED__CONCEPT_LEVEL: 'No export survives, but a distinctive filename token names a module in main. Correspondence inferred from naming, which is weaker and is not claimed as equivalence.',
      ABSENT__NO_SUCCESSOR_FOUND: 'Neither. Requires reading the module before any disposition.',
      UNREADABLE__NO_BRANCH_HOLDS_IT: 'Listed as stranded but no surviving branch carries the path.'
    },
    truthBoundary: 'A name match shows a concept was re-implemented under that name. It does not show the successor is behaviourally equivalent, as good, or tested. This closes the question "was anything dropped", not "is main at least as capable".',
    businessEffectAuthority: 'NONE',
    externalEffects: [],
    modules: rows
  };

  mkdirSync(dirname(resolve(root, OUT)), { recursive: true });
  writeFileSync(resolve(root, OUT), `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(`${rows.length} stranded src modules checked against origin/main ${mainSha.slice(0, 8)}`);
  for (const [verdict, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${verdict}: ${count}`);
  }
  for (const row of rows.filter(r => r.verdict.startsWith('ABSENT') || r.verdict.startsWith('UNREADABLE'))) {
    console.log(`  -> ${row.verdict}: ${row.module}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
