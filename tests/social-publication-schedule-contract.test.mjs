import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileDueSocialPublicationCommand,
  compileSocialPublicationSchedule
} from '../src/social-publication-schedule-contract.mjs';

const base = {
  scheduleKey: 'social:weekly-proof:2026-08-29T09:00Z',
  contentRef: 'content:proof-17',
  audienceRef: 'audience:public-linkedin-page',
  publicationPolicyRef: 'policy:public-distribution-4',
  platformPolicyRef: 'policy:linkedin-2026-08-28',
  scheduledFor: '2026-08-29T09:00:00.000Z',
  createdAt: '2026-08-28T16:00:00.000Z'
};

function due(schedule, extra = {}) {
  return compileDueSocialPublicationCommand({
    schedule,
    dueOccurrenceKey: 'social-occurrence:2026-08-29T09:00Z',
    now: '2026-08-29T09:00:00.000Z',
    authorityReceiptRef: 'authority:public-distribution:17',
    idempotencyKey: 'social-publish:17:2026-08-29',
    communicationPolicyRef: 'comm-policy:public-distribution-3',
    currentPlatformPolicyRef: 'platform-policy:linkedin-current-19',
    ...extra
  });
}

test('schedule compilation is local, deterministic and zero-effect', () => {
  const a = compileSocialPublicationSchedule(base);
  const b = compileSocialPublicationSchedule(structuredClone(base));
  assert.equal(a.ok, true);
  assert.equal(a.status, 'LOCAL_PUBLICATION_SCHEDULE_PREPARED');
  assert.equal(a.schedule.scheduleId, b.schedule.scheduleId);
  assert.equal(a.businessEffectAuthority, 'NONE');
  assert.equal(a.externalEffectLedger.providerCalls, 0);
  assert.equal(a.externalEffectLedger.messages, 0);
});

test('schedule stores references only and rejects raw content, handles and secrets', () => {
  for (const patch of [
    { caption: 'raw post content' },
    { handle: '@customer' },
    { apiKey: 'secret-value' },
    { rawContent: 'payload' }
  ]) {
    const result = compileSocialPublicationSchedule({ ...base, ...patch });
    assert.equal(result.ok, false);
    assert.ok(result.reasonCodes.includes('raw-social-content-recipient-or-secret-prohibited'));
  }
});

test('schedule requires bounded identity, policy and timing references', () => {
  const result = compileSocialPublicationSchedule({ ...base, scheduleKey: 'x'.repeat(301), publicationPolicyRef: '' });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('schedule-key-required-or-too-long'));
  assert.ok(result.reasonCodes.includes('publication-policy-ref-required'));
});

test('schedule materially before plan creation fails closed', () => {
  const result = compileSocialPublicationSchedule({ ...base, scheduledFor: '2026-08-27T09:00:00.000Z' });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('scheduled-publication-materially-before-plan-creation'));
});

test('due compilation refuses early execution before the scheduled occurrence', () => {
  const schedule = compileSocialPublicationSchedule(base).schedule;
  const result = due(schedule, { now: '2026-08-29T08:40:00.000Z' });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('publication-occurrence-not-due'));
});

test('due compilation requires fresh execution-time authority, idempotency and policies', () => {
  const schedule = compileSocialPublicationSchedule(base).schedule;
  const result = due(schedule, {
    authorityReceiptRef: '', idempotencyKey: '', communicationPolicyRef: '', currentPlatformPolicyRef: ''
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('fresh-authority-receipt-ref-required-at-execution'));
  assert.ok(result.reasonCodes.includes('idempotency-key-required-at-execution'));
  assert.ok(result.reasonCodes.includes('current-communication-policy-ref-required-at-execution'));
  assert.ok(result.reasonCodes.includes('current-platform-policy-ref-required-at-execution'));
});

test('due occurrence composes the canonical SOCIAL_PUBLIC command without granting authority', () => {
  const schedule = compileSocialPublicationSchedule(base).schedule;
  const result = due(schedule);
  assert.equal(result.ok, true);
  assert.equal(result.communicationCommand.channel, 'SOCIAL_PUBLIC');
  assert.equal(result.communicationCommand.purpose, 'PUBLIC_DISTRIBUTION');
  assert.equal(result.communicationCommand.contentRef, schedule.contentRef);
  assert.equal(result.communicationCommand.audienceRef, schedule.audienceRef);
  assert.equal(result.publicationTruthAuthority, 'NONE_UNTIL_PROVIDER_RECEIPT_IS_NORMALIZED_BY_OMNICHANNEL_CONTRACT');
  assert.equal(result.businessEffectAuthority, 'NONE');
  assert.equal(result.externalEffectLedger.providerCalls, 0);
});

test('caller cannot swap scheduled content or audience at execution time', () => {
  const schedule = compileSocialPublicationSchedule(base).schedule;
  const result = compileDueSocialPublicationCommand({
    schedule,
    dueOccurrenceKey: 'social-occurrence:2026-08-29T09:00Z',
    now: '2026-08-29T09:00:00.000Z',
    authorityReceiptRef: 'authority:17',
    idempotencyKey: 'idem:17',
    communicationPolicyRef: 'comm:17',
    currentPlatformPolicyRef: 'platform:17',
    contentRef: 'attacker-content',
    audienceRef: 'attacker-audience'
  });
  assert.equal(result.ok, true);
  assert.equal(result.communicationCommand.contentRef, schedule.contentRef);
  assert.equal(result.communicationCommand.audienceRef, schedule.audienceRef);
});

test('overlong due occurrence identity fails closed', () => {
  const schedule = compileSocialPublicationSchedule(base).schedule;
  const result = due(schedule, { dueOccurrenceKey: 'x'.repeat(301) });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('due-occurrence-key-required-or-too-long'));
});

test('planned platform policy is never reused as execution-time policy automatically', () => {
  const schedule = compileSocialPublicationSchedule(base).schedule;
  const result = due(schedule, { currentPlatformPolicyRef: '' });
  assert.equal(result.ok, false);
  assert.notEqual(schedule.plannedPlatformPolicyRef, undefined);
  assert.ok(result.reasonCodes.includes('current-platform-policy-ref-required-at-execution'));
});
