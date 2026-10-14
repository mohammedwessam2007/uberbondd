import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyInboundEvent } from '../src/inbound-classify.mjs';
import { compileInboundFeedbackEvent, compileInboundLocalIntents } from '../src/inbound-feedback-kernel.mjs';

const message = (id, headers, body) => ({
  id, threadId: 'synthetic-thread',
  payload: {
    mimeType: 'text/plain',
    headers: Object.entries(headers).map(([name,value]) => ({ name, value })),
    body: { data: Buffer.from(body).toString('base64url') }
  }
});

test('machine auto-reply with English unsubscribe does not prepare a suppression', () => {
  const event = compileInboundFeedbackEvent({ message: message('machine-1', {
    'Auto-Submitted': 'auto-replied', Subject: 'Unsubscribe me now'
  }, 'Please unsubscribe me immediately.'), evidence: 'TEST_FIXTURE' });
  assert.equal(event.category,'out-of-office');
  assert.equal(event.authority,'NONE');
  assert.deepEqual(compileInboundLocalIntents(event).intents.map(x=>x.action),['PAUSE_FOLLOWUP']);
});

test('machine feedback report with spam words requires corroboration before complaint intent', () => {
  const event = compileInboundFeedbackEvent({ message: message('machine-2', {
    'Auto-Submitted':'auto-generated',
    'Content-Type':'multipart/report; report-type=feedback-report',
    Subject:'Spam complaint received'
  }, 'abuse report'), evidence: 'TEST_FIXTURE' });
  assert.equal(event.category,'unknown');
  assert.equal(compileInboundLocalIntents(event).intents.length,0);
});

test('machine autoreply with Arabic unsubscribe phrase has no suppression intent', () => {
  const event = compileInboundFeedbackEvent({ message: message('machine-3', {
    'Auto-Submitted':'auto-replied',Subject:'رد آلي'
  }, 'إلغاء الاشتراك من فضلك'), evidence: 'TEST_FIXTURE' });
  assert.equal(event.category,'out-of-office');
  assert.equal(compileInboundLocalIntents(event).intents.some(x=>x.action==='SUPPRESS_CONTACT'),false);
});

test('Auto-Submitted no does not suppress actual user unsubscribe classification', () => {
  const event = compileInboundFeedbackEvent({ message: message('human-1', {
    'Auto-Submitted':'no',Subject:'Please unsubscribe me'
  }, 'Please remove me.'), evidence: 'TEST_FIXTURE' });
  assert.equal(event.category,'unsubscribe');
  assert.equal(event.authority,'NONE');
  assert.equal(compileInboundLocalIntents(event).intents.some(x=>x.action==='SUPPRESS_CONTACT'),true);
});

test('already-recognized structural DSN retains protective bounce classification', () => {
  const got=classifyInboundEvent({headers:{
    From:'mailer-daemon@mail.example.invalid',
    'Content-Type':'multipart/report; report-type=delivery-status',
    'Auto-Submitted':'auto-generated',
    Subject:'Undelivered Mail'
  }});
  assert.equal(got.category,'bounce');
});
