import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MUTATIONS } from '../scripts/mutation-war.mjs';
import { FRONTIER_OPEN_MODEL_MUTATIONS } from '../scripts/night-verification-frontier-open-model-mutations.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function occurrenceCount(source, needle) {
  if (typeof needle !== 'string' || needle.length === 0) return 0;
  return source.split(needle).length - 1;
}

function importSpecifier(fromFile, targetFile) {
  let specifier = relative(dirname(fromFile), targetFile).split(sep).join('/');
  if (!specifier.startsWith('.')) specifier = `./${specifier}`;
  return specifier;
}

function suiteDirectlyBindsTarget(suite, targetFile) {
  const suiteSource = readFileSync(join(repoRoot, suite), 'utf8');
  const specifier = importSpecifier(suite, targetFile);
  return suiteSource.includes(`'${specifier}'`) || suiteSource.includes(`"${specifier}"`);
}

test('every registered mutation anchor identifies exactly one live source site', () => {
  const invalid = [];
  const ids = new Set();

  for (const mutation of [...MUTATIONS, ...FRONTIER_OPEN_MODEL_MUTATIONS]) {
    if (ids.has(mutation.id)) {
      invalid.push({ id: mutation.id, reason: 'duplicate-mutation-id' });
      continue;
    }
    ids.add(mutation.id);

    let source;
    try {
      source = readFileSync(join(repoRoot, mutation.file), 'utf8');
    } catch (error) {
      invalid.push({ id: mutation.id, file: mutation.file, reason: 'target-file-unreadable', detail: error?.code || error?.message });
      continue;
    }

    const occurrences = occurrenceCount(source, mutation.find);
    if (occurrences !== 1) {
      invalid.push({ id: mutation.id, file: mutation.file, reason: occurrences === 0 ? 'anchor-not-found' : 'anchor-ambiguous', occurrences });
    }
  }

  assert.deepEqual(invalid, [], `Mutation registry contains invalid live anchors:\n${JSON.stringify(invalid, null, 2)}`);
});

test('convergence, Postal, Frontier and Open-Model mutations name at least one suite directly bound to the mutated module', () => {
  const canonicalAudited = MUTATIONS.filter(mutation => mutation.id.startsWith('CONV-') || mutation.id.startsWith('POSTAL-'));
  const audited = [...canonicalAudited, ...FRONTIER_OPEN_MODEL_MUTATIONS];
  const invalid = [];

  for (const mutation of audited) {
    const readableSuites = [];
    const boundSuites = [];

    for (const suite of mutation.suites || []) {
      try {
        readFileSync(join(repoRoot, suite), 'utf8');
        readableSuites.push(suite);
        if (suiteDirectlyBindsTarget(suite, mutation.file)) boundSuites.push(suite);
      } catch (error) {
        invalid.push({ id: mutation.id, file: mutation.file, suite, reason: 'declared-suite-unreadable', detail: error?.code || error?.message });
      }
    }

    if (readableSuites.length === 0) {
      invalid.push({ id: mutation.id, file: mutation.file, reason: 'no-readable-declared-suite', suites: mutation.suites || [] });
    } else if (boundSuites.length === 0) {
      invalid.push({ id: mutation.id, file: mutation.file, reason: 'no-declared-suite-directly-binds-mutated-module', suites: mutation.suites });
    }
  }

  assert.ok(canonicalAudited.length >= 10, 'expected convergence/Postal mutation inventory to be present');
  assert.equal(FRONTIER_OPEN_MODEL_MUTATIONS.length, 9, 'expected Frontier/Open-Model verification mutation inventory');
  assert.deepEqual(invalid, [], `Mutation registry contains suite-to-mutant binding gaps:\n${JSON.stringify(invalid, null, 2)}`);
});
