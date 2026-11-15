// Economic Asset Atlas: coverage is computed, never asserted by hand.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAtlas, classifyPath, ideaDisposition, DOMAIN_CLASS } from '../scripts/economic-asset-atlas.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const genome = JSON.parse(fs.readFileSync(path.join(root, 'config/monetization/program-commercial-genome.json'), 'utf8'));
const atlas = buildAtlas(root);

test('every tracked path gets exactly one record with a known class and a stated basis', () => {
  const { paths, coverage } = atlas;
  assert.equal(coverage.paths.classified, coverage.paths.tracked);
  assert.equal(new Set(paths.map(p => p.p)).size, paths.length);
  for (const p of paths) { assert.ok(genome.assetClasses.includes(p.c), `${p.p}: ${p.c}`); assert.match(p.b, /^(path-rule|project|domain):.+|^(unmatched|not-in-repository-index)$/); }
  assert.equal(coverage.paths.unknown, paths.filter(p => p.c === 'UNKNOWN').length, 'unknown is counted, not hidden');
});
test('every rostered program has a disposition, and no buyer is claimed without one being observed', () => {
  const { programs } = atlas.coverage;
  assert.deepEqual([programs.withDisposition, programs.missing, programs.extra], [programs.roster, [], []]);
  for (const [id, p] of Object.entries(genome.programs)) {
    assert.ok(genome.assetClasses.includes(p.assetClass) && genome.dispositions.includes(p.disposition), id);
    assert.ok(p.role.length > 10, id);
    if (['KILLED_ON_EVIDENCE', 'COMPONENT_OF_CHAMPION'].includes(p.disposition)) assert.notEqual(p.externalEvidence, 'NONE', `${id}: a kill or a champion role needs evidence`);
  }
  assert.equal(programs.buyerObserved, 0, 'no buyer has been observed; change this only with a receipt');
});
test('all 890 founder ideas are mapped once, with #0625 and #0683 kept apart', () => {
  const { founderIdeas } = atlas.coverage;
  assert.deepEqual([founderIdeas.mapped, founderIdeas.missingIds, founderIdeas.duplicateIds, founderIdeas.id0625And0683Distinct], [890, [], 0, true]);
  assert.equal(Object.values(founderIdeas.byDisposition).reduce((a, b) => a + b, 0), 890);
});
test('classification rules: path rules outrank projects, projects outrank domains, the rest is UNKNOWN', () => {
  const g = { programs: { winnr: { assetClass: 'DISTRIBUTION_INFRA', disposition: 'INTERNAL_LEVERAGE' } } };
  assert.equal(classifyPath('docs/history/x.md', { projects: ['winnr'], domain: 'email-infrastructure' }, g).b, 'path-rule:frozen-history');
  assert.equal(classifyPath('src/x.mjs', { projects: ['nope', 'winnr'], domain: 'asi-research' }, g).b, 'project:winnr');
  assert.deepEqual(classifyPath('src/x.mjs', { projects: [], domain: 'asi-research' }, g), { p: 'src/x.mjs', c: DOMAIN_CLASS['asi-research'], d: 'INTERNAL_LEVERAGE', b: 'domain:asi-research' });
  assert.equal(classifyPath('src/x.mjs', { projects: [], domain: 'core-misc' }, g).c, 'UNKNOWN');
  assert.equal(classifyPath('new/file.txt', undefined, g).b, 'not-in-repository-index');
});
test('idea dispositions follow the source fields only', () => {
  assert.equal(ideaDisposition({ economicRelevance: 'NONE', buildableToday: 'NOW_SOFTWARE_ONLY' }), 'ECONOMICALLY_IRRELEVANT_AT_THIS_STAGE');
  assert.equal(ideaDisposition({ economicRelevance: 'DIRECT', buildableToday: 'REQUIRES_FUTURE_TECH' }), 'FUTURE_RESEARCH_OPTION');
  assert.equal(ideaDisposition({ economicRelevance: 'INDIRECT', buildableToday: 'PARTIAL_MINIATURE' }), 'INDIRECT_ENABLER');
  assert.equal(ideaDisposition({ economicRelevance: 'DIRECT', buildableToday: 'NOW_SOFTWARE_ONLY' }), 'DIRECT_CANDIDATE_UNVALIDATED');
  assert.equal(ideaDisposition({ economicRelevance: 'DIRECT', buildableToday: 'PARTIAL_MINIATURE' }), 'PRODUCT_COMBINATION_CANDIDATE');
});
