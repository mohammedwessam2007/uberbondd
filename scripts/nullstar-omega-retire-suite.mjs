#!/usr/bin/env node
// Sections 322 and 323. Retire the contaminated suite; keep its history.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { retireSuite } from '../src/nullstar-omega-independent-suite.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const read = relative => { try { return JSON.parse(readFileSync(join(root, relative), 'utf8')); } catch { return null; } };

const baselines = read('artifacts/nullstar-omega/baselines.json');
const finding = baselines?.suiteValidityFinding;

const retirement = retireSuite({
  suiteVersion: 'omega-local-evidence-suite-1.0.0',
  reason: finding
    ? `${finding.detail} ${finding.whatThatMeans}`
    : 'For every sealed task the expected answer and the observation were the same expression over the same file, so any tree scored full marks against itself.',
  evidenceRef: 'artifacts/nullstar-omega/baselines.json',
  replacedBy: 'omega-independent-suite-1.0.0'
});

if (!retirement.ok) {
  console.error('RETIREMENT_INVALID', retirement.reasonCodes);
  process.exit(1);
}

// Which recorded generations were scored on the retired instrument. Their
// numbers stay exactly as they were; what changes is that a reader can now see
// the instrument was broken.
const contaminated = ['G0', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6']
  .map(id => ({ id, artifact: `artifacts/nullstar-omega/generations/${id}.json`, generation: read(`artifacts/nullstar-omega/generations/${id}.json`) }))
  .filter(row => row.generation)
  .map(row => ({
    generationId: row.id,
    suiteVersion: row.generation.suiteVersion,
    meanMeasuredScore: row.generation.meanMeasuredScore,
    contaminated: true,
    why: 'Scored on a suite whose answers were read from the same expression that produced them.'
  }));

const record = {
  schemaVersion: 'uberbond-nullstar-omega-suite-retirement-1.0.0',
  directiveSections: ['321', '322', '323', '324'],
  generatedAt: new Date().toISOString(),
  sourceCommit: head,
  retirement,
  contaminatedGenerations: contaminated,
  trivialBaselineScore: finding?.trivialBaselineScore ?? null,
  whatIsPreserved: 'Every generation artifact stays on disk and unmodified. This record sits beside them and says which instrument produced them.',
  whatIsNotClaimed: 'Retiring the instrument does not retroactively make the system more or less capable. It says the earlier numbers were not measuring what they appeared to measure.',
  businessEffectAuthority: 'NONE'
};

mkdirSync(join(root, 'artifacts/nullstar-omega'), { recursive: true });
writeFileSync(join(root, 'artifacts/nullstar-omega/suite-retirement.json'), `${JSON.stringify(record, null, 2)}\n`);

console.log(`retired ${retirement.suiteVersion}`);
console.log(`  replaced by: ${retirement.replacedBy}`);
console.log(`  contaminated generations: ${contaminated.map(row => row.generationId).join(', ')}`);
console.log(`  trivial baseline scored: ${record.trivialBaselineScore}`);
console.log(`  comparable with successor: ${retirement.comparableWithSuccessor}`);
