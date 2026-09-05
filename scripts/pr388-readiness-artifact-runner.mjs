import fs from 'node:fs';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const classificationPath = 'config/reachability-classification.json';
const raw = fs.readFileSync(classificationPath, 'utf8');
const doc = JSON.parse(raw);
const target = 'src/frontier-context-spine.mjs';
if (!doc?.modules?.[target]) throw new Error(`expected stale classification ${target}`);
const beforeKeys = Object.keys(doc.modules).sort();
const beforeOther = Object.fromEntries(Object.entries(doc.modules).filter(([key]) => key !== target));
const beforeOtherDigest = crypto.createHash('sha256').update(JSON.stringify(beforeOther)).digest('hex');
delete doc.modules[target];
const afterKeys = Object.keys(doc.modules).sort();
if (beforeKeys.length - afterKeys.length !== 1 || beforeKeys.filter(key => !afterKeys.includes(key)).join('\n') !== target) {
  throw new Error('classification delta exceeded one exact key');
}
const afterOtherDigest = crypto.createHash('sha256').update(JSON.stringify(doc.modules)).digest('hex');
if (beforeOtherDigest !== afterOtherDigest) throw new Error('unrelated classification content changed');
fs.writeFileSync(classificationPath, `${JSON.stringify(doc, null, 2)}\n`);

const readiness = spawnSync('npm', ['run', 'readiness'], { encoding: 'utf8', stdio: 'inherit', env: process.env });
if (readiness.status !== 0) process.exit(readiness.status ?? 1);

const diff = spawnSync('git', ['diff', '--name-only'], { encoding: 'utf8' });
if (diff.status !== 0) throw new Error(diff.stderr || 'git diff failed');
const changedFiles = diff.stdout.split(/\r?\n/).map(v => v.trim()).filter(Boolean);
const allowed = changedFiles.filter(path => path === classificationPath || path.startsWith('docs/') || path.startsWith('artifacts/'));
const unexpected = changedFiles.filter(path => !allowed.includes(path));
if (unexpected.length) throw new Error(`readiness touched unexpected files: ${unexpected.join(', ')}`);
const manifest = {
  schema: 'uberbond.pr388-readiness-artifact-manifest.v1',
  generatedAt: new Date().toISOString(),
  sourceCommit: process.env.VERCEL_GIT_COMMIT_SHA || null,
  removedClassification: target,
  preservedOtherClassificationDigest: beforeOtherDigest,
  changedFiles: allowed
};
fs.mkdirSync('artifacts', { recursive: true });
fs.writeFileSync('artifacts/pr388-readiness-delta.json', `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`PR388_READINESS_ARTIFACTS_READY ${JSON.stringify(manifest)}`);
