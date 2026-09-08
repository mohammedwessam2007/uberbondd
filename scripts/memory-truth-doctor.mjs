#!/usr/bin/env node
// Runs the memory truth boundary against this repository's own artifacts.
//
// A synthetic fixture would prove the module works. This proves the repository
// obeys it, which is the interesting question, because the numbers the laws
// exist to protect are sitting in artifacts/uberbond-memory-index.json right
// now: 438 opportunity IDs, 2,000 scored combinations, 12,114 text documents.
// Every one of them reads like traction when quoted without its class, and the
// only defence that survives a fresh session is a mechanical one.
//
// So this walks the real memory index, asks each historical count a commercial
// question, and reports the refusals. A run where any of them answers is a run
// that found a real problem.
//
// Read-only. Reads repository artifacts, writes nothing outside --out.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  answerFromCount, resolveExistence, resolveRecalledName, describePortfolio, reconcile,
  COMMERCIAL_QUESTIONS
} from '../src/memory-truth-boundary.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const arg = process.argv[i];
  if (!arg.startsWith('--')) continue;
  const next = process.argv[i + 1];
  args.set(arg, next && !next.startsWith('--') ? process.argv[++i] : true);
}

const readJson = relative => {
  try { return JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8')); }
  catch { return null; }
};

const memoryIndex = readJson('artifacts/uberbond-memory-index.json');

// Every historical count in the index, asked every commercial question. The
// snapshots carry their own warnings in prose; this checks the mechanism agrees.
const countChecks = [];
for (const snapshot of (memoryIndex?.historicalCorpusSnapshots || [])) {
  const metrics = snapshot?.metrics && typeof snapshot.metrics === 'object' ? snapshot.metrics : {};
  for (const [metric, value] of Object.entries(metrics)) {
    if (!Number.isSafeInteger(value) || value < 0) continue;
    for (const question of COMMERCIAL_QUESTIONS) {
      const asked = answerFromCount({
        count: value,
        // Historical corpus metrics are catalogue breadth by construction.
        countClass: 'INVENTORY',
        describes: `${metric} in the ${snapshot.asOf} ${snapshot.evidenceClass} snapshot`,
        question
      });
      countChecks.push({
        metric, value, question,
        asOf: snapshot.asOf,
        answered: asked.ok ? asked.answer !== null : null,
        status: asked.status
      });
    }
  }
}

const leaked = countChecks.filter(row => row.answered === true);

// The portfolio, described from the index rather than from whatever offer is
// currently active.
const families = (memoryIndex?.productFamilies || [])
  .map(row => (typeof row === 'string' ? row : row?.name || row?.family))
  .filter(Boolean);
const portfolio = families.length
  ? describePortfolio({ portfolio: families, answerNames: families })
  : null;
// The failure the law names: an answer that mentions only the active experiment.
const reducedAnswer = families.length > 1
  ? describePortfolio({ activeExperiment: families[0], portfolio: families, answerNames: [families[0]] })
  : null;

// Unresolved owner-recalled names must still be unresolved and still present.
const unresolved = (memoryIndex?.unresolvedNames || []).map(row => {
  const resolved = resolveRecalledName({
    name: row?.name,
    proposedMeaning: row?.requiredAction || null,
    sourceRef: row?.sourceRef || null
  });
  return { name: row?.name ?? null, resolved: resolved.ok ? resolved.resolved : null, state: resolved.ok ? resolved.state : resolved.status };
});

// Existence, resolved against the sources actually read here rather than
// against a feeling about what the repository contains.
const searched = ['artifacts/uberbond-memory-index.json'];
const required = [
  'artifacts/uberbond-memory-index.json',
  'docs/UBERBOND_TOTAL_BRAIN.md',
  'docs/UBERBOND_MASTER_MEMORY.md',
  'artifacts/sovereign/implementation-coverage-matrix.json'
];
// A name present in the index as an OWNER_RECALLED_UNRESOLVED record is a
// preserved pointer, not a found thing. Counting it as found would be the
// amputation error running backwards: over-claiming resolution instead of
// over-claiming absence. Everest is exactly that case -- it is in
// namedInitiatives *and* in unresolvedNames, and both are correct.
const resolvedInitiatives = new Set((memoryIndex?.namedInitiatives || [])
  .filter(row => typeof row === 'string' || row?.status !== 'OWNER_RECALLED_UNRESOLVED')
  .map(row => (typeof row === 'string' ? row : row?.name)).filter(Boolean));
const preservedButUnresolved = new Set((memoryIndex?.namedInitiatives || [])
  .filter(row => typeof row !== 'string' && row?.status === 'OWNER_RECALLED_UNRESOLVED')
  .map(row => row?.name).filter(Boolean));
const probe = String(args.get('--exists') || 'Everest');
const existence = resolveExistence({
  name: probe,
  sourcesSearched: searched,
  foundIn: resolvedInitiatives.has(probe) ? ['artifacts/uberbond-memory-index.json'] : [],
  requiredSources: required
});

// Precedence, demonstrated on the one conflict this repository actually has:
// the historical root README defined UberBond as a Revenue Engine.
const precedence = reconcile({
  claim: 'what UberBond is',
  currentTruth: 'a Sovereign Cognitive Continuum with the economic engine as a subordinate organ',
  historicalMemory: 'a website-audit Revenue Engine',
  donated: ['lead-path evidence', 'payment truth', 'outbound suppression semantics']
});

const report = {
  ok: leaked.length === 0,
  status: leaked.length === 0 ? 'MEMORY_TRUTH_BOUNDARY_HOLDS' : 'HISTORICAL_COUNT_ANSWERED_A_COMMERCIAL_QUESTION',
  version: 'uberbond.memory-truth-doctor.v1',
  generatedAt: new Date().toISOString(),
  counts: {
    checked: countChecks.length,
    refused: countChecks.filter(row => row.answered === false).length,
    leaked: leaked.map(row => ({ metric: row.metric, value: row.value, question: row.question, asOf: row.asOf }))
  },
  portfolio: portfolio && portfolio.ok
    ? {
      size: portfolio.portfolioSize,
      families: portfolio.portfolio,
      fullAnswerReduces: portfolio.reducedToActive,
      activeOnlyAnswerReduces: reducedAnswer && reducedAnswer.ok ? reducedAnswer.reducedToActive : null
    }
    : null,
  unresolvedNames: unresolved,
  existenceProbe: {
    name: probe,
    state: existence.ok ? existence.state : existence.status,
    preservedAsUnresolvedRecord: preservedButUnresolved.has(probe),
    // Only meaningful for an absence. Defaulting it to true on a hit would
    // manufacture a completed search out of a lookup.
    searchComplete: existence.ok && existence.status === 'NOT_FOUND' ? existence.searchComplete : null,
    requiredSourcesNotSearched: existence.ok ? existence.requiredSourcesNotSearched || [] : []
  },
  precedence: {
    presentTenseAnswer: precedence.presentTenseAnswer,
    preservedDonations: precedence.preserved ? precedence.preserved.donated : [],
    resurrectionBoundary: precedence.resurrectionBoundary
  },
  truthBoundary: 'THIS_CHECKS_THAT_THE_REPOSITORY_OBEYS_ITS_OWN_LAWS__IT_IS_NOT_EVIDENCE_ABOUT_CUSTOMERS_OR_REVENUE',
  externalEffects: { messages: 0, providerCalls: 0, spendCents: 0, deployments: 0, writes: 0 },
  businessEffectAuthority: 'NONE'
};

const out = args.get('--out');
if (out && typeof out === 'string') {
  fs.writeFileSync(path.resolve(root, out), `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
