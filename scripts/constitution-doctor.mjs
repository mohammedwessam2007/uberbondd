#!/usr/bin/env node
// V3 A021. The Constitution Doctor.
//
// Compiles the canon into Directive Objects and reports what is uncompiled,
// untested, externally consequential, or contradictory-looking. The number
// that matters is the last one: constitutional rules governing external
// effects that no test in the repository even mentions.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CANON_SOURCES, TERMINAL_SOURCES, CONSTITUTION_COMPILER_VERSION,
  normativeSentences, compileDirective, contradictionCandidates, distinctiveTerms,
  precedenceOrder, resolveByPrecedence
} from '../src/constitution-compiler.mjs';
import { compareConstitutionArtifacts } from '../src/constitution-artifact-freshness.mjs';
import { MUTATIONS } from './mutation-war.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.CONSTITUTION_DOCTOR_OUT || 'artifacts/constitution/directives.json';
const REVIEW = 'artifacts/constitution/reviewed-linkage-findings.json';

// The unguarded count is a queue, not a defect count: a compound sentence, a
// keyword false positive and a real hole all land in it identically. Printing it
// alone invites reading it as damage. Printing it next to how many entries have
// been read keeps both facts visible, and the reviewed number can only move by
// someone writing down what they found.
function reviewState() {
  try {
    const record = JSON.parse(readFileSync(resolve(root, REVIEW), 'utf8'));
    const findings = Array.isArray(record.findings) ? record.findings : [];
    return {
      available: true,
      entries: findings.length,
      reviewed: findings.filter(row => row.reviewClass && row.reviewClass !== 'UNREVIEWED').length,
      unreviewed: findings.filter(row => row.reviewClass === 'UNREVIEWED').length,
      // Counted from the record rather than from CLOSED_BY_NEW_GUARD entries,
      // because one hole can close two entries: the CAPTCHA/evasion rule is
      // written twice in the canon and both copies point at the same code.
      holesFound: Number(record.queueState?.genuineHolesFound ?? 0)
    };
  } catch {
    return { available: false, reviewed: 0, unreviewed: 0, holesClosed: 0 };
  }
}

function testIndex() {
  const dir = resolve(root, 'tests');
  const index = new Map();
  if (!existsSync(dir)) return index;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.test.mjs')) continue;
    const body = readFileSync(join(dir, name), 'utf8');
    index.set(`tests/${name}`, new Set(distinctiveTerms(body)));
  }
  return index;
}

function guardIndex() {
  return MUTATIONS.map(row => ({
    id: row.id,
    guard: row.guard,
    guardTerms: new Set(distinctiveTerms(String(row.guard || '')))
  }));
}

function main() {
  const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const index = testIndex();
  const guards = guardIndex();

  const directives = [];
  const perSource = {};
  // Parsed from the file that authors it, not transcribed here, so the ranks
  // cannot drift from docs/NORTH_STAR_PRECEDENCE.md.
  const precedenceRanks = existsSync(resolve(root, 'docs/NORTH_STAR_PRECEDENCE.md'))
    ? precedenceOrder(readFileSync(resolve(root, 'docs/NORTH_STAR_PRECEDENCE.md'), 'utf8'))
    : new Map();
  CANON_SOURCES.forEach((source, precedence) => {
    const path = resolve(root, source);
    if (!existsSync(path)) { perSource[source] = { missing: true }; return; }
    const sentences = normativeSentences(readFileSync(path, 'utf8'));
    const compiled = sentences
      .map(text => compileDirective({ source, text, sourceSha, testIndex: index, guardIndex: guards, precedence, precedenceRanks }))
      .filter(Boolean);
    // A content-derived id makes a repeated sentence one directive, not two.
    const seen = new Set();
    const unique = compiled.filter(row => (seen.has(row.id) ? false : seen.add(row.id)));
    perSource[source] = { sentences: sentences.length, compiled: unique.length, uncompiled: sentences.length - compiled.length };
    directives.push(...unique);
  });

  const byClass = directives.reduce((acc, row) => { acc[row.class] = (acc[row.class] ?? 0) + 1; return acc; }, {});
  const external = directives.filter(row => row.authorityClass === 'EXTERNAL_EFFECT');
  const unmentioned = directives.filter(row => row.tests.length === 0);
  const externalUnmentioned = external.filter(row => row.tests.length === 0);
  const guarded = directives.filter(row => row.mutationGuards.length > 0);
  const prohibitions = directives.filter(row => row.class === 'PROHIBITION');
  const guardedProhibitions = prohibitions.filter(row => row.mutationGuards.length > 0);
  const externalGuarded = external.filter(row => row.mutationGuards.length > 0);
  const contradictions = contradictionCandidates(directives);

  const artifact = {
    schemaVersion: 'uberbond-constitution-directives-1.0.0',
    compilerVersion: CONSTITUTION_COMPILER_VERSION,
    directiveSections: ['A001', 'A021'],
    generatedAt: new Date().toISOString(),
    sourceSha,
    method: 'Normative sentences from the canon files in precedence order, classified as prohibition, obligation or permission, tagged by whether they govern an external effect, and linked to tests by distinctive-vocabulary overlap.',
    counts: {
      directives: directives.length,
      byClass,
      externalEffect: external.length,
      noTestMentionsIt: unmentioned.length,
      externalEffectAndNoTestMentionsIt: externalUnmentioned.length,
      withMutationGuard: guarded.length,
      prohibitions: prohibitions.length,
      prohibitionsWithMutationGuard: guardedProhibitions.length,
      externalEffectWithMutationGuard: externalGuarded.length,
      mutationAnchorsAvailable: MUTATIONS.length,
      contradictionCandidates: contradictions.length
    },
    reviewQueue: reviewState(),
    precedence: {
      ranksParsedFrom: 'docs/NORTH_STAR_PRECEDENCE.md',
      ranked: [...precedenceRanks].map(([file, rank]) => ({ file, rank })),
      operativeSourcesRanked: CANON_SOURCES.filter(source => precedenceRanks.has(source)),
      operativeSourcesUnranked: CANON_SOURCES.filter(source => !precedenceRanks.has(source)),
      boundary: 'A rank this tool did not read out of the precedence file is a rank the founder did not author. Unranked means unranked, not lowest.'
    },
    terminalSourcesNotCompiled: {
      files: TERMINAL_SOURCES,
      reason: 'Ranked highest by the precedence file and deliberately not compiled. NORTH_STAR.md states their status: direction and search-space canon, not implementation proof. A Directive Object asserts REPOSITORY_TEST_OR_EXECUTABLE_CHECK, which is the opposite claim.',
      normativeSentencesNotCompiled: TERMINAL_SOURCES
        .filter(file => file.endsWith('.md') && existsSync(resolve(root, file)))
        .reduce((total, file) => total + normativeSentences(readFileSync(resolve(root, file), 'utf8')).length, 0),
      notAnAmputation: 'These remain canon, are read at startup, and outrank every compiled directive on objective. What they are not is enforcement debt.'
    },
    conflictGraph: contradictions.map(candidate => ({
      ...candidate,
      ...resolveByPrecedence(candidate, new Map(directives.map(row => [row.id, row])), precedenceRanks)
    })),
    // Which canon file is least enforced, rather than one number across all of
    // them. A source whose external-effect rules are all unguarded is a
    // different problem from one with a few weak spots.
    coverageBySource: Object.fromEntries(CANON_SOURCES.map(source => {
      const rows = directives.filter(row => row.provenance === source);
      const ext = rows.filter(row => row.authorityClass === 'EXTERNAL_EFFECT');
      return [source, {
        directives: rows.length,
        withMutationGuard: rows.filter(row => row.mutationGuards?.length).length,
        externalEffect: ext.length,
        externalEffectWithMutationGuard: ext.filter(row => row.mutationGuards?.length).length
      }];
    })),
    perSource,
    linkageBoundary: 'A test link is vocabulary overlap. It shows a test discusses the same subject and says nothing about whether that test would fail if the rule were broken -- only a mutation that removes the rule can show that. The reliable direction is the negative: a directive no test mentions is very unlikely to be enforced.',
    contradictionBoundary: 'Candidates for reading, not findings. The canon repeatedly pairs a prohibition with a conditional obligation on the same subject, and that is not a contradiction.',
    businessEffectAuthority: 'NONE',
    externalEffects: [],
    externalEffectDirectivesWithNoTestMention: externalUnmentioned.map(row => ({ id: row.id, text: row.text, provenance: row.provenance, authorityTerms: row.authorityTerms })),
    contradictionCandidates: contradictions.slice(0, 40),
    directives
  };

  // Read what is about to be replaced, and say whether it was current. The
  // doctor regenerating a stale artifact silently is how a stale one gets
  // committed in the first place: the numbers come out right and nobody learns
  // that the file in git had been describing a different tree.
  let staleness = null;
  try {
    const existing = JSON.parse(readFileSync(resolve(root, OUT), 'utf8'));
    const comparison = compareConstitutionArtifacts(existing, artifact);
    if (!comparison.fresh) staleness = comparison.differences;
  } catch {
    // No previous artifact, or an unreadable one. Nothing to compare against.
  }

  mkdirSync(resolve(root, dirname(OUT)), { recursive: true });
  writeFileSync(resolve(root, OUT), `${JSON.stringify(artifact, null, 2)}\n`);

  console.log(`constitution @ ${sourceSha.slice(0, 8)}`);
  console.log(`  ${directives.length} directives from ${CANON_SOURCES.length} canon files`);
  console.log(`  ${Object.entries(byClass).map(([k, v]) => `${k.toLowerCase()} ${v}`).join(', ')}`);
  console.log(`  external-effect: ${external.length}, of which ${externalUnmentioned.length} are mentioned by no test`);
  console.log(`  backed by a mutation-killed guard: ${guarded.length} directives, ${guardedProhibitions.length} of ${prohibitions.length} prohibitions, ${externalGuarded.length} of ${external.length} external-effect`);
  const review = reviewState();
  const externalUnguarded = external.length - externalGuarded.length;
  // Two different denominators, deliberately printed apart: the matcher's count
  // moves whenever a guard is added, while the review record tracks entries that
  // were read. An entry stays read after its rule becomes guarded.
  console.log(`  unguarded external-effect by the matcher: ${externalUnguarded}`);
  console.log(review.available
    ? `  review record: ${review.entries} entries, ${review.unreviewed} unread, ${review.holesFound} real holes found and closed`
    : '  review record: missing');
  const resolvable = contradictions
    .map(candidate => resolveByPrecedence(candidate, new Map(directives.map(row => [row.id, row])), precedenceRanks))
    .filter(row => row.precedenceResolvable).length;
  const unranked = CANON_SOURCES.filter(source => !precedenceRanks.has(source)).length;
  console.log(`  contradiction candidates: ${contradictions.length}, of which precedence can settle ${resolvable}`);
  console.log(`  precedence: ${CANON_SOURCES.length - unranked} of ${CANON_SOURCES.length} operative sources ranked; ${TERMINAL_SOURCES.length} terminal sources ranked but deliberately not compiled`);
  if (staleness) {
    console.log(`  the artifact just replaced was stale, and had been describing a different tree:`);
    for (const row of staleness) {
      console.log(`    ${row.field}: committed ${JSON.stringify(row.committed)}, actual ${JSON.stringify(row.fresh)}`);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
export { main };
