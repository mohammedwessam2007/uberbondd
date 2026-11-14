import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AREAS, DOMAINS, PROJECTS, projectsFor, buildIndex, classifyArea, classifyDomain, dateFromName, describe, normaliseName, renderAll } from '../scripts/repository-index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const domainIds = new Set(DOMAINS.map(d => d[0]));

test('names normalise across code and document conventions', () => {
  assert.equal(normaliseName('tests/uberwarm2-pg-ledger.test.mjs'), 'uberwarm2-pg-ledger');
  assert.equal(normaliseName('docs/PHOENIX_CONTEXT_SURVIVAL_PROTOCOL.md'), 'phoenix-context-survival-protocol');
});

test('a module, its test and its document land in the same domain', () => {
  for (const [files, domain] of [
    [['src/uberwarm2-pg-ledger.mjs', 'tests/uberwarm2-pg-ledger.test.mjs', 'docs/reports/UBERWARM_NODE_PRESET_ROUTING_20261019.md'], 'email-infrastructure'],
    [['src/capability-genome-runtime.mjs', 'scripts/capability-genome-doctor.mjs', 'docs/CAPABILITY_GENOME_CANON.md'], 'capability-genome'],
    [['src/personal-civilization-kernel.mjs', 'docs/PERSONAL_CIVILIZATION_ENGINE_NORTH_STAR.md', 'NORTH_STAR.md'], 'north-star-life'],
    [['src/genesis-ontology.mjs', 'src/founder-moonshot-literal-corpus.mjs', 'docs/FOUNDER_890_UNIVERSAL_CROSS_CHAT_INTEGRATION.md'], 'genesis-frontier']
  ]) for (const f of files) assert.equal(classifyDomain(f), domain, f);
});

test('specific rules win over broader prefixes', () => {
  assert.equal(classifyDomain('src/gamechanger-for-life.mjs'), 'north-star-life');
  assert.equal(classifyDomain('src/uberbond-self-maintainer.mjs'), 'self-maintenance');
  assert.equal(classifyDomain('src/memory-sovereignty.mjs'), 'north-star-life');
  assert.equal(classifyDomain('docs/forensics/daily/DAILY_SEP_16_20_2026.md'), 'history-forensics');
  assert.equal(classifyDomain('zzz-never-seen-before.bin'), 'core-misc');
});

test('areas, dates and descriptions are extracted deterministically', () => {
  assert.equal(classifyArea('server.mjs'), 'root');
  assert.equal(classifyArea('open router/README.md'), 'open router');
  assert.equal(classifyArea('winnr/README.md'), 'other');
  assert.equal(dateFromName('docs/X_2026-09-30.md'), '2026-09-30');
  assert.equal(dateFromName('docs/X_20261019.md'), '2026-10-19');
  assert.equal(dateFromName('docs/NORTH_STAR_PRECEDENCE.md'), null);
  assert.equal(describe('a.md', '# Title\n\nStatus: **DRAFT**\n'), 'Title — Status: DRAFT');
  assert.equal(describe('a.mjs', '// Does one thing.\nexport const A = 1;\n'), 'Does one thing.');
  assert.equal(describe('a.mjs', 'export const A = 1;\nexport function b() {}\n'), 'exports A, b');
});

test('every tracked file is indexed exactly once with a known area and domain', () => {
  const index = buildIndex(root);
  const areaIds = new Set(AREAS.map(a => a[0]));
  assert.equal(new Set(index.files.map(f => f.path)).size, index.files.length);
  for (const f of index.files) {
    assert.ok(areaIds.has(f.area), f.path);
    assert.ok(domainIds.has(f.domain), f.path);
  }
  assert.equal(Object.values(index.totals.byDomain).reduce((a, b) => a + b, 0), index.totals.files);
  const outputs = renderAll(index);
  assert.ok(outputs.has('REPOSITORY_INDEX.md') && outputs.has('docs/index/DOMAINS.md'));
  assert.deepEqual([...renderAll(buildIndex(root))], [...outputs], 'rendering is deterministic');
});

test('project pages: a file joins every project its path names', () => {
  assert.deepEqual(projectsFor('docs/PHOENIX_CONTEXT_SURVIVAL_PROTOCOL.md'), ['phoenix', 'continuity']);
  assert.deepEqual(projectsFor('src/phoenix-owner-vault.mjs'), ['phoenix']);
  assert.ok(projectsFor('src/uberwarm2-protected-winnr-runtime.mjs').includes('uberwarm'));
  assert.ok(projectsFor('src/uberwarm2-protected-winnr-runtime.mjs').includes('winnr'));
  assert.ok(projectsFor('docs/architecture/UBERMIND_V7_PROVEN_CROSS_CHAT_CONTINUITY_2026-10-24.md').includes('ubermind'));
  assert.ok(projectsFor('docs/COLD_EMAIL_SYSTEM_V5_10_OF_10_2026-09-28.md').includes('outreach'));
  const outputs = renderAll(buildIndex(root));
  for (const [id] of PROJECTS) assert.ok(outputs.has(`docs/projects/${id}.md`), id);
  assert.match(outputs.get('docs/projects/phoenix.md'), /## Read first[\s\S]*PHOENIX_CONTEXT_SURVIVAL_PROTOCOL\.md/);
});
