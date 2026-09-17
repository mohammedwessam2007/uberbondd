import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normativeSentences, compileDirective, directiveId, distinctiveTerms,
  linkTests, linkMutationGuards, contradictionCandidates, CANON_SOURCES
} from '../src/constitution-compiler.mjs';

const SHA = 'a'.repeat(40);

test('compiler: a prohibition is not miscounted as an obligation because it contains "must"', () => {
  // "must never" is the canon's most common phrasing and reads as both.
  const row = compileDirective({ source: 'AGENTS.md', text: 'Distribution breadth must never bypass law, consent or suppression.', sourceSha: SHA });
  assert.equal(row.class, 'PROHIBITION');
});

test('compiler: classes are assigned from the sentence, not from the file', () => {
  const prohibition = compileDirective({ source: 'AGENTS.md', text: 'Do not perform customer messages without explicit authority.', sourceSha: SHA });
  const obligation = compileDirective({ source: 'AGENTS.md', text: 'Every distribution motion must eventually bind opportunity and offer.', sourceSha: SHA });
  const permission = compileDirective({ source: 'AGENTS.md', text: 'A worker may select another legitimately configured provider for routing.', sourceSha: SHA });
  assert.equal(prohibition.class, 'PROHIBITION');
  assert.equal(obligation.class, 'OBLIGATION');
  assert.equal(permission.class, 'PERMISSION');
});

test('compiler: a sentence with no normative marker compiles to nothing', () => {
  assert.equal(compileDirective({ source: 'AGENTS.md', text: 'UberBond is a long-lived accumulated organism here.', sourceSha: SHA }), null);
});

test('compiler: a rule touching the outside world is tagged and demands external evidence', () => {
  const row = compileDirective({ source: 'AGENTS.md', text: 'Never send a customer message without explicit owner authorization.', sourceSha: SHA });
  assert.equal(row.authorityClass, 'EXTERNAL_EFFECT');
  assert.ok(row.authorityTerms.includes('send'));
  assert.deepEqual(row.evidenceRequirements, ['DURABLE_EXTERNAL_RECEIPT_OR_EXPLICIT_REFUSAL']);
});

test('compiler: an internal rule does not demand external evidence', () => {
  const row = compileDirective({ source: 'AGENTS.md', text: 'Never create a replacement application when a canonical module exists.', sourceSha: SHA });
  assert.equal(row.authorityClass, 'INTERNAL');
  assert.deepEqual(row.evidenceRequirements, ['REPOSITORY_TEST_OR_EXECUTABLE_CHECK']);
});

test('compiler: the id follows the text, so an edited directive becomes a new one', () => {
  const before = directiveId('AGENTS.md', 'Never spend without authority.');
  const after = directiveId('AGENTS.md', 'Never spend without written authority.');
  assert.notEqual(before, after);
  // And is stable for the same text, including whitespace differences.
  assert.equal(before, directiveId('AGENTS.md', '  Never   spend without authority.  '));
});

test('sentences: a fenced code block is not mined for directives', () => {
  const markdown = [
    'Real prose that must be compiled into a directive object here.',
    '',
    '```text',
    'SOVEREIGN SELF -> WILL KERNEL -> MUST NOT BE READ AS A RULE',
    '```'
  ].join('\n');
  const sentences = normativeSentences(markdown);
  assert.equal(sentences.length, 1);
  assert.ok(!sentences[0].includes('SOVEREIGN SELF'));
});

test('sentences: headings, tables and rules are skipped', () => {
  const markdown = '# A heading that must be skipped entirely\n| a table row that must be skipped |\n---\nProse that must survive the filter here.';
  const sentences = normativeSentences(markdown);
  assert.deepEqual(sentences, ['Prose that must survive the filter here.']);
});

test('sentences: a semicolon list becomes separate directives', () => {
  // The canon writes several independent rules into one line this way.
  const sentences = normativeSentences('A worker must record the receipt; a worker may never widen its own authority.');
  assert.equal(sentences.length, 2);
  assert.ok(sentences[1].startsWith('a worker may never'));
});

test('terms: stopwords are dropped so linkage is not driven by "the" and "must"', () => {
  const terms = distinctiveTerms('The worker must never bypass the suppression gate.');
  assert.ok(terms.includes('worker'));
  assert.ok(terms.includes('suppression'));
  assert.ok(!terms.includes('must'));
  assert.ok(!terms.includes('never'));
  assert.ok(!terms.includes('the'));
});

test('linkage: a directive with too few distinctive terms links to nothing', () => {
  // Otherwise a short vague rule matches every file in the repository.
  const index = new Map([['tests/a.test.mjs', new Set(['suppression', 'gate', 'worker'])]]);
  assert.deepEqual(linkTests(['suppression'], index), []);
});

test('linkage: a test is linked only when it shares enough of the subject', () => {
  const index = new Map([
    ['tests/close.test.mjs', new Set(['suppression', 'gate', 'worker', 'outbound'])],
    ['tests/far.test.mjs', new Set(['suppression'])]
  ]);
  const links = linkTests(['suppression', 'gate', 'worker', 'outbound'], index);
  assert.equal(links.length, 1);
  assert.equal(links[0].file, 'tests/close.test.mjs');
});

test('linkage: a mutation guard upgrades the status above a mere test mention', () => {
  const testIndex = new Map([['tests/a.test.mjs', new Set(['suppression', 'outbound', 'gate'])]]);
  const guardIndex = [{ id: 'SUP-01', guard: 'A suppressed recipient blocks outbound dispatch', guardTerms: new Set(['suppressed', 'recipient', 'blocks', 'outbound', 'dispatch']) }];

  const withoutGuard = compileDirective({ source: 'AGENTS.md', text: 'A worker must never bypass the suppression gate on outbound.', sourceSha: SHA, testIndex });
  assert.equal(withoutGuard.status, 'COMPILED_WITH_CANDIDATE_TESTS');

  const withGuard = compileDirective({ source: 'AGENTS.md', text: 'Outbound dispatch must never reach a suppressed recipient.', sourceSha: SHA, testIndex, guardIndex });
  assert.equal(withGuard.status, 'COMPILED_WITH_MUTATION_GUARD');
  assert.deepEqual(withGuard.mutationGuards, ['SUP-01']);
});

test('linkage: neither link is ever reported as proof of enforcement', () => {
  const testIndex = new Map([['tests/a.test.mjs', new Set(['suppression', 'outbound', 'gate'])]]);
  const row = compileDirective({ source: 'AGENTS.md', text: 'A worker must never bypass the suppression gate on outbound.', sourceSha: SHA, testIndex });
  assert.match(row.testLinkage.strength, /NOT_PROOF_OF_ENFORCEMENT/);
});

test('contradictions: a conditional pair is reported as a candidate and labelled as one', () => {
  const directives = [
    compileDirective({ source: 'AGENTS.md', text: 'Never call a provider model without explicit owner authorization.', sourceSha: SHA }),
    compileDirective({ source: 'CLAUDE.md', text: 'A configured provider model must be called when owner authorization exists.', sourceSha: SHA })
  ];
  const pairs = contradictionCandidates(directives, { minimumSharedTerms: 3 });
  assert.equal(pairs.length, 1);
  assert.match(pairs[0].note, /does not contradict/);
});

test('contradictions: unrelated rules are not paired', () => {
  const directives = [
    compileDirective({ source: 'AGENTS.md', text: 'Never leave the working tree dirty before a release commit.', sourceSha: SHA }),
    compileDirective({ source: 'CLAUDE.md', text: 'Every forecast must carry a calibration ledger entry.', sourceSha: SHA })
  ];
  assert.deepEqual(contradictionCandidates(directives), []);
});

test('sources: every declared canon source exists in the repository', async () => {
  const { existsSync } = await import('node:fs');
  for (const source of CANON_SOURCES) {
    assert.ok(existsSync(new URL(`../${source}`, import.meta.url)), `${source} is declared canon and must exist`);
  }
});
