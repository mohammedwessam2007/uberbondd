// Runs the exit drill for real, against real bytes.
//
// The module next door judges a drill. This performs one: it exports the
// repository's durable canon, restores it into a disposable directory, reads
// the restored bytes back off disk, cuts over to them, and then proves the
// original is still there. Nothing is asserted that was not observed.
//
// It touches only owned local paths and makes no network call, so the scope it
// can honestly claim is LOCAL_STATE_PORTABILITY. A provider cutover would need
// authorized external infrastructure; claiming it from here would manufacture
// exactly the proof the canon forbids.
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { stateDigest, judgeExitDrill, survivalPosture } from '../src/supplier-exit-drill.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// The state UberBond would need on the other side of an exit: canon, memory,
// readiness and the coverage matrix. Chosen because losing these is what makes
// a move irreversible -- code can be re-cloned from anywhere.
const DURABLE_STATE = [
  'UBERBOND_CANON.md',
  'UBERBOND_BOOTSTRAP.json',
  'NORTH_STAR.md',
  'AGENTS.md',
  'docs/CURRENT_HANDOFF.json',
  'docs/CURRENT_SYSTEM_STATE.md',
  'artifacts/system-readiness.json',
  'artifacts/uberbond-memory-index.json',
  'artifacts/sovereign/implementation-coverage-matrix.json',
  'artifacts/sovereign/implementation-manifest.json',
  'artifacts/sovereign/enforcement-manifest.json'
];

export function runExitDrill({ supplier = 'repository-host', files = DURABLE_STATE, repoRoot = root } = {}) {
  const present = files.filter(file => existsSync(join(repoRoot, file)));

  // EXPORT: read the real bytes.
  const exportedEntries = present.map(file => ({ name: file, bytes: readFileSync(join(repoRoot, file), 'utf8') }));
  const exported = stateDigest(exportedEntries);

  const cell = mkdtempSync(join(tmpdir(), 'uberbond-exit-drill-'));
  try {
    // RESTORE: write into a disposable cell, then read back off disk rather
    // than reusing what was written. Comparing the in-memory copy to itself
    // would pass on a restore that never actually landed.
    for (const entry of exportedEntries) {
      const target = join(cell, entry.name);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, entry.bytes);
    }
    const restored = stateDigest(present.map(file => ({ name: file, bytes: readFileSync(join(cell, file), 'utf8') })));

    // CUTOVER: serve from the restored copy. Proven by reading a known-load-
    // bearing file out of the cell and checking it is the canon, not a stub.
    const canonFromCell = existsSync(join(cell, 'UBERBOND_CANON.md'))
      ? readFileSync(join(cell, 'UBERBOND_CANON.md'), 'utf8')
      : '';
    const servedFromRestoredCopy = canonFromCell.includes('UberBond Canon');

    // ROLLBACK: the original must still be there afterwards. A cutover you
    // cannot come back from is a migration, not a rehearsal.
    const originalReachable = present.every(file => existsSync(join(repoRoot, file)))
      && stateDigest(present.map(file => ({ name: file, bytes: readFileSync(join(repoRoot, file), 'utf8') }))).digest === exported.digest;

    return judgeExitDrill({
      supplier,
      scope: 'LOCAL_STATE_PORTABILITY',
      steps: {
        EXPORT: exported,
        RESTORE: restored,
        CUTOVER: { servedFromRestoredCopy },
        ROLLBACK: { originalReachable }
      }
    });
  } finally {
    rmSync(cell, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const drill = runExitDrill();
  const posture = survivalPosture([drill]);
  console.log(JSON.stringify({ drill, posture }, null, 2));
  process.exit(drill.ok ? 0 : 1);
}
