#!/usr/bin/env node
// Run the real-PostgreSQL suites that the deterministic gate skips.
//
// Forty-two tests sit behind LIVE_POSTGRES_TEST_URL / OMNIA_V9_TEST_DATABASE_URL
// because they assert things PGlite cannot decide: advisory-lock contention,
// trigger-enforced append-only provenance, sub-second timestamp comparison,
// and two real backends racing for one row. Skipping them is correct when no
// database exists. Claiming their guarantees while they skip is not, and that
// is the gap this closes.
//
// Each suite gets its OWN database. That is not tidiness -- running them all
// against one shared database makes them fail, and the failures look exactly
// like product races: rows one suite leaves behind are rows the next suite
// trips over. Chasing those as concurrency defects wastes a night. They are
// test isolation, and per-suite databases is what actually isolates them.
//
// Nothing here calls a provider, sends anything, or touches production. The
// database is created and dropped by this script.

import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const ADMIN_URL = process.env.POSTGRES_GATE_ADMIN_URL || '';

function suites() {
  return readdirSync(join(repoRoot, 'tests'))
    .filter(name => name.endsWith('.test.mjs'))
    .filter(name => /OMNIA_V9_TEST_DATABASE_URL|LIVE_POSTGRES_TEST_URL/
      .test(readFileSync(join(repoRoot, 'tests', name), 'utf8')))
    .sort()
    .map(name => `tests/${name}`);
}

async function freshDatabase(adminUrl, name) {
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${name}`);
    await admin.query(`CREATE DATABASE ${name}`);
  } finally {
    await admin.end();
  }
  return adminUrl.replace(/\/[^/]*$/, `/${name}`);
}

function counts(output) {
  const read = label => Number(new RegExp(`^# ${label} (\\d+)`, 'm').exec(output)?.[1] ?? 0);
  return { tests: read('tests'), pass: read('pass'), fail: read('fail'), skipped: read('skipped') };
}

if (!ADMIN_URL) {
  console.error('POSTGRES_GATE_ADMIN_URL is not set.');
  console.error('');
  console.error('Point it at a PostgreSQL this script may create and drop databases on, e.g.');
  console.error('  POSTGRES_GATE_ADMIN_URL=postgresql://postgres:password@127.0.0.1:5432/postgres \\');
  console.error('    node scripts/run-postgres-gate.mjs');
  console.error('');
  console.error('REAL_POSTGRES_PROOF_REQUIRED: without one, these suites skip and their');
  console.error('guarantees are unproven. Do not report them as passing.');
  process.exit(2);
}

const files = suites();
const totals = { tests: 0, pass: 0, fail: 0, skipped: 0 };
const failed = [];

for (const [index, file] of files.entries()) {
  const url = await freshDatabase(ADMIN_URL, `uberbond_gate_${index + 1}`);
  const run = spawnSync(process.execPath, ['--test', file], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      OMNIA_V9_TEST_DATABASE_URL: url,
      LIVE_POSTGRES_TEST_URL: url,
      DATABASE_URL: url
    }
  });
  const output = `${run.stdout || ''}${run.stderr || ''}`;
  const result = counts(output);
  for (const key of Object.keys(totals)) totals[key] += result[key];
  const label = result.fail ? 'FAIL' : result.skipped ? 'SKIP' : 'PASS';
  console.log(`${label}  ${file.padEnd(58)} tests=${result.tests} pass=${result.pass} fail=${result.fail} skipped=${result.skipped}`);
  if (result.fail) {
    failed.push(file);
    for (const line of output.split('\n').filter(line => line.startsWith('not ok'))) console.log(`      ${line}`);
  }
}

console.log('');
console.log(`postgres gate — ${totals.tests} tests, ${totals.pass} pass, ${totals.fail} fail, ${totals.skipped} skipped, across ${files.length} suites.`);
if (totals.skipped) console.log('Some suites still skipped: their guarantees remain unproven.');
if (failed.length) console.log(`Failing suites: ${failed.join(', ')}`);
process.exit(failed.length || totals.skipped ? 1 : 0);
