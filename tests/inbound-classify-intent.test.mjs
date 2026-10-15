import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeInboundText, detectUnsubscribeIntent, classifyImapPollFailure, imapBackoffMs,
  credentialDigest, boundedPreview, classifyInboundEvent, leadingReplyText, IMAP_BACKOFF_CAP_MS
} from '../src/inbound-classify.mjs';

// Arabic fixtures are written with explicit escapes where a harakat or a tatweel must be exact.
const AR_DIACRITIC_ALEF = 'إِ' + 'لغاء الاشتراك';   // إِلغاء الاشتراك (kasra, hamza-alef)
const AR_STOP_SENDING = 'لا ترسلوا لي';                          // do not send to me

test('normalizeInboundText folds diacritics, tatweel and the common alef, yeh and ta-marbuta spellings', () => {
  assert.equal(normalizeInboundText(AR_DIACRITIC_ALEF), normalizeInboundText('الغاء الاشتراك'));
  assert.equal(normalizeInboundText('الـقائمة'), 'القايمه');
  assert.equal(normalizeInboundText('على'), 'علي');
  assert.equal(normalizeInboundText('Plain ASCII STAYS readable'), 'plain ascii stays readable');
});

test('English unsubscribe language in the leading body text is a high-confidence intent', () => {
  const result = detectUnsubscribeIntent({ body: 'Please unsubscribe me from this list.' });
  assert.deepEqual(result, { intent: true, source: 'body-phrase', language: 'en', confidence: 'high' });
});

test('a negation immediately before the phrase cancels it, so "do not unsubscribe" is not an opt-out', () => {
  assert.equal(detectUnsubscribeIntent({ body: 'Please do not unsubscribe me, I want the report.' }).intent, false);
});

test('Arabic opt-out phrases are recognised with diacritics and alef variants', () => {
  assert.equal(detectUnsubscribeIntent({ body: `${AR_DIACRITIC_ALEF} من فضلكم` }).language, 'ar');
  assert.equal(detectUnsubscribeIntent({ body: `${AR_STOP_SENDING}` }).intent, true);
  assert.equal(detectUnsubscribeIntent({ body: 'امسحوني من القائمة' }).source, 'body-phrase');
});

test('a List-Unsubscribe header alone is medium confidence; with an unsubscribe subject it is high', () => {
  assert.deepEqual(
    detectUnsubscribeIntent({ listUnsubscribe: '<mailto:list@example.invalid>', body: 'Ok.' }),
    { intent: true, source: 'list-unsubscribe-header', language: '', confidence: 'medium' }
  );
  assert.equal(detectUnsubscribeIntent({ listUnsubscribe: '<mailto:x@example.invalid>', subject: 'Unsubscribe', body: '' }).confidence, 'high');
});

test('an unsubscribe subject alone is medium confidence and an ordinary reply is no intent', () => {
  assert.deepEqual(detectUnsubscribeIntent({ subject: 'Unsubscribe', body: '' }), {
    intent: true, source: 'subject-phrase', language: 'en', confidence: 'medium'
  });
  assert.deepEqual(detectUnsubscribeIntent({ subject: 'Re: quick question', body: 'Sounds interesting, tell me more.' }), {
    intent: false, source: 'none', language: '', confidence: 'none'
  });
});

test('the body scan is bounded: a phrase beyond the scan window is not read', () => {
  const late = `${'x'.repeat(4100)} unsubscribe`;
  assert.equal(detectUnsubscribeIntent({ body: late }).intent, false);
});

test('classifyInboundEvent recognises Arabic unsubscribe language as a medium unsubscribe', () => {
  assert.deepEqual(classifyInboundEvent({ headers: { subject: 'رد' }, body: `من فضلكم ${AR_DIACRITIC_ALEF}` }), {
    category: 'unsubscribe', confidence: 'medium'
  });
});

test('IMAP poll failures are classed without echoing the failure text', () => {
  const sentinel = 'SERVER-TEXT-SENTINEL-7731';
  const auth = classifyImapPollFailure(new Error(`imap-command-rejected:UB0001 NO [AUTHENTICATIONFAILED] ${sentinel}`));
  assert.deepEqual(auth, { kind: 'auth', reasonCode: 'IMAP_AUTH_REJECTED' });
  assert.deepEqual(classifyImapPollFailure({ ok: false, status: 'UBERIMAP_CREDENTIAL_UNAVAILABLE' }), { kind: 'auth', reasonCode: 'IMAP_CREDENTIAL_UNAVAILABLE' });
  assert.deepEqual(classifyImapPollFailure(Object.assign(new Error('connect'), { code: 'ECONNRESET' })), { kind: 'transient', reasonCode: 'IMAP_TRANSIENT_NETWORK' });
  assert.deepEqual(classifyImapPollFailure(new Error('imap-connect-failed:4:ETIMEDOUT')), { kind: 'other', reasonCode: 'IMAP_OTHER' });
  assert.deepEqual(classifyImapPollFailure(new Error('imap-response-timeout')), { kind: 'transient', reasonCode: 'IMAP_RESPONSE_TIMEOUT' });
  // A SELECT refusal (UB0002) is not a credential refusal.
  assert.equal(classifyImapPollFailure(new Error('imap-command-rejected:UB0002 NO no such mailbox')).kind, 'other');
  assert.equal(JSON.stringify([auth]).includes(sentinel), false);
});

test('IMAP backoff doubles per consecutive failure and is capped', () => {
  assert.equal(imapBackoffMs(1), 60000);
  assert.equal(imapBackoffMs(2), 120000);
  assert.equal(imapBackoffMs(0), 60000);
  assert.equal(imapBackoffMs(99), IMAP_BACKOFF_CAP_MS);
});

test('credential digests are stable, differ when the encrypted blob is rewritten, and reveal no input', () => {
  const blob = { iv: 'aXY=', tag: 'dGFn', data: 'Y2lwaGVy' };
  assert.equal(credentialDigest(blob), credentialDigest({ ...blob }));
  assert.notEqual(credentialDigest(blob), credentialDigest({ ...blob, data: 'b3RoZXI=' }));
  assert.equal(credentialDigest(blob).includes('Y2lwaGVy'), false);
  assert.match(credentialDigest(null), /^[0-9a-f]{64}$/);
});

test('boundedPreview caps by code point, keeps line breaks, and drops control bytes', () => {
  assert.equal(boundedPreview('ab\u{1F600}cd', 3), 'ab\u{1F600}');
  assert.equal(boundedPreview('line one\nline\u0007two', 100), 'line one\nlinetwo');
  assert.equal(boundedPreview('x'.repeat(9000), 500).length, 500);
  assert.equal(boundedPreview(undefined, 10), '');
});

test('the reply\'s own words are read; a footer inside quoted text is not an opt-out', () => {
  const outlookQuote = [
    'Interested, please send the details.',
    '',
    '-----Original Message-----',
    'From: Sales <sales@uberbond.example.invalid>',
    'To: buyer@clinic.example.invalid',
    'Subject: Quick question',
    '',
    'To unsubscribe from these emails, click here.'
  ].join('\n');
  assert.equal(leadingReplyText(outlookQuote), 'Interested, please send the details.');
  assert.equal(detectUnsubscribeIntent({ body: outlookQuote }).intent, false);
  assert.equal(detectUnsubscribeIntent({ body: 'Please unsubscribe me.\n\n-----Original Message-----\nhello' }).intent, true);
  assert.equal(leadingReplyText('> quoted only\n> more'), '');
});
