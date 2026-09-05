#!/usr/bin/env node
// TEMP artifact emitter only. Runs the canonical readiness generator in a disposable checkout.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const inputPath = 'config/system-readiness-input.json';
const canonicalHead = '219edaf5038e98ba3f3115b7095004308f2ad056';
const canonicalBranch = 'gpt/frontier-council-max-clean-closure-20260905';
const input = JSON.parse(readFileSync(inputPath, 'utf8'));

input.measurements['check:syntax'] = {
  ...input.measurements['check:syntax'],
  command: 'npm run check:syntax',
  filesParsed: 871,
  ranAt: '2026-09-05T12:00:33Z'
};
input.measurements['test:deterministic'] = {
  ...input.measurements['test:deterministic'],
  command: 'npm run test:deterministic',
  tests: 3683,
  pass: 3626,
  fail: 3,
  skipped: 54,
  ranAt: '2026-09-05T12:08:08Z',
  note: 'Measured on the real Vercel checkout for source candidate 219edaf5038e98ba3f3115b7095004308f2ad056: 3683 tests, 3626 pass, 3 fail, 54 skipped. All three failures were generated present-tense canon/readiness drift: two stale source-commit references and one stale reachability count. No MAX Council behavior failed. This readiness regeneration records the measured run without upgrading it to a green run.'
};
input.measurements.reachability = {
  ...input.measurements.reachability,
  command: 'node --test tests/reachability-ratchet.test.mjs',
  srcModules: 342,
  reachableFromProduction: 143,
  reachableFromOperatorScriptsOnly: 62,
  noEntryPointAtAll: 137,
  allClassified: true,
  ranAt: '2026-09-05T12:08:06Z',
  note: 'Frontier Cognitive Fabric makes the previously classified frontier-context-spine operator-reachable. Exact graph: 342 src modules = 143 production + 62 operator-only + 137 gated/unreachable.'
};
writeFileSync(inputPath, `${JSON.stringify(input, null, 2)}\n`);

execFileSync('git', ['add', inputPath], { stdio: 'inherit' });
execFileSync('git', ['-c', 'user.name=UberBond Canon Runner', '-c', 'user.email=canon@invalid.local', 'commit', '-m', 'TEMP local readiness input'], { stdio: 'inherit' });

execFileSync('npm', ['run', 'readiness'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    UBERBOND_CANONICAL_HEAD: canonicalHead,
    UBERBOND_CANONICAL_BRANCH: canonicalBranch
  }
});

for (const path of [inputPath, 'docs/CURRENT_SYSTEM_STATE.md', 'artifacts/system-readiness.json']) {
  const encoded = Buffer.from(readFileSync(path, 'utf8'), 'utf8').toString('base64');
  const size = 8000;
  const chunks = Math.ceil(encoded.length / size);
  console.log(`CANON_ARTIFACT_BEGIN ${path} ${chunks}`);
  for (let i = 0; i < chunks; i += 1) {
    console.log(`CANON_ARTIFACT_CHUNK ${path} ${i + 1}/${chunks} ${encoded.slice(i * size, (i + 1) * size)}`);
  }
  console.log(`CANON_ARTIFACT_END ${path}`);
}
console.log('CANON_ARTIFACT_EMIT_COMPLETE');
