#!/usr/bin/env node
// Trial-merge every open PR against main and classify what stands in the way.
//
// This exists because the same twenty-minute ritual kept repeating: make a
// throwaway worktree, merge main, stare at the conflicts, work out whether
// they are real, run the suite, write it up. Three times in one week, and the
// answer was "both sides appended to the same list" twice out of three.
//
// The useful output is not "conflicted / not conflicted" -- git already says
// that. It is whether a conflict is MECHANICAL (both sides added to the same
// place, so a union resolves it and nothing is lost) or SEMANTIC (the sides
// disagree about the same thing, so a person has to choose). Those need
// completely different responses and look identical in a git status.
//
// Read-only. It never pushes, never writes to any branch, and cleans up every
// worktree it makes. Running the test suite is opt-in because it is slow.
//
// Usage:
//   node scripts/pr-reconcile.mjs                 # classify all open PRs
//   node scripts/pr-reconcile.mjs --test          # also run the gate where merge is clean
//   node scripts/pr-reconcile.mjs --pr 37 --pr 40 # only these
//   node scripts/pr-reconcile.mjs --json          # machine-readable

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

// Node's fetch ignores HTTPS_PROXY unless NODE_USE_ENV_PROXY=1, while git and
// curl honour it automatically. In a proxied sandbox the proxy carries the
// credential, so without this every call is a bare 401 with no clue why.
const envProxy = process.env.HTTPS_PROXY || process.env.https_proxy || '';
if (envProxy && process.env.NODE_USE_ENV_PROXY !== '1' && !process.env.UBERBOND_RECONCILE_REEXEC) {
  const { spawnSync } = await import('node:child_process');
  const run = spawnSync(process.execPath, [fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...process.env, NODE_USE_ENV_PROXY: '1', UBERBOND_RECONCILE_REEXEC: '1' }
  });
  process.exit(run.status ?? 1);
}

const args = process.argv.slice(2);
const runTests = args.includes('--test');
const asJson = args.includes('--json');
const onlyPrs = args.reduce((acc, arg, i) => (arg === '--pr' ? [...acc, Number(args[i + 1])] : acc), []);
const repository = process.env.GITHUB_REPOSITORY || 'mohammedwessam2007/uberbondd';
const [owner, repo] = repository.split('/');
const baseRef = process.env.RECONCILE_BASE || 'origin/main';

// stderr is piped, not inherited: several of these calls are probes that are
// EXPECTED to fail (does this commit exist yet?), and git's own complaint
// printed over the report makes a working tool look broken.
function git(cwd, ...cmd) {
  return execFileSync('git', cmd, {
    cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
}
function gitQuiet(cwd, ...cmd) {
  try { return { ok: true, out: git(cwd, ...cmd) }; }
  catch (error) { return { ok: false, out: String(error.stdout || '') + String(error.stderr || '') }; }
}

async function openPullRequests() {
  const token = String(process.env.GITHUB_TOKEN || '').trim();
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls?state=open&per_page=50`, {
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': 'uberbond-pr-reconcile',
      ...(token ? { authorization: `Bearer ${token}` } : {})
    }
  });
  if (!res.ok) throw new Error(`GET /pulls -> ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

// A conflict region is mechanical when neither side removed anything the other
// side had -- both simply added. Union the two and nothing is lost. When the
// sides changed the SAME line to different values, one of them has to win and
// only a person can say which.
function classifyRegions(text) {
  const regions = [...text.matchAll(/^<<<<<<< .*\n([\s\S]*?)^=======\n([\s\S]*?)^>>>>>>> .*$/gm)];
  return regions.map(([, ours, theirs]) => {
    const a = ours.split('\n').filter(Boolean);
    const b = theirs.split('\n').filter(Boolean);
    const setA = new Set(a.map(l => l.trim()));
    const setB = new Set(b.map(l => l.trim()));
    const sharedKept = [...setA].filter(line => setB.has(line)).length;
    const onlyOurs = [...setA].filter(line => !setB.has(line)).length;
    const onlyTheirs = [...setB].filter(line => !setA.has(line)).length;
    // Pure additions on both sides around common context => mechanical.
    // Nothing in common at all => the sides rewrote the same block => semantic.
    const mechanical = sharedKept > 0 && onlyOurs > 0 && onlyTheirs > 0
      ? true
      : (onlyOurs === 0 || onlyTheirs === 0);
    return { lines: a.length + b.length, sharedKept, onlyOurs, onlyTheirs, mechanical };
  });
}

// package.json script lists are their own well-understood case: both sides
// append entries to one very long line, so git flags the whole line even
// though the resolution is always a union. Always mechanical, and the fix is
// known exactly.
function isScriptListConflict(file, text) {
  if (file !== 'package.json') return false;
  return /^<<<<<<< /m.test(text) && /"(test:deterministic|check:syntax|test:[a-z-]+)":/.test(text);
}

const prs = (await openPullRequests())
  .filter(pr => (onlyPrs.length ? onlyPrs.includes(pr.number) : true))
  .filter(pr => pr.head?.repo?.full_name === repository);

const results = [];
for (const pr of prs) {
  const worktree = mkdtempSync(join(tmpdir(), `reconcile-${pr.number}-`));
  const record = {
    number: pr.number, title: pr.title, draft: Boolean(pr.draft), head: pr.head.ref,
    verdict: 'UNKNOWN', conflicts: [], mechanical: 0, semantic: 0, tests: 'NOT_RUN'
  };
  let worktreeAdded = false;
  try {
    // A PR head pushed since our last fetch is not in the local object store,
    // and `worktree add` fails with a bare "invalid reference" that reads like
    // the PR is broken rather than simply unfetched. Fetch the ref first.
    const known = gitQuiet(repoRoot, 'cat-file', '-e', `${pr.head.sha}^{commit}`).ok;
    if (!known) gitQuiet(repoRoot, 'fetch', '--quiet', 'origin', pr.head.ref);
    git(repoRoot, 'worktree', 'add', '-q', '--detach', worktree, pr.head.sha);
    worktreeAdded = true;
    const merged = gitQuiet(worktree, 'merge', '--no-commit', '--no-ff', '--quiet', baseRef);
    const conflicted = gitQuiet(worktree, 'diff', '--name-only', '--diff-filter=U').out
      .split('\n').filter(Boolean);

    if (merged.ok && conflicted.length === 0) {
      record.verdict = 'CLEAN';
    } else {
      for (const file of conflicted) {
        let text = '';
        try { text = readFileSync(join(worktree, file), 'utf8'); } catch { /* binary or deleted */ }
        const regions = classifyRegions(text);
        const scriptList = isScriptListConflict(file, text);
        const mech = scriptList ? regions.length : regions.filter(r => r.mechanical).length;
        const sem = scriptList ? 0 : regions.length - mech;
        record.mechanical += mech;
        record.semantic += sem;
        record.conflicts.push({
          file,
          regions: regions.length,
          lines: regions.reduce((sum, r) => sum + r.lines, 0),
          kind: scriptList ? 'script-list (union)' : (sem === 0 ? 'additive (union)' : 'divergent')
        });
      }
      record.verdict = record.semantic === 0 ? 'MECHANICAL' : 'NEEDS_HUMAN';
    }

    if (runTests && record.verdict === 'CLEAN') {
      const gate = gitQuiet(worktree, 'status');           // keep worktree usable
      void gate;
      const { spawnSync } = await import('node:child_process');
      // Reuse the parent's node_modules rather than installing per worktree.
      spawnSync('ln', ['-sfn', join(repoRoot, 'node_modules'), join(worktree, 'node_modules')]);
      const suite = spawnSync('npm', ['run', 'test:deterministic'], { cwd: worktree, encoding: 'utf8' });
      const out = String(suite.stdout || '');
      const fail = /^# fail (\d+)$/m.exec(out)?.[1];
      const pass = /^# pass (\d+)$/m.exec(out)?.[1];
      record.tests = fail === undefined ? 'NOT_RUN' : `${pass} pass / ${fail} fail`;
    }
  } catch (error) {
    record.verdict = 'ERROR';
    record.error = String(error.message || error).slice(0, 300);
  } finally {
    // Only ask git to remove a worktree it actually registered; otherwise it
    // prints "is not a working tree" over the report for no reason.
    if (worktreeAdded) gitQuiet(repoRoot, 'worktree', 'remove', '--force', worktree);
    rmSync(worktree, { recursive: true, force: true });
  }
  results.push(record);
}

gitQuiet(repoRoot, 'worktree', 'prune');

if (asJson) {
  console.log(JSON.stringify({ base: baseRef, generatedAt: new Date().toISOString(), results }, null, 2));
} else {
  const base = git(repoRoot, 'rev-parse', '--short', baseRef);
  console.log(`\nOpen PRs against ${baseRef} (${base})\n`);
  for (const r of results) {
    const flag = r.draft ? ' [draft]' : '';
    console.log(`#${r.number}${flag} ${r.verdict}  ${r.title.slice(0, 60)}`);
    for (const c of r.conflicts) {
      console.log(`      ${c.file}  ${c.regions} region(s), ${c.lines} lines  -- ${c.kind}`);
    }
    if (r.tests !== 'NOT_RUN') console.log(`      tests: ${r.tests}`);
    if (r.error) console.log(`      error: ${r.error}`);
  }
  console.log(`
CLEAN        merges with no conflict
MECHANICAL   every conflict is both sides adding -- a union resolves it, nothing is lost
NEEDS_HUMAN  at least one conflict has the two sides disagreeing about the same thing
`);
}

process.exit(results.some(r => r.verdict === 'ERROR') ? 1 : 0);
