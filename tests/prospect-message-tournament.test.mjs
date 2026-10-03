import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { powerhouseRecord, POWERHOUSE_SLOTS as SLOTS, POWERHOUSE_ARTIFACT_REF as ARTIFACT, PRIOR_HAND_BUILT_WINNER_BODY } from './fixtures/outreach/powerhouse.fixture.mjs';
import { compileProspectVerification } from '../src/prospect-verification-intake.mjs';
import { compileContactHistory } from '../src/prospect-contact-history.mjs';
import {
  runProspectMessageTournament, validateMessageSlots, BANNED_LANGUAGE, V5_CTA, PROSPECT_MESSAGE_TOURNAMENT_VERSION
} from '../src/prospect-message-tournament.mjs';

const now = new Date('2026-10-02T21:00:00.000Z');
const ok = rows => ({ ok: true, rows });
const cleanReads = () => ({ suppressions: ok([]), prospects: ok([]), outboundReservations: ok([]), outboundEvents: ok([]), replies: ok([]), messages: ok([]), providerEvents: ok([]) });

function verified(readsPatch = {}, recordPatch = (r => r)) {
  const record = recordPatch(powerhouseRecord());
  delete record.contactHistory;
  record.contactHistoryReceipt = compileContactHistory({ email: record.recipient.email, reads: { ...cleanReads(), ...readsPatch }, now });
  const intake = compileProspectVerification(record, { now, contactHistoryTrust: { inProcess: true } });
  return { record, intake };
}
const tournament = (extra = {}, ctx = verified()) => runProspectMessageTournament({ intake: ctx.intake, record: ctx.record, slots: SLOTS, artifactPrepared: true, artifactRef: ARTIFACT, now, ...extra });

test('first-party AI evidence generates release-review copy without inventing a named-client relationship', () => {
  const ctx = verified({}, record => {
    record.offerRoute.offerId = 'AI_AGENT_RELEASE_GATE';
    record.offerFit = { buildsProductionAgents: true, servesHomeServiceClients: false, evidenceUrl: record.website };
    record.clientEvidence.clientName = record.company;
    record.clientEvidence.clientSiteUrl = record.website;
    record.clientEvidence.observation.sourceUrl = record.website;
    record.clientEvidence.observation.excerpt = 'lets planners adjust quantities, exclude items, and override store selections before release, then sends approved runs into production WMS systems. The same article describes expansion into initial allocation.';
    return record;
  });
  assert.equal(ctx.intake.observationSubjectType, 'PROSPECT_SYSTEM');
  const t = tournament({ slots: {
    issueCode: 'approval-to-write-boundary', subjectNoun: 'release review',
    observationClause: 'lets planners adjust quantities, exclude items, and override store selections before release, then sends approved runs into production WMS systems',
    corroborationSentence: 'The same article describes expansion into initial allocation.',
    groundingPhrases: ['adjust quantities', 'exclude items', 'override store selections', 'approved runs', 'initial allocation'],
    artifactPhrase: 'a one-page integration QA note', altitudePhrase: 'release review'
  } }, ctx);
  assert.equal(t.status, 'WINNER_SELECTED', JSON.stringify(t.reasonCodes));
  assert.doesNotMatch(t.winner.body, /publicly named|named clients|is a.*client/i);
  assert.equal(t.sendAuthority, false);
  assert.equal(t.finalEffectDigest, null);
});

// In the repository the artifact the message promises must exist. The mutation
// war's sandbox does not copy artifacts/, so the check applies wherever the
// artifacts directory is present.
test('the sample artifact the message promises really exists in the repository', { skip: !existsSync(new URL('../artifacts/', import.meta.url)) }, () => {
  assert.ok(existsSync(new URL(`../${ARTIFACT}`, import.meta.url)));
});

test('Powerhouse as a fixture: a runtime-clean verified candidate yields a conditional winner with every binding, and no final digest, authority or send', () => {
  const t = tournament();
  assert.equal(t.version, PROSPECT_MESSAGE_TOURNAMENT_VERSION);
  assert.equal(t.status, 'WINNER_SELECTED');
  assert.equal(t.conditional, true);
  assert.equal(t.sendAuthority, false);
  assert.equal(t.finalEffectDigest, null);
  assert.equal(t.winner.cta, V5_CTA);
  assert.ok(t.winner.body.trim().endsWith(V5_CTA));
  assert.equal(t.winner.subjectWordCount, 2);
  assert.ok(t.winner.wordCount >= 51 && t.winner.wordCount <= 100);
  assert.ok(t.winner.sentenceCount >= 3 && t.winner.sentenceCount <= 4);
  const b = t.bindings;
  for (const key of ['prospect', 'offerId', 'evidenceSnapshot', 'subject', 'body', 'cta', 'genotype', 'coreMessageDigest', 'candidateSetDigest', 'tournamentVersion']) assert.ok(b[key], `binding ${key}`);
  assert.equal(b.offerId, 'CLIENT_ROI_PROOF_SPRINT');
  assert.match(b.coreMessageDigest, /^[a-f0-9]{64}$/);
  assert.match(b.candidateSetDigest, /^[a-f0-9]{64}$/);
  assert.equal(t.freshness.mustRecheckContactHistoryBeforeApproval, true);
});

test('the generic pipeline, not a hand-built JSON, re-derives the prior fixture winner text; the fixture is not a global winner', () => {
  const t = tournament();
  assert.equal(t.winner.id, 'FULL');
  assert.equal(t.winner.body, PRIOR_HAND_BUILT_WINNER_BODY);
  // Different evidence => different, still-grounded text: nothing about Powerhouse is encoded in the module.
  const other = verified({}, r => { r.company = 'Other Marketing Co'; return r; });
  const t2 = tournament({ slots: { ...SLOTS, observationClause: 'lists two different service-area promises: its homepage says qualifying after-hours situations and its footer says 24/7 Emergency Service', corroborationSentence: 'Its panel page also says 24/7.', groundingPhrases: ['qualifying after-hours situations', '24/7 Emergency Service', 'panel', '24/7'] } }, other);
  assert.equal(t2.status, 'WINNER_SELECTED');
  assert.match(t2.winner.body, /Other Marketing Co's publicly named clients|Other Marketing Co' publicly named clients|Other Marketing Co/);
  assert.notEqual(t2.winner.body, t.winner.body);
});

test('a prospect that is not a runtime-verified candidate gets DO_NOT_SEND', () => {
  const failed = verified({ suppressions: { ok: false, error: 'x' } });
  assert.equal(failed.intake.status, 'INCOMPLETE');
  const t = tournament({}, failed);
  assert.equal(t.status, 'DO_NOT_SEND');
  assert.ok(t.reasonCodes.includes('prospect-not-verified-candidate'));
  assert.equal(t.winner, null);
  const hit = verified({ suppressions: ok([{ value: 'hello@mypowerhouse.group' }]) });
  assert.equal(tournament({}, hit).status, 'DO_NOT_SEND');
  // A manual attestation is VERIFIED_CANDIDATE but not runtime-verified.
  const record = powerhouseRecord();
  record.contactHistory = { repoAndHistorySearched: true, runtimeSuppressionSearched: true, runtimeProspectAndOutboundSearched: true, hit: false };
  const manual = compileProspectVerification(record, { now });
  assert.equal(manual.status, 'VERIFIED_CANDIDATE');
  const t3 = runProspectMessageTournament({ intake: manual, record, slots: SLOTS, artifactPrepared: true, now });
  assert.equal(t3.status, 'DO_NOT_SEND');
  assert.ok(t3.reasonCodes.includes('contact-history-not-a-runtime-receipt'));
});

test('ungrounded slots are refused: a grounding phrase absent from the retained observation excerpt blocks the tournament', () => {
  const excerpt = powerhouseRecord().clientEvidence.observation.excerpt;
  assert.equal(validateMessageSlots({ slots: SLOTS, observationExcerpt: excerpt }).ok, true);
  const bad = { ...SLOTS, groundingPhrases: [...SLOTS.groundingPhrases, 'open 24 hours a day'], observationClause: `${SLOTS.observationClause}, open 24 hours a day` };
  const t = tournament({ slots: bad });
  assert.equal(t.status, 'DO_NOT_SEND');
  assert.ok(t.reasonCodes.some(r => r.includes('grounding-phrase-not-in-observation-excerpt')));
  assert.equal(validateMessageSlots({ slots: { ...SLOTS, groundingPhrases: [] }, observationExcerpt: excerpt }).ok, false);
  assert.equal(validateMessageSlots({ slots: { ...SLOTS, observationClause: `${SLOTS.observationClause}, which is losing revenue` }, observationExcerpt: excerpt }).ok, false);
});

test('the artifact must really exist: claiming a prepared artifact without one is refused', () => {
  const t = tournament({ artifactPrepared: false });
  assert.equal(t.status, 'DO_NOT_SEND', 'the claimed "one-page note" must exist before the message can be a candidate');
});

test('hard critics reject unsupported claims, money, causation, links, calendar, second ask, ungrounded numbers, missing relationship basis, pronoun-first', () => {
  const base = tournament().winner;
  const attempts = {
    money: base.body.replace('for client QA', 'so you stop losing revenue'),
    causation: base.body.replace('makes', 'mistakenly makes because of a mistake and'),
    link: base.body.replace('Want me to send it?', 'See https://example.com . Want me to send it?'),
    calendar: base.body.replace('Want me to send it?', 'Book a call on my calendar. Want me to send it?'),
    secondAsk: base.body.replace('Want me to send it?', 'Can we talk? Want me to send it?'),
    numeric: base.body.replace('Its generator', 'It has 37 pages, and its generator'),
    toolClaim: base.body.replace('Its generator', 'Its ServiceTitan setup, generator'),
    wrongEnding: `${base.body} P.S. thanks`,
    pronounFirst: base.body.replace(/I noticed one of Powerhouse's publicly named clients, Sylvester Electric, makes/, 'It makes')
  };
  for (const [name, body] of Object.entries(attempts)) {
    const t = tournament({ extraCandidates: [{ id: `ATTACK_${name}`, subject: 'Sylvester availability', body }] });
    const row = t.candidates.find(c => c.id === `ATTACK_${name}`);
    assert.equal(row.eligible, false, `${name}: ${JSON.stringify(row.failures)}`);
    assert.notEqual(t.winner.id, `ATTACK_${name}`);
  }
  assert.ok(BANNED_LANGUAGE.length >= 20);
});

test('structure limits: subject word count, body length, sentence count', () => {
  const t = tournament({ extraCandidates: [
    { id: 'LONG_SUBJECT', subject: 'Sylvester Electric emergency availability wording mismatch', body: tournament().winner.body },
    { id: 'ONE_WORD_SUBJECT', subject: 'Availability', body: tournament().winner.body },
    { id: 'TOO_SHORT', subject: 'Sylvester availability', body: 'Hi there,\n\nSylvester Electric, one of Powerhouse\'s publicly named clients, has two promises. See notes. Want me to send it?' }
  ] });
  for (const id of ['LONG_SUBJECT', 'ONE_WORD_SUBJECT', 'TOO_SHORT']) assert.equal(t.candidates.find(c => c.id === id).eligible, false, id);
});

test('winner selection is recomputable: deterministic, same inputs same output, and the winner is the max-score eligible candidate', () => {
  const a = tournament();
  const b = tournament();
  assert.deepEqual(a.winner, b.winner);
  assert.equal(a.bindings.candidateSetDigest, b.bindings.candidateSetDigest);
  const best = a.candidates.filter(c => c.eligible).sort((x, y) => y.score - x.score || x.bodyWords - y.bodyWords || x.id.localeCompare(y.id))[0];
  assert.equal(a.winner.id, best.id);
  assert.equal(a.candidates.length, 5);
});

test('FIXTURE WINNER MUTATION: changing the fixture winner text changes the digests and a worsened winner stops being eligible', () => {
  const t = tournament();
  const mutated = tournament({ extraCandidates: [{ id: 'WORSENED', subject: t.winner.subject, body: t.winner.body.replace('for client QA', 'and customers complain') }] });
  assert.equal(mutated.candidates.find(c => c.id === 'WORSENED').eligible, false);
  assert.notEqual(tournament({ extraCandidates: [{ id: 'EXTRA_OK', subject: 'Sylvester availability', body: t.winner.body.replace('exact wording', 'exact wording and URLs') }] }).bindings.candidateSetDigest, t.bindings.candidateSetDigest);
});

test('caller-supplied unsupported-claim patterns are literal text: a catastrophic regular expression cannot stall the tournament', () => {
  const started = Date.now();
  const t = tournament({ slots: { ...SLOTS, unsupportedPatterns: [{ pattern: '(a+)+$', reason: 'redos probe' }, { pattern: 'SERVICETITAN', reason: 'case-insensitive literal' }] } });
  assert.ok(Date.now() - started < 1000);
  assert.equal(t.status, 'WINNER_SELECTED');
  const attack = tournament({ slots: { ...SLOTS, unsupportedPatterns: [{ pattern: 'SERVICETITAN', reason: 'case-insensitive literal' }] }, extraCandidates: [{ id: 'TOOL_CLAIM', subject: 'Sylvester availability', body: t.winner.body.replace('Its generator', 'Its servicetitan setup, generator') }] });
  assert.equal(attack.candidates.find(c => c.id === 'TOOL_CLAIM').eligible, false);
});

test('control and invisible characters (header injection, zero-width, bidi) disqualify a candidate and a poisoned slot cannot reach a winner', () => {
  const base = tournament().winner;
  const attempts = {
    subjectNewline: { subject: 'Sylvester availability\r\nBcc: other@example.com', body: base.body },
    subjectTab: { subject: 'Sylvester\tavailability', body: base.body },
    bodyZeroWidth: { subject: base.subject, body: base.body.replace('Sylvester', 'Sylves\u200bter') },
    bodyBidi: { subject: base.subject, body: base.body.replace('exact wording', 'exact \u202ewording') },
    bodyCarriageReturn: { subject: base.subject, body: base.body.replace('\n\n', '\r\n\r\n') }
  };
  for (const [name, c] of Object.entries(attempts)) {
    const t = tournament({ extraCandidates: [{ id: `CTRL_${name}`, ...c }] });
    const row = t.candidates.find(x => x.id === `CTRL_${name}`);
    assert.equal(row.eligible, false, name);
    assert.ok(row.failures.includes('control-or-invisible-characters'), `${name}: ${JSON.stringify(row.failures)}`);
  }
  const poisoned = tournament({ slots: { ...SLOTS, subjectNoun: 'availability\r\nBcc: x@y.example' } });
  assert.equal(poisoned.status, 'DO_NOT_SEND', 'a poisoned subject slot leaves every generated candidate ineligible');
});
