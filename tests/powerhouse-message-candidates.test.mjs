import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const tournament = JSON.parse(readFileSync(new URL('../artifacts/outreach/powerhouse-message-tournament-20261002.json', import.meta.url), 'utf8'));
const effect = JSON.parse(readFileSync(new URL('../artifacts/outreach/powerhouse-effect-package-20261002.json', import.meta.url), 'utf8'));
const words = text => text.trim().split(/\s+/).filter(Boolean).length;
const sentences = body => body.split(/\n\n/).slice(1).join(' ').split(/(?<=[.!?])\s+/).filter(Boolean);
const BANNED = [/\blosing\b/i, /\bcosting\b/i, /\brevenue\b/i, /\$\s?\d/, /\bdefinite(ly)?\b/i, /\burgent\b/i, /\bimpressive\b/i, /\bgreat (work|client)\b/i, /\bjust bumping\b/i, /\bquick question\b/i, /\bcalendar\b/i, /\bmeeting\b/i, /\bcall\b/i, /\btrack(ing)?\b/i, /\bprobably already\b/i, /^re:/i];
const meetsLimits = c => {
  const [minSub, maxSub] = tournament.constraints.subjectWords; const [minBody, maxBody] = tournament.constraints.bodyWords; const [minSent, maxSent] = tournament.constraints.sentencesExcludingGreeting;
  const s = sentences(c.body);
  return words(c.subject) >= minSub && words(c.subject) <= maxSub && words(c.body) >= minBody && words(c.body) <= maxBody && s.length >= minSent && s.length <= maxSent && c.body.trim().endsWith(tournament.constraints.cta);
};
const clean = c => !BANNED.some(re => re.test(c.subject) || re.test(c.body));

test('the declared winner meets every hard limit and contains no banned or unsupported language', () => {
  const winner = tournament.candidates.find(c => c.id === tournament.winner);
  assert.ok(winner);
  assert.equal(meetsLimits(winner), true, `${words(winner.subject)} subject words, ${words(winner.body)} body words, ${sentences(winner.body).length} sentences`);
  assert.equal(clean(winner), true);
  assert.equal((winner.body.match(/Want me to send it\?/g) || []).length, 1);
  assert.doesNotMatch(winner.body, /https?:\/\//i);
});

test('the critics are deterministic: every candidate they fail really violates a rule, and every one they pass does not', () => {
  for (const critic of tournament.critics) {
    const c = tournament.candidates.find(x => x.id === critic.id);
    const ok = meetsLimits(c) && clean(c);
    if (critic.verdict.startsWith('PASS')) assert.equal(ok, true, `${c.id} should be clean`);
    else assert.equal(ok, false, `${c.id} should violate a rule`);
  }
  assert.equal(tournament.candidates.length, tournament.critics.length);
  assert.equal(new Set(tournament.candidates.map(c => c.id)).size, tournament.candidates.length);
});

test('claims stay inside the verified facts: no causation, no money, no accusation, no unsupported tooling claim in the winner', () => {
  const body = tournament.candidates.find(c => c.id === tournament.winner).body;
  for (const re of [/\bbecause\b/i, /\bcaused\b/i, /\bmistake\b/i, /\bbroken\b/i, /\bfail(ed|ing|ure)\b/i, /ServiceTitan/i, /\blost\b/i]) assert.doesNotMatch(body, re);
  assert.match(body, /Sylvester Electric/);
});

test('the package is honestly NOT ready: no digest minted, identity stays a placeholder, blockers named', () => {
  assert.equal(tournament.status, 'CONDITIONAL_PENDING_VERIFICATION');
  assert.equal(effect.status, 'PREPARED_NOT_READY');
  assert.equal(effect.readyExceptIdentityAndLegalAuthority, false);
  assert.equal(effect.finalDigestMinted, false);
  assert.deepEqual(effect.bindings.footerSchema, ['LEGAL_BUSINESS_SENDER_NAME', 'AUTHORIZED_PUBLIC_POSTAL_ADDRESS']);
  assert.match(effect.bindings.recipientPublicationSource.url, /^PENDING_/);
  assert.ok(effect.blockedBy.length >= 3);
  const text = JSON.stringify(effect);
  assert.doesNotMatch(text, /[a-f0-9]{64}/);
});
