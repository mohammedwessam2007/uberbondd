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

// The artifacts canon is made of. A change confined to these is canon
// describing itself, not the source moving underneath it.
const CANON_ARTIFACTS = new Set([
  'docs/CURRENT_SYSTEM_STATE.md',
  'artifacts/system-readiness.json',
  'config/system-readiness-input.json'
]);

/** The commit docs/CURRENT_SYSTEM_STATE.md claims to describe. */
function canonCommit() {
  try {
    const text = readFileSync(join(repoRoot, 'docs/CURRENT_SYSTEM_STATE.md'), 'utf8');
    return text.match(/\b[0-9a-f]{40}\b/)?.[0] || null;
  } catch { return null; }
}

/**
 * Has anything but canon changed between `commit` and HEAD?
 *
 * Refuses on any error rather than assuming freshness: an unreadable history is
 * not evidence that the source stood still.
 */
function sourceUnchangedSince(commit) {
  if (!/^[0-9a-f]{40}$/.test(String(commit || ''))) return false;
  try {
    const changed = execFileSync('git', ['diff', '--name-only', `${commit}..HEAD`], { cwd: repoRoot, encoding: 'utf8' })
      .split('\n').map(line => line.trim()).filter(Boolean);
    return changed.every(file => CANON_ARTIFACTS.has(file));
  } catch { return false; }
}

export function buildFounderAbsenceReport({ env = process.env, now = new Date() } = {}) {
  return evaluateFounderAbsenceBlockers({
    env,
    now,
    currentSourceCommit: headSha(),
    canonCommit: canonCommit(),
    // Both probes the evaluator declares. Supplying only one silently falls
    // back to the refusing default for the other, and every row whose
    // resolution is a source probe then reports open -- a doctor that says the
    // work is unfinished because nobody handed it a way to look.
    probes: {
      fileExists: relative => existsSync(join(repoRoot, String(relative || ''))),
      sourceIncludes: (relative, needle) => {
        try { return readFileSync(join(repoRoot, String(relative || '')), 'utf8').includes(String(needle || '')); }
        catch { return false; }
      },
      sourceUnchangedSince
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.stdout.write(`${JSON.stringify(buildFounderAbsenceReport(), null, 2)}\n`);
}
