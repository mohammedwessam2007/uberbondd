#!/usr/bin/env node
// Economic Asset Atlas: gives every tracked path, every named program and every
// founder idea an economic classification with a stated basis.
//
// Deterministic and offline. Inputs: `git ls-files`, the repository index, the
// authored program genome (config/monetization/program-commercial-genome.json)
// and the MACHIAVELLI wealth-mechanism atlas. A classification is a judgement
// with a pointer to its basis; it is not evidence of demand or revenue.
//
//   node scripts/economic-asset-atlas.mjs          regenerate
//   node scripts/economic-asset-atlas.mjs --check  exit 1 when the committed atlas is stale
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ATLAS_SCHEMA = 'uberbond.economic-asset-atlas.v1';
const OUT = 'artifacts/monetization-singularity';
const FILES = { paths: `${OUT}/economic-asset-atlas.jsonl`, ideas: `${OUT}/founder-idea-economic-atlas.json`, coverage: `${OUT}/coverage.json` };

export const DOMAIN_CLASS = Object.freeze({
  'north-star-life': 'PRIVATE_NONCOMMERCIAL', 'ubermind-doctrine': 'DEFENSIVE_STRATEGIC', 'continuity-memory': 'COST_REDUCTION_INFRA', 'history-forensics': 'HISTORICAL_SUPERSEDED',
  'genesis-frontier': 'ECONOMIC_INTELLIGENCE', 'asi-research': 'RESEARCH_OPTION', 'frontier-cognition': 'COST_REDUCTION_INFRA', 'capability-genome': 'ECONOMIC_INTELLIGENCE',
  'agent-mesh-autonomy': 'AUTONOMY_INFRA', 'self-maintenance': 'AUTONOMY_INFRA', 'governance-proof': 'TRUST_INFRA', 'email-infrastructure': 'DISTRIBUTION_INFRA',
  'outreach-distribution': 'DISTRIBUTION_INFRA', 'commerce-payments': 'FULFILLMENT_INFRA', 'opportunity-intelligence': 'ECONOMIC_INTELLIGENCE', 'sovereign-infra': 'DEFENSIVE_STRATEGIC',
  'founder-operations': 'AUTONOMY_INFRA'
});
// Ordered: first match wins. These outrank project and domain membership.
export const PATH_RULES = Object.freeze([
  // Killed 2026-11-15: Apify blocks outbound port 25 (artifacts/monetization-singularity/apify-live-test-2026-11-15.json).
  ['killed-email-verifier', /^(actors\/definitive-email-verifier\/|tests\/definitive-email-verifier\.test\.mjs$)/, 'PRODUCT_CORE', 'KILLED_ON_EVIDENCE'],
  ['monetization-mission', /^(artifacts\/monetization-singularity\/|docs\/monetization\/|config\/monetization\/|scripts\/(economic-asset-atlas|apify-store-observatory)\.mjs$|tests\/(economic-asset-atlas|apify-store-observatory)\.test\.mjs$)/, 'ECONOMIC_INTELLIGENCE', 'INTERNAL_LEVERAGE'],
  ['frozen-history', /^(docs\/forensics|artifacts\/recovery|historical-archive|docs\/history|docs\/archive)\//, 'HISTORICAL_SUPERSEDED', 'HISTORICAL'],
  ['navigation-index', /^(docs\/index\/|docs\/projects\/|REPOSITORY_INDEX\.md$|artifacts\/repository-index\/)/, 'COST_REDUCTION_INFRA', 'INTERNAL_LEVERAGE']
]);

export function classifyPath(file, indexRecord, genome) {
  for (const [name, re, cls, disposition] of PATH_RULES) if (re.test(file)) return { p: file, c: cls, d: disposition, b: `path-rule:${name}` };
  const project = (indexRecord?.projects ?? []).find(id => genome.programs[id]);
  if (project) return { p: file, c: genome.programs[project].assetClass, d: genome.programs[project].disposition, b: `project:${project}` };
  const cls = DOMAIN_CLASS[indexRecord?.domain];
  if (cls) return { p: file, c: cls, d: 'INTERNAL_LEVERAGE', b: `domain:${indexRecord.domain}` };
  return { p: file, c: 'UNKNOWN', d: 'UNKNOWN_NEEDS_EVIDENCE', b: indexRecord ? 'unmatched' : 'not-in-repository-index' };
}

// Founder ideas: disposition follows the wealth atlas's own two fields; nothing is inferred from the title.
export function ideaDisposition(record) {
  if (record.economicRelevance === 'NONE') return 'ECONOMICALLY_IRRELEVANT_AT_THIS_STAGE';
  if (record.buildableToday === 'REQUIRES_FUTURE_TECH') return 'FUTURE_RESEARCH_OPTION';
  if (record.economicRelevance === 'INDIRECT') return 'INDIRECT_ENABLER';
  if (record.buildableToday === 'NOW_SOFTWARE_ONLY') return 'DIRECT_CANDIDATE_UNVALIDATED';
  return 'PRODUCT_COMBINATION_CANDIDATE';
}
const idOf = n => `founder-moonshot-${String(n).padStart(4, '0')}`;

export function buildAtlas(root, { trackedFiles } = {}) {
  const read = f => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
  const tracked = (trackedFiles ?? execFileSync('git', ['ls-files', '-z'], { cwd: root, maxBuffer: 64 * 1024 * 1024 }).toString().split('\0').filter(Boolean)).slice().sort();
  const genome = read('config/monetization/program-commercial-genome.json');
  const roster = read('config/repository-projects.json').projects.map(p => p.id);
  const index = new Map(read('artifacts/repository-index/index.json').files.map(f => [f.path, f]));
  const paths = tracked.map(f => classifyPath(f, index.get(f), genome));

  const wealth = read('artifacts/machiavelli/wealth-mechanism-atlas.json').records;
  const tournament = read('artifacts/machiavelli/profit-tournament.json');
  const exercised = new Map();
  const note = (id, text) => { if (!exercised.has(id)) exercised.set(id, []); if (!exercised.get(id).includes(text)) exercised.get(id).push(text); };
  for (const m of tournament.pool ?? []) for (const id of m.founderAncestry ?? []) note(id, `MACHIAVELLI tournament 2026-10: ${m.name.slice(0, 80)}`);
  for (const n of [58, 146, 653]) note(idOf(n), 'Definitive Email Verifier 2026-11: pricing and evidence rules');
  const ideas = wealth.map(r => ({ id: r.id, title: r.title, disposition: ideaDisposition(r), economicRelevance: r.economicRelevance, buildableToday: r.buildableToday, families: r.families ?? [], exercisedIn: exercised.get(r.id) ?? [] }));

  const count = (list, key) => Object.fromEntries([...list.reduce((m, x) => m.set(x[key], (m.get(x[key]) ?? 0) + 1), new Map())].sort((a, b) => a[0].localeCompare(b[0])));
  const expectedIds = Array.from({ length: 890 }, (_, i) => idOf(i + 1));
  const coverage = {
    schema: ATLAS_SCHEMA,
    truthBoundary: 'Classification coverage only. A classified path, program or idea has an economic label and a basis; it has not been shown to earn anything.',
    paths: { tracked: tracked.length, classified: paths.length, unknown: paths.filter(p => p.c === 'UNKNOWN').length, byClass: count(paths, 'c'), byDisposition: count(paths, 'd'), byBasisKind: count(paths.map(p => ({ k: p.b.split(':')[0] })), 'k') },
    programs: { roster: roster.length, withDisposition: roster.filter(id => genome.programs[id]).length, missing: roster.filter(id => !genome.programs[id]), extra: Object.keys(genome.programs).filter(id => !roster.includes(id)), byDisposition: count(Object.values(genome.programs), 'disposition'), buyerObserved: Object.values(genome.programs).filter(p => p.buyer !== 'UNKNOWN').length },
    founderIdeas: { expected: 890, mapped: ideas.length, missingIds: expectedIds.filter(id => !ideas.some(i => i.id === id)), duplicateIds: ideas.length - new Set(ideas.map(i => i.id)).size, id0625And0683Distinct: ideas.filter(i => i.id === idOf(625) || i.id === idOf(683)).length === 2, byDisposition: count(ideas, 'disposition'), exercisedInAnExperiment: ideas.filter(i => i.exercisedIn.length).length, bodiesLiveIn: 'artifacts/research/founder-moonshot-literal-corpus/ (not copied here)' },
    genesisDescendants: { note: 'Ideas beyond #0890 live in the GENESIS registries (artifacts/perpetual-frontier-genesis.json and artifacts/genesis/). They are tracked paths in this atlas; they were not individually re-read or re-classified in this mission.', individuallyClassified: 0 }
  };
  return { paths, ideas, coverage };
}

export function render({ paths, ideas, coverage }) {
  return new Map([
    [FILES.paths, `${paths.map(p => JSON.stringify(p)).join('\n')}\n`],
    [FILES.ideas, `${JSON.stringify({ schema: ATLAS_SCHEMA, source: 'artifacts/machiavelli/wealth-mechanism-atlas.json', truthBoundary: 'Titles and classifications only; the original idea bodies stay in the literal corpus. A disposition is a research direction, not a finding.', ideas }, null, 1)}\n`],
    [FILES.coverage, `${JSON.stringify(coverage, null, 1)}\n`]
  ]);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const check = process.argv.includes('--check');
  // The atlas files classify themselves, so they are part of the tracked set even before the first commit.
  const tracked = new Set(execFileSync('git', ['ls-files', '-z'], { cwd: root, maxBuffer: 64 * 1024 * 1024 }).toString().split('\0').filter(Boolean));
  for (const f of Object.values(FILES)) tracked.add(f);
  const outputs = render(buildAtlas(root, { trackedFiles: [...tracked] }));
  if (check) {
    const stale = [...outputs].filter(([f, body]) => !fs.existsSync(path.join(root, f)) || fs.readFileSync(path.join(root, f), 'utf8') !== body).map(x => x[0]);
    if (stale.length) { console.error(`economic asset atlas is stale: ${stale.join(', ')}\nrun: node scripts/economic-asset-atlas.mjs`); process.exit(1); }
    console.log('economic asset atlas is current');
  } else {
    fs.mkdirSync(path.join(root, OUT), { recursive: true });
    for (const [f, body] of outputs) fs.writeFileSync(path.join(root, f), body);
    console.log(JSON.stringify(JSON.parse(outputs.get(FILES.coverage)), null, 1));
  }
}
