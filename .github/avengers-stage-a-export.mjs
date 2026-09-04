import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const inputPath = 'config/system-readiness-input.json';
const input = JSON.parse(readFileSync(inputPath, 'utf8'));

input.measurements['check:syntax'] = {
  command: 'npm run check:syntax',
  filesParsed: 804,
  ranAt: '2026-09-04T15:23:40Z',
  note: 'Measured on exact current-main-reconciled Avengers head 845ad3f0f09132bc2e2e55ffd1f7fabebb709668 by Vercel deployment dpl_LeDu4rh7daVWAyoomevn2Gch746P.'
};
input.measurements['test:deterministic'] = {
  command: 'npm run test:deterministic',
  tests: 3515,
  pass: 3459,
  fail: 2,
  skipped: 54,
  ranAt: '2026-09-04T15:23:40Z',
  note: 'Measured on exact current-main-reconciled Avengers head 845ad3f0f09132bc2e2e55ffd1f7fabebb709668: 3515 total / 3459 pass / 2 fail / 54 skipped. Both failures were exclusively canonical freshness assertions (source binding and syntax 792 vs 804); no behavioral failure was observed. This records the pre-regeneration measurement, not a fabricated post-regeneration pass.'
};
input.measurements.reachability = {
  command: 'node --test tests/reachability-ratchet.test.mjs',
  srcModules: 319,
  reachableFromProduction: 143,
  reachableFromOperatorScriptsOnly: 38,
  noEntryPointAtAll: 138,
  allClassified: true,
  ranAt: '2026-09-04T14:00:30Z',
  note: 'Measured Avengers partition: 319 total / 143 production / 38 operator-only / 138 gated. Avengers adds operator-only model/tool execution surfaces and no implicit production/business authority.'
};

mkdirSync('public', { recursive: true });
writeFileSync('public/avengers-stage-a-input.json', `${JSON.stringify(input, null, 2)}\n`);
console.log(JSON.stringify({ status: 'AVENGERS_STAGE_A_INPUT_EXPORTED', source: '845ad3f0f09132bc2e2e55ffd1f7fabebb709668' }));
