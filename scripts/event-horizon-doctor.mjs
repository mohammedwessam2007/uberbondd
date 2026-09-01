import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { summarizeEventHorizon } from '../src/event-horizon.mjs';

export const EVENT_HORIZON_ARTIFACT_PATH = 'artifacts/event-horizon/economic-genome-2026-08-31.json';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

try {
  const record = JSON.parse(fs.readFileSync(path.join(root, EVENT_HORIZON_ARTIFACT_PATH), 'utf8'));
  const summary = summarizeEventHorizon(record);

  // Whether the research SHA is a real commit is a question about this
  // repository, not about the record, so it is asked here rather than inside the
  // pure validator -- which has no git and should stay testable without one.
  //
  // The validator checks the SHA is forty hex characters. That accepts a
  // well-formed commit nobody can check out, which is the same orphan-provenance
  // failure canon-freshness exists to catch: a record claiming to describe a
  // tree that is not in this history.
  const researchSha = String(record?.sourceMainShaAtResearchStart || '');
  let shaReachable = 'UNKNOWN_NO_GIT';
  if (/^[a-f0-9]{40}$/.test(researchSha)) {
    try {
      execFileSync('git', ['merge-base', '--is-ancestor', researchSha, 'HEAD'], { cwd: root, stdio: 'ignore' });
      shaReachable = 'REACHABLE_IN_THIS_HISTORY';
    } catch {
      shaReachable = 'NOT_AN_ANCESTOR_OF_HEAD';
    }
  } else {
    shaReachable = 'MALFORMED';
  }

  const report = { ...summary, sourceMainShaAtResearchStart: researchSha, sourceMainShaReachability: shaReachable };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  // UNKNOWN_NO_GIT is not a failure: a tarball checkout has no history to ask.
  // Naming a commit this history does not contain is.
  if (!summary.ok || shaReachable === 'NOT_AN_ANCESTOR_OF_HEAD' || shaReachable === 'MALFORMED') process.exitCode = 1;
} catch (error) {
  process.stderr.write(`${JSON.stringify({ ok: false, health: 'EVENT_HORIZON_DOCTOR_FAILED', reason: error?.message || 'unknown-error' }, null, 2)}\n`);
  process.exitCode = 1;
}
