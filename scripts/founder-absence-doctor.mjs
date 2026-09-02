#!/usr/bin/env node
// If the founder turns the device off, what actually keeps running -- and what
// is the smallest human action that would move that answer.
//
// Every blocker is classified into exactly one class, and CODE_READY is not
// reportable while a credential, account or payment blocker is open. Elapsed
// founder-absence evidence cannot be produced by this or any other process:
// only real elapsed time with matching receipts produces it.
import { evaluateFounderAbsenceBlockers } from '../src/founder-absence-blocker-doctor.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function headSha() {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim(); }
  catch { return null; }
}

export function buildFounderAbsenceReport({ env = process.env, now = new Date() } = {}) {
  return evaluateFounderAbsenceBlockers({
    env,
    now,
    currentSourceCommit: headSha(),
    // Both probes the evaluator declares. Supplying only one silently falls
    // back to the refusing default for the other, and every row whose
    // resolution is a source probe then reports open -- a doctor that says the
    // work is unfinished because nobody handed it a way to look.
    probes: {
      fileExists: relative => existsSync(join(repoRoot, String(relative || ''))),
      sourceIncludes: (relative, needle) => {
        try { return readFileSync(join(repoRoot, String(relative || '')), 'utf8').includes(String(needle || '')); }
        catch { return false; }
      }
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.stdout.write(`${JSON.stringify(buildFounderAbsenceReport(), null, 2)}\n`);
}
