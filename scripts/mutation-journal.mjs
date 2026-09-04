// A verdict that does not survive an interruption is a verdict nobody gets.
//
// The full war takes over an hour against a real database, and this host
// restarts its container under load. Four consecutive runs were killed in
// flight, each one discarding every verdict it had already earned, so the
// gate's own summary line -- the thing the readiness artifact quotes -- had
// never once been produced for the current registry.
//
// The fix is a journal, not a longer timeout. Each verdict is appended the
// moment it is decided, and a later run skips what the journal already holds.
//
// The danger in that is obvious and is the whole design constraint: a journal
// is a way to report a verdict nobody measured. So every entry is bound to the
// exact mutation that produced it -- file, anchor, replacement and killing
// suites, hashed. Change any of them and the entry stops matching, and the
// mutation runs again. A journal can shorten a run; it can never answer for a
// guard that has moved.
import { createHash } from 'node:crypto';
import { appendFileSync, readFileSync } from 'node:fs';

/** What a verdict was actually about. */
export function mutationFingerprint(mutation) {
  return createHash('sha256').update(JSON.stringify([
    mutation.id,
    mutation.file,
    mutation.find,
    mutation.replace,
    [...(mutation.suites || [])].sort()
  ])).digest('hex').slice(0, 32);
}

/**
 * Verdicts a previous run earned for mutations that have not changed since.
 *
 * Anything unreadable, malformed, or fingerprinted against a different
 * registration is dropped rather than repaired: a journal is a shortcut, and a
 * shortcut that guesses is worse than no shortcut.
 */
export function loadJournal(path, mutations) {
  const expected = new Map(mutations.map(mutation => [mutation.id, mutationFingerprint(mutation)]));
  const verdicts = new Map();
  let text;
  try { text = readFileSync(path, 'utf8'); } catch { return verdicts; }

  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let row;
    try { row = JSON.parse(line); } catch { continue; }
    if (typeof row?.id !== 'string' || typeof row?.verdict !== 'string') continue;
    if (row.fingerprint !== expected.get(row.id)) continue;
    // A later line supersedes an earlier one, so a re-run of a single mutation
    // corrects the record rather than being ignored by it.
    verdicts.set(row.id, row.verdict);
  }
  return verdicts;
}

/** Records one verdict, durably, before the next mutation starts. */
export function appendVerdict(path, mutation, verdict) {
  appendFileSync(path, `${JSON.stringify({
    id: mutation.id,
    fingerprint: mutationFingerprint(mutation),
    verdict,
    at: new Date().toISOString()
  })}\n`);
}
