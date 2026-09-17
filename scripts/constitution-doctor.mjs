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
  CANON_SOURCES, CONSTITUTION_COMPILER_VERSION,
  normativeSentences, compileDirective, contradictionCandidates, distinctiveTerms
} from '../src/constitution-compiler.mjs';
import { MUTATIONS } from './mutation-war.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.CONSTITUTION_DOCTOR_OUT || 'artifacts/constitution/directives.json';

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
  CANON_SOURCES.forEach((source, precedence) => {
    const path = resolve(root, source);
    if (!existsSync(path)) { perSource[source] = { missing: true }; return; }
    const sentences = normativeSentences(readFileSync(path, 'utf8'));
    const compiled = sentences
      .map(text => compileDirective({ source, text, sourceSha, testIndex: index, guardIndex: guards, precedence }))
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
    perSource,
    linkageBoundary: 'A test link is vocabulary overlap. It shows a test discusses the same subject and says nothing about whether that test would fail if the rule were broken -- only a mutation that removes the rule can show that. The reliable direction is the negative: a directive no test mentions is very unlikely to be enforced.',
    contradictionBoundary: 'Candidates for reading, not findings. The canon repeatedly pairs a prohibition with a conditional obligation on the same subject, and that is not a contradiction.',
    businessEffectAuthority: 'NONE',
    externalEffects: [],
    externalEffectDirectivesWithNoTestMention: externalUnmentioned.map(row => ({ id: row.id, text: row.text, provenance: row.provenance, authorityTerms: row.authorityTerms })),
    contradictionCandidates: contradictions.slice(0, 40),
    directives
  };

  mkdirSync(resolve(root, dirname(OUT)), { recursive: true });
  writeFileSync(resolve(root, OUT), `${JSON.stringify(artifact, null, 2)}\n`);

  console.log(`constitution @ ${sourceSha.slice(0, 8)}`);
  console.log(`  ${directives.length} directives from ${CANON_SOURCES.length} canon files`);
  console.log(`  ${Object.entries(byClass).map(([k, v]) => `${k.toLowerCase()} ${v}`).join(', ')}`);
  console.log(`  external-effect: ${external.length}, of which ${externalUnmentioned.length} are mentioned by no test`);
  console.log(`  backed by a mutation-killed guard: ${guarded.length} directives, ${guardedProhibitions.length} of ${prohibitions.length} prohibitions, ${externalGuarded.length} of ${external.length} external-effect`);
  console.log(`  contradiction candidates: ${contradictions.length}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
export { main };
