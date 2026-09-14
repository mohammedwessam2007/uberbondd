#!/usr/bin/env node
// Reconciles the imported founder directive against this exact tree.
//
// The repo index and the canonical coverage rows both come from the existing
// sovereign coverage machinery rather than being rebuilt here, so a section can
// never be rated against a different view of the repository than canon is.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reconcileFounderDirective } from '../src/founder-directive-reconciler.mjs';
import { repoIndex } from './sovereign-coverage-matrix.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIRECTIVE = 'artifacts/project-nullstar-directive.json';
const COVERAGE = 'artifacts/sovereign/implementation-coverage-matrix.json';
const DECLARATIONS = 'artifacts/nullstar/terminal-declarations.json';
const OUTPUT = 'artifacts/nullstar/directive-reconciliation.json';

function readJson(relative, { required = true } = {}) {
  const path = join(root, relative);
  if (!existsSync(path)) {
    if (required) {
      console.error(JSON.stringify({ ok: false, status: 'DIRECTIVE_INPUT_MISSING', missing: relative }, null, 2));
      process.exit(2);
    }
    return null;
  }
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch (error) {
    // Malformed is not the same as absent. Treating a broken declarations file
    // as "no declarations" would silently change every row it touches.
    console.error(JSON.stringify({ ok: false, status: 'DIRECTIVE_INPUT_UNREADABLE', path: relative, detail: error.message }, null, 2));
    process.exit(2);
  }
}

function main() {
  const directive = readJson(DIRECTIVE);
  const coverage = readJson(COVERAGE, { required: false });
  const declarations = readJson(DECLARATIONS, { required: false }) || {};

  if (!coverage) {
    console.error(JSON.stringify({
      ok: false,
      status: 'CANONICAL_COVERAGE_REQUIRED',
      detail: `${COVERAGE} is absent; run "npm run sovereign:coverage" first so sections are reconciled against canon rather than filenames alone.`
    }, null, 2));
    return 2;
  }

  let sourceCommit = null;
  try { sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); } catch { /* no git */ }

  const result = reconcileFounderDirective({
    directive,
    repoIndex: repoIndex(),
    canonicalRows: Array.isArray(coverage.rows) ? coverage.rows : [],
    terminalDeclarations: Array.isArray(declarations.terminalDeclarations) ? declarations.terminalDeclarations : [],
    milestoneReceipts: Array.isArray(declarations.milestoneReceipts) ? declarations.milestoneReceipts : [],
    sourceCommit
  });

  if (!result.ok) {
    console.error(JSON.stringify(result, null, 2));
    return 1;
  }

  mkdirSync(join(root, 'artifacts/nullstar'), { recursive: true });
  writeFileSync(join(root, OUTPUT), `${JSON.stringify(result, null, 2)}\n`);

  console.log(JSON.stringify({
    status: result.status,
    directiveId: result.directiveId,
    sections: result.counts.sections,
    byState: result.counts.byState,
    byClass: result.counts.byClass,
    cutSetSize: result.cutSet.length,
    topCutSet: result.cutSet.slice(0, 10).map(row => `${row.numeral} ${row.title} [${row.currentState}, refs=${row.corpusReferences}]`),
    output: OUTPUT,
    truthBoundary: result.truthBoundary,
    businessEffectAuthority: result.businessEffectAuthority
  }, null, 2));
  return 0;
}

process.exit(main());
