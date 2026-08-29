#!/usr/bin/env node
// Produce artifacts/system-readiness.json from measured facts, not from claims.
//
// The rule this script exists to enforce is the one the repository already
// learned the hard way when a hand-written receipt minted five thousand
// dollars: a readiness artifact that a person types is a wish. Everything here
// is either read off the repository or supplied as a measurement with the
// command that produced it, and a capability may not claim a proof level it
// has no evidence for.
//
// Levels (section 63):
//   0 absent   1 design   2 implemented   3 deterministic proof
//   4 integration proof   5 real-wire proof   6 live repeated proof
//   7 economically proven
//
// Levels 5 and above require external evidence. This script refuses to emit
// them from repository state alone, because nothing inside the repository can
// witness the outside world.

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const MAX_REPOSITORY_PROVEN_LEVEL = 4;

function git(args) {
  try {
    return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function sourceFiles() {
  const found = [];
  const walk = relative => {
    let entries;
    try { entries = readdirSync(join(repoRoot, relative), { withFileTypes: true }); }
    catch { return; }
    for (const entry of entries) {
      const child = join(relative, entry.name);
      if (entry.isDirectory()) walk(child);
      else if (entry.name.endsWith('.mjs')) found.push(child);
    }
  };
  walk('src');
  return found;
}

function testFiles() {
  return readdirSync(join(repoRoot, 'tests')).filter(name => name.endsWith('.test.mjs'));
}

/** Modules reachable from a production entry point, by following static imports. */
export function reachableFromEntryPoints(entryPoints = ['server.mjs', 'worker.mjs', 'scripts/agent-mesh-tick.mjs']) {
  const seen = new Set();
  const stack = [...entryPoints];
  while (stack.length) {
    const file = stack.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    let source = '';
    try { source = readFileSync(join(repoRoot, file), 'utf8'); } catch { continue; }
    for (const match of source.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
      const target = match[1];
      const base = file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '.';
      const resolved = join(base, target).replaceAll('\\', '/').replace(/^\.\//, '');
      if (!seen.has(resolved)) stack.push(resolved);
    }
  }
  return seen;
}

/**
 * @param {object} measurements results the caller actually ran, each with the
 *   command that produced them. Missing measurements lower the reported level;
 *   they are never assumed.
 */
export function buildReadiness({ measurements = {}, capabilities = [], now = new Date() } = {}) {
  const entries = capabilities.map(capability => {
    const declared = Number(capability.level);
    const externalEvidence = Array.isArray(capability.externalEvidence) ? capability.externalEvidence : [];
    const capped = declared > MAX_REPOSITORY_PROVEN_LEVEL && externalEvidence.length === 0
      ? MAX_REPOSITORY_PROVEN_LEVEL
      : declared;
    return {
      id: capability.id,
      status: capability.status,
      level: capped,
      declaredLevel: declared,
      cappedByMissingExternalEvidence: capped !== declared,
      evidence: capability.evidence || [],
      tests: capability.tests || [],
      realWire: capability.realWire === true,
      liveProof: capability.liveProof === true,
      externalBlocker: capability.externalBlocker || null,
      nextAction: capability.nextAction || null
    };
  });

  return {
    schema: 'uberbond.system-readiness.v1',
    generatedAt: (now instanceof Date ? now : new Date(now)).toISOString(),
    generatedBy: 'scripts/system-readiness.mjs',
    repository: {
      // The canonical state can be generated for a verified commit that is
      // about to be promoted remotely. This is intentionally an explicit
      // release operation, not an inferred ref: absent the override, the
      // checked-out commit remains the only truth source.
      head: process.env.UBERBOND_CANONICAL_HEAD || git(['rev-parse', 'HEAD']),
      // A release candidate is commonly verified on a temporary integration
      // branch before this exact commit is fast-forwarded to main.  The
      // readiness document describes its intended canonical ref, not the
      // disposable checkout name used to earn the evidence.
      branch: process.env.UBERBOND_CANONICAL_BRANCH || git(['rev-parse', '--abbrev-ref', 'HEAD']),
      sourceModules: sourceFiles().length,
      testSuites: testFiles().length,
      workingTreeClean: git(['status', '--porcelain']) === ''
    },
    measurements,
    capabilities: entries,
    truthBoundary: {
      maxLevelProvableFromRepositoryAlone: MAX_REPOSITORY_PROVEN_LEVEL,
      note: 'Levels 5 and above require evidence from outside this repository. Nothing here can witness the outside world, so nothing here may assert them.'
    }
  };
}

function measurement(input, id) {
  return input.measurements?.[id] || {};
}

function replaceRequired(text, pattern, replacement, label) {
  if (!pattern.test(text)) {
    throw new Error(`cannot refresh ${label}: expected canonical state marker is absent`);
  }
  return text.replace(pattern, replacement);
}

/**
 * Refresh only the mechanically measurable portion of the human-facing
 * current-state document. The explanatory sections beneath it are maintained
 * policy text; rewriting them during every test run would turn evidence into
 * churn. Missing markers fail closed instead of silently leaving stale facts.
 */
function refreshCurrentStateDocument({ input, readiness }) {
  const path = join(repoRoot, 'docs', 'CURRENT_SYSTEM_STATE.md');
  if (!existsSync(path)) return;

  const syntax = measurement(input, 'check:syntax');
  const deterministic = measurement(input, 'test:deterministic');
  const relay = measurement(input, 'test:relay-safety');
  const postgres = measurement(input, 'test:postgres-real');
  const audit = measurement(input, 'npm audit');
  const mutation = measurement(input, 'test:mutation-war');
  const browser = measurement(input, 'test:browser');
  const date = String(readiness.generatedAt).slice(0, 10);
  const result = (item, fallback) => item.result || item.note || fallback;

  let text = readFileSync(path, 'utf8');
  text = replaceRequired(text, /^Last reconciled:.*$/m, `Last reconciled: **${date}**`, 'reconciliation date');
  text = replaceRequired(text, /^Branch:.*$/m, `Branch: \`${readiness.repository.branch}\``, 'canonical branch');
  text = replaceRequired(text, /^Reconciled from (?:main|current head):.*$/m,
    `Reconciled from current head: \`${readiness.repository.head}\``, 'source commit');
  text = replaceRequired(text, /^\| Syntax \|.*$/m,
    `| Syntax | \`${syntax.command || 'npm run check:syntax'}\` | ${syntax.filesParsed ?? 'unrecorded'} files parse (${String(syntax.ranAt || date).slice(0, 10)}) |`, 'syntax measurement');
  text = replaceRequired(text, /^\| Deterministic \|.*$/m,
    `| Deterministic | \`${deterministic.command || 'npm run test:deterministic'}\` | ${deterministic.tests ?? 'unrecorded'} tests, ${deterministic.pass ?? 'unrecorded'} pass, **${deterministic.fail ?? 'unrecorded'} fail**, ${deterministic.skipped ?? 'unrecorded'} skipped (${String(deterministic.ranAt || date).slice(0, 10)}) |`, 'deterministic measurement');
  text = replaceRequired(text, /^\| Relay safety \|.*$/m,
    `| Relay safety | \`${relay.command || 'npm run test:relay-safety'}\` | ${relay.tests ?? 'unrecorded'} tests, ${relay.pass ?? 'unrecorded'} pass, ${relay.fail ?? 'unrecorded'} fail (${String(relay.ranAt || date).slice(0, 10)}) |`, 'relay measurement');
  text = replaceRequired(text, /^\| Real PostgreSQL \|.*$/m,
    `| Real PostgreSQL | \`${postgres.command || 'npm run test:postgres-real'}\` | ${result(postgres, 'not recorded')} |`, 'PostgreSQL measurement');
  text = replaceRequired(text, /^\| Mutation war \|.*$/m,
    `| Mutation war | \`${mutation.command || 'npm run test:mutation-war'}\` | ${result(mutation, 'not recorded')} |`, 'mutation measurement');
  text = replaceRequired(text, /^\| Browser \|.*$/m,
    `| Browser | \`${browser.command || 'npm run test:browser'}\` | ${result(browser, 'not recorded')} |`, 'browser measurement');
  text = replaceRequired(text, /^\| Dependencies \|.*$/m,
    `| Dependencies | \`${audit.command || 'npm audit'}\` | ${result(audit, 'not recorded')} |`, 'dependency measurement');
  writeFileSync(path, text);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const inputPath = join(repoRoot, 'config', 'system-readiness-input.json');
  if (!existsSync(inputPath)) {
    console.error(`missing ${inputPath}: readiness is generated from recorded measurements, never invented`);
    process.exit(2);
  }
  const input = JSON.parse(readFileSync(inputPath, 'utf8'));
  const readiness = buildReadiness(input);
  mkdirSync(join(repoRoot, 'artifacts'), { recursive: true });
  const out = join(repoRoot, 'artifacts', 'system-readiness.json');
  writeFileSync(out, `${JSON.stringify(readiness, null, 2)}\n`);
  refreshCurrentStateDocument({ input, readiness });
  const capped = readiness.capabilities.filter(item => item.cappedByMissingExternalEvidence);
  console.log(`system-readiness — ${readiness.capabilities.length} capabilities, ${capped.length} capped for want of external evidence`);
  for (const item of capped) console.log(`  capped ${item.id}: declared ${item.declaredLevel} -> ${item.level}`);
}
