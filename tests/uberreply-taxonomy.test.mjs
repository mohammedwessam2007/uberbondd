import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyReplyTaxonomy, normalizeReplyClassification } from '../src/uberreply-taxonomy.mjs';

test('explicit opt-out dominates every commercial signal', () => {
  const r = classifyReplyTaxonomy('Sounds interesting but please remove me and do not contact me again.');
  assert.equal(r.label, 'optout');
  assert.equal(r.suppress, true);
  assert.equal(r.sequence, 'STOP');
});

test('out-of-office and automatic replies snooze instead of creating fake interest', () => {
  assert.equal(classifyReplyTaxonomy('I am out of the office until Monday.').label, 'out_of_office');
  assert.equal(classifyReplyTaxonomy('Automatic reply: this mailbox is not monitored.').label, 'automatic');
  assert.equal(classifyReplyTaxonomy('I am out of the office until Monday.').sequence, 'SNOOZE');
});

test('referrals, objections and wrong-person replies remain distinct', () => {
  assert.equal(classifyReplyTaxonomy('Please speak to our marketing director instead.').label, 'referral');
  assert.equal(classifyReplyTaxonomy('Not right now, budget is tight.').label, 'objection');
  const wrong = classifyReplyTaxonomy('You have the wrong person, this is not my responsibility.');
  assert.equal(wrong.label, 'wrong_person');
  assert.equal(wrong.suppress, true);
});

test('negative and positive intent are not collapsed into opt-out', () => {
  assert.equal(classifyReplyTaxonomy('No thanks, not interested.').label, 'negative');
  assert.equal(classifyReplyTaxonomy('Interested. Send me pricing and next steps.').label, 'positive');
});

test('deterministic safety labels dominate a contradictory model response', () => {
  const r = normalizeReplyClassification({ label: 'positive', confidence: 0.99, reason: 'model guess' }, 'Automatic reply: I am out of the office.');
  assert.equal(r.label, 'out_of_office');
  assert.equal(r.ownerAction, 'NONE');
});
