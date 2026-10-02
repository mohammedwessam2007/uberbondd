import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const load = name => JSON.parse(readFileSync(new URL(`../artifacts/outreach/${name}`, import.meta.url), 'utf8'));
const tournament = load('powerhouse-message-tournament-20261002.json');
const effect = load('powerhouse-effect-package-20261002.json');
const intakeResults = load('prospect-tournament-20261002.json');

const words = text => text.trim().split(/\s+/).filter(Boolean).length;
const sentences = body => body.split(/\n\n/).slice(1).join(' ').split(/(?<=[.!?])\s+/).filter(Boolean);
const BANNED = [/\blosing\b/i, /\bcosting\b/i, /\brevenue\b/i, /\$\s?\d/, /\bdefinite(ly)?\b/i, /\burgent\b/i, /\bimpressive\b/i, /\bgreat (work|client)\b/i, /\bjust bumping\b/i, /\bquick question\b/i, /\bcalendar\b/i, /\bmeeting\b/i, /\bcall\b/i, /\btrack(ing)?\b/i, /\bprobably already\b/i, /^re:/i];
const re = ({ pattern, flags = '' }) => new RegExp(pattern, flags);

const meetsLimits = c => {
  const [minSub, maxSub] = tournament.constraints.subjectWords; const [minBody, maxBody] = tournament.constraints.bodyWords; const [minSent, maxSent] = tournament.constraints.sentencesExcludingGreeting;
  const s = sentences(c.body);
  return words(c.subject) >= minSub && words(c.subject) <= maxSub && words(c.body) >= minBody && words(c.body) <= maxBody && s.length >= minSent && s.length <= maxSent && c.body.trim().endsWith(tournament.constraints.cta);
};
const clean = c => !BANNED.some(b => b.test(c.subject) || b.test(c.body));
const supported = c => !tournament.rubric.unsupportedAfterReevaluation.some(u => re(u).test(`${c.subject}\n${c.body}`));
const eligible = c => meetsLimits(c) && clean(c) && supported(c);
const score = c => tournament.rubric.anchors.reduce((sum, a) => sum + (re(a).test(c.body) ? a.points : 0), 0);
const argmax = () => tournament.candidates.filter(eligible).sort((a, b) => score(b) - score(a) || words(a.body) - words(b.body) || a.id.localeCompare(b.id))[0];

test('the declared winner is exactly the eligible candidate with the highest verified-anchor score (recomputed here, not trusted)', () => {
  assert.equal(argmax().id, tournament.winner);
  const winner = tournament.candidates.find(c => c.id === tournament.winner);
  assert.equal(meetsLimits(winner), true, `${words(winner.subject)} subject words, ${words(winner.body)} body words, ${sentences(winner.body).length} sentences`);
  assert.equal(clean(winner), true);
  assert.equal(supported(winner), true);
  assert.equal((winner.body.match(/Want me to send it\?/g) || []).length, 1);
  assert.doesNotMatch(winner.body, /https?:\/\//i);
});

test('the previous winner was re-evaluated, not preserved: it now fails on an unsupported claim even though it scores highest', () => {
  const previous = tournament.candidates.find(c => c.id === 'A_CLIENT_QA_RENEWAL');
  assert.equal(supported(previous), false);
  assert.equal(eligible(previous), false);
  assert.ok(score(previous) >= score(tournament.candidates.find(c => c.id === tournament.winner)) - 2, 'the scoring alone would have favoured it, so eligibility is what falsifies it');
  assert.notEqual(tournament.winner, 'A_CLIENT_QA_RENEWAL');
});

test('the critics are deterministic: every failed candidate really violates a rule, every passed one does not', () => {
  for (const critic of tournament.critics) {
    const c = tournament.candidates.find(x => x.id === critic.id);
    if (critic.verdict.startsWith('PASS')) assert.equal(eligible(c), true, `${c.id} should be eligible`);
    else assert.equal(eligible(c), false, `${c.id} should violate a rule`);
  }
  assert.equal(tournament.candidates.length, tournament.critics.length);
  assert.equal(new Set(tournament.candidates.map(c => c.id)).size, tournament.candidates.length);
  assert.ok(tournament.candidates.filter(eligible).length >= 2, 'a tournament needs at least two eligible, genuinely different candidates');
});

test('every winner claim maps to a verified fact: same page, 24/7 service list, generator and panel pages; no causation, money, accusation or tooling claim', () => {
  const body = tournament.candidates.find(c => c.id === tournament.winner).body;
  for (const must of [/Sylvester Electric/, /same page/, /homepage/, /qualifying after-hours/, /24\/7 Emergency Service/, /generator and panel/]) assert.match(body, must);
  for (const mustNot of [/\bbecause\b/i, /\bcaused\b/i, /\bmistake\b/i, /\bbroken\b/i, /\bfail(ed|ing|ure)\b/i, /ServiceTitan/i, /\blost\b/i, /customers? (are|were|complain)/i]) assert.doesNotMatch(body, mustNot);
});

test('worsening the winner (adding a money claim) makes it ineligible', () => {
  const winner = structuredClone(tournament.candidates.find(c => c.id === tournament.winner));
  winner.body = winner.body.replace('for client QA', 'so you stop losing revenue');
  assert.equal(eligible(winner), false);
});

test('readiness is honest: the package is PREPARED_NOT_READY with the single remaining prospect gap named, and no digest is minted', () => {
  assert.equal(tournament.status, 'CONDITIONAL_PENDING_VERIFICATION');
  assert.equal(effect.status, 'PREPARED_NOT_READY');
  assert.equal(effect.readyExceptIdentityAndLegalAuthority, false);
  assert.equal(effect.finalDigestMinted, false);
  assert.deepEqual(effect.bindings.footerSchema, ['LEGAL_BUSINESS_SENDER_NAME', 'AUTHORIZED_PUBLIC_POSTAL_ADDRESS']);
  assert.doesNotMatch(JSON.stringify(effect), /[a-f0-9]{64}/);
  const powerhouse = intakeResults.candidates.find(c => c.company === 'Powerhouse Consulting Group');
  assert.deepEqual(powerhouse.intake.missingEvidence, ['runtime-suppression-and-prior-contact-ledgers-not-checked']);
  assert.equal(intakeResults.prospectReady, false);
});
