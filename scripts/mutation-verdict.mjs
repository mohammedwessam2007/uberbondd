// How a mutation is applied, and how the resulting run is judged.
//
// Split out of scripts/mutation-war.mjs, which holds the registry of guards to
// attack. That separation is not tidiness: the war can mutate its own source,
// and while the anchors lived in the same file as the code they point at, every
// anchor appeared twice -- once in the function and once in the registry entry
// quoting it. `String.prototype.replace` with a string pattern takes the first
// occurrence, so such a mutation silently edited the registry entry instead of
// the code, ran an unmutated tree, and reported the guard as surviving.
//
// Found by writing exactly that mutation and watching it survive.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const tapCount = (output, field) => {
  const match = output.match(new RegExp(`^# ${field} (\\d+)$`, 'm'));
  return match ? Number(match[1]) : null;
};

// What the exit status alone cannot tell you.
//
// The verdict used to be `status === 0 ? 'SURVIVED' : 'KILLED'`. Both halves of
// that are wrong in a way that matters, and in opposite directions.
//
// A green run is only evidence of survival if the suite actually ran its
// assertions. MONEY-17's only killing suite needs a real PostgreSQL; without one
// it skips itself and exits 0, and the war printed "a guard nothing kills"
// about a guard nothing had tried to kill.
//
// A red run is worse. Anything non-zero counted as KILLED, so a mutant that
// broke the module at import time -- not a failed assertion, a suite that never
// loaded -- was recorded as a guard proven to hold. That is silent: the gate
// stays green and the count still says 94.
//
// So the verdict is read from what the run reports rather than from its exit
// code, and the two cases that prove nothing get their own names instead of
// being absorbed into the two that do.
export function classifySuiteRun({ status, output }) {
  const failed = tapCount(output, 'fail');
  const passed = tapCount(output, 'pass');
  const skipped = tapCount(output, 'skipped');

  if (status !== 0) {
    // A failing assertion is what kills a mutant. A suite that could not run at
    // all reports no failures, and proves nothing either way.
    if (failed !== null && failed > 0) return 'KILLED';
    return 'SUITE_DID_NOT_RUN';
  }
  if (passed === 0 && skipped !== null && skipped > 0) return 'NO_ASSERTIONS_RAN';
  return 'SURVIVED';
}

export function applyMutation(root, mutation) {
  const target = join(root, mutation.file);
  const source = readFileSync(target, 'utf8');
  const occurrences = source.split(mutation.find).length - 1;
  if (occurrences === 0) {
    return { applied: false, reason: 'anchor-not-found' };
  }
  // An anchor matching more than once does not identify a site. `replace` with a
  // string pattern would take the first, which may not be the one the mutation
  // means -- and a mutation applied somewhere else proves nothing about the
  // guard it names, while still reporting a verdict as if it did.
  if (occurrences > 1) {
    return { applied: false, reason: 'anchor-ambiguous', occurrences };
  }
  writeFileSync(target, source.replace(mutation.find, mutation.replace));
  return { applied: true };
}
