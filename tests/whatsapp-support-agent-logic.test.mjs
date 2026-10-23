import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeInbound, dedupeMessage, detectLanguage, extractReferences, classifyIntent,
  mapRazorpayPayment, paymentReply, refundRow, escalationSlackText, buildFaqMessages,
  parseAiAnswer, appendHistory, maskPhone
} from '../artifacts/wealth-frontier-omega-20261023-claude/whatsapp-support-agent/logic.mjs';

const inbound = (messages, statuses) => ({
  object: 'whatsapp_business_account',
  entry: [{ id: 'WABA', changes: [{ field: 'messages', value: {
    messaging_product: 'whatsapp',
    metadata: { display_phone_number: '919800000000', phone_number_id: 'PNID' },
    contacts: [{ wa_id: '919811112222', profile: { name: 'Asha' } }],
    ...(messages ? { messages } : {}),
    ...(statuses ? { statuses } : {})
  } }] }]
});

test('normalizes text, button and interactive messages and ignores delivery statuses', () => {
  const rows = normalizeInbound(inbound([
    { from: '919811112222', id: 'wamid.1', timestamp: '1792700000', type: 'text', text: { body: '  hello ' } },
    { from: '919811112222', id: 'wamid.2', timestamp: '1792700001', type: 'interactive', interactive: { button_reply: { title: 'Refund' } } }
  ]));
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { waId: '919811112222', name: 'Asha', messageId: 'wamid.1', timestamp: 1792700000, type: 'text', text: 'hello', phoneNumberId: 'PNID' });
  assert.equal(rows[1].text, 'Refund');
  assert.equal(normalizeInbound(inbound(null, [{ id: 'wamid.1', status: 'delivered' }])).length, 0);
  assert.deepEqual(normalizeInbound({}), []);
});

test('a retried webhook with the same message id is a duplicate; old ids expire', () => {
  let state = dedupeMessage({}, 'wamid.1', 1_000);
  assert.equal(state.duplicate, false);
  state = dedupeMessage(state.seen, 'wamid.1', 2_000);
  assert.equal(state.duplicate, true);
  const later = dedupeMessage(state.seen, 'wamid.1', 1_000 + 49 * 3600 * 1000);
  assert.equal(later.duplicate, false, 'expired ids are forgotten');
  const capped = dedupeMessage({ a: 1, b: 2, c: 3 }, 'd', 4, undefined, 3);
  assert.deepEqual(Object.keys(capped.seen).sort(), ['b', 'c', 'd']);
});

test('detects Hindi, Hinglish and English', () => {
  assert.equal(detectLanguage('मेरा पेमेंट कट गया लेकिन एक्सेस नहीं मिला'), 'hi');
  assert.equal(detectLanguage('mera payment ho gaya par access nahi mila'), 'hinglish');
  assert.equal(detectLanguage('How do I log in?'), 'en');
  assert.equal(detectLanguage(''), 'en');
});

test('extracts Razorpay payment and order ids without false positives', () => {
  const refs = extractReferences('paid via pay_ABCDEFGH123456 and order_ZYXWVUTS987654, mail a@b.co; not pay_short');
  assert.deepEqual(refs.paymentIds, ['pay_ABCDEFGH123456']);
  assert.deepEqual(refs.orderIds, ['order_ZYXWVUTS987654']);
  assert.deepEqual(refs.emails, ['a@b.co']);
  assert.deepEqual(refs.malformedIds, ['pay_short']);
});

test('routing: disputes escalate before refunds, refunds before payment lookup', () => {
  const route = text => classifyIntent(text, extractReferences(text)).route;
  assert.equal(route('This is a scam, I want a refund'), 'escalate');
  assert.equal(route('I want to talk to a human'), 'escalate');
  assert.equal(route('please refund pay_ABCDEFGH123456'), 'refund');
  assert.equal(route('paisa wapas chahiye'), 'refund');
  assert.equal(route('रिफंड चाहिए'), 'refund');
  assert.equal(route('status of pay_ABCDEFGH123456?'), 'payment_status');
  assert.equal(route('I paid but did not get access'), 'payment_status');
  assert.equal(route('What does the course include?'), 'faq');
  // Regression from the n8n end-to-end run: "access" alone is an FAQ question.
  assert.equal(route('When do I get access to the course?'), 'faq');
  assert.equal(route('status pay_SHORT1'), 'payment_status', 'a malformed id is still a payment question');
});

test('Razorpay mapping exposes only customer-safe fields', () => {
  const summary = mapRazorpayPayment({ id: 'pay_ABCDEFGH123456', amount: 49900, currency: 'INR', status: 'captured', method: 'upi', email: 'x@y.z', contact: '+919800000000', card_id: 'card_1', created_at: 1792700000 });
  assert.deepEqual(Object.keys(summary).sort(), ['amountInr', 'createdAt', 'currency', 'found', 'id', 'method', 'status']);
  assert.equal(summary.amountInr, 499);
  assert.equal(mapRazorpayPayment({ id: 'p', status: 'captured', refund_status: 'full', amount: 100 }).status, 'refunded');
  assert.equal(mapRazorpayPayment({ error: { code: 'BAD_REQUEST_ERROR' } }).found, false);
});

test('payment replies cover missing id, not found and each status in both languages', () => {
  assert.match(paymentReply(null, 'en', true), /starts with pay_/);
  assert.match(paymentReply(null, 'hi', true), /pay_/);
  assert.match(paymentReply({ found: false }, 'en'), /couldn't find/);
  for (const status of ['captured', 'authorized', 'failed', 'refunded', 'partially_refunded', 'created', 'weird']) {
    for (const lang of ['en', 'hi']) assert.ok(paymentReply({ found: true, id: 'pay_X', status, amountInr: 499 }, lang).includes('pay_X'), `${status}/${lang}`);
  }
});

test('an authorized but uncaptured payment is not described as nearly done (Razorpay auto-refunds after 3 days)', () => {
  const text = paymentReply({ found: true, id: 'pay_X', status: 'authorized', amountInr: 499 }, 'en');
  assert.match(text, /not yet confirmed/);
  assert.match(text, /3 days/);
  assert.doesNotMatch(text, /usually completes shortly/);
});

test('refund rows are PENDING_APPROVAL and Slack escalations mask the phone number', () => {
  const message = { waId: '919811112222', name: 'Asha', text: 'refund please', messageId: 'wamid.9', language: 'en' };
  const row = refundRow(message, { paymentIds: ['pay_ABCDEFGH123456'], orderIds: [] }, '2026-10-23T10:00:00Z');
  assert.equal(row.status, 'PENDING_APPROVAL');
  assert.equal(row.payment_id, 'pay_ABCDEFGH123456');
  const slack = escalationSlackText(message, 'dispute', [{ role: 'customer', text: 'hi' }, { role: 'agent', text: 'hello' }]);
  assert.ok(slack.includes(maskPhone('919811112222')));
  assert.ok(slack.includes('Agent: hello'));
  assert.equal(maskPhone('919811112222'), '********2222');
});

test('FAQ prompt grounds the model, sets the reply language and carries recent history', () => {
  const messages = buildFaqMessages('Access is emailed within 10 minutes.', 'Wellness Co', { text: 'kab milega access', language: 'hinglish' }, [{ role: 'customer', text: 'hi' }, { role: 'agent', text: 'Hello!' }]);
  assert.equal(messages[0].role, 'system');
  assert.match(messages[0].content, /ONLY from the FAQ/);
  assert.match(messages[0].content, /Hinglish/);
  assert.match(messages[0].content, /Access is emailed within 10 minutes/);
  assert.deepEqual(messages.slice(1).map(m => m.role), ['user', 'assistant', 'user']);
});

test('model output that is unparseable, empty or low-confidence escalates', () => {
  assert.equal(parseAiAnswer('{"answer":"Yes","confidence":0.9,"needs_human":false}').escalate, false);
  assert.equal(parseAiAnswer('{"answer":"Maybe","confidence":0.3,"needs_human":false}').escalate, true);
  assert.equal(parseAiAnswer('{"answer":"","confidence":0.9}').escalate, true);
  assert.equal(parseAiAnswer('not json').escalate, true);
  assert.equal(parseAiAnswer('{"answer":"Ok","confidence":0.95,"needs_human":true}').escalate, true);
});

test('conversation history keeps only the latest turns per customer', () => {
  let store = {};
  for (let i = 0; i < 15; i++) store = appendHistory(store, 'w1', i % 2 ? 'agent' : 'customer', `t${i}`);
  assert.equal(store.w1.length, 12);
  assert.equal(store.w1.at(-1).text, 't14');
  assert.equal(appendHistory(store, 'w2', 'customer', 'x').w2.length, 1);
});
