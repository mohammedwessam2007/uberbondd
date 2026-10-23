// End-to-end proof for the Phase 1 workflow, run against a real n8n instance.
//
//   node e2e/run-e2e.mjs <path-to-n8n-binary> <scratch-dir>
//
// Starts a local mock of WhatsApp Graph, OpenAI, Razorpay, Slack and the refund
// sheet, imports the mock-wired workflow into a throwaway n8n, publishes it,
// sends fourteen webhook scenarios (two verification, twelve message) and checks what each external API
// received. No real provider is contacted. Writes e2e/evidence.json.

import http from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { buildWorkflow, PRODUCTION_SETTINGS } from '../build-workflow.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const [n8nBin, scratch] = process.argv.slice(2);
if (!n8nBin || !scratch) { console.error('usage: run-e2e.mjs <n8n-bin> <scratch-dir>'); process.exit(2); }
const MOCK_PORT = 5689, N8N_PORT = 5688;
const mockBase = `http://127.0.0.1:${MOCK_PORT}`;

// ---------- mock external APIs ----------
const records = { graph: [], openai: [], razorpay: [], slack: [], sheets: [] };
const payments = {
  pay_TESTCAPTURED01: { id: 'pay_TESTCAPTURED01', amount: 49900, currency: 'INR', status: 'captured', method: 'upi', email: 'private@example.com', contact: '+919811112222', created_at: 1792700000 },
  pay_TESTREFUNDED01: { id: 'pay_TESTREFUNDED01', amount: 49900, currency: 'INR', status: 'refunded', refund_status: 'full', method: 'card', created_at: 1792600000 }
};
const readBody = req => new Promise(resolve => { let b = ''; req.on('data', c => { b += c; }); req.on('end', () => resolve(b)); });
const send = (res, status, obj) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
const mock = http.createServer(async (req, res) => {
  const url = new URL(req.url, mockBase);
  const raw = await readBody(req);
  const body = raw ? JSON.parse(raw) : null;
  const auth = req.headers.authorization ?? '';
  if (url.pathname === '/openai/chat/completions') {
    records.openai.push({ auth, body });
    const question = body.messages.at(-1).content.toLowerCase();
    const system = body.messages[0].content;
    const content = question.includes('weather')
      ? { answer: 'I am not sure.', confidence: 0.2, needs_human: false }
      : { answer: system.includes('Hindi (Devanagari') ? 'कोर्स का लिंक पेमेंट के 10 मिनट के भीतर ईमेल किया जाता है।' : 'The course link is emailed within 10 minutes of payment.', confidence: 0.92, needs_human: false };
    return send(res, 200, { choices: [{ message: { role: 'assistant', content: JSON.stringify(content) } }] });
  }
  if (url.pathname.startsWith('/razorpay/payments/')) {
    const id = url.pathname.split('/').pop();
    records.razorpay.push({ auth, id });
    if (id === 'pay_SERVERERROR123') return send(res, 502, { error: { code: 'SERVER_ERROR' } });
    return payments[id] ? send(res, 200, payments[id]) : send(res, 400, { error: { code: 'BAD_REQUEST_ERROR', description: 'The id provided does not exist' } });
  }
  if (/^\/graph\/[^/]+\/messages$/.test(url.pathname)) {
    records.graph.push({ auth, phoneNumberId: url.pathname.split('/')[2], body });
    return send(res, 200, { messaging_product: 'whatsapp', messages: [{ id: `wamid.out.${records.graph.length}` }] });
  }
  if (url.pathname === '/slack/chat.postMessage') { records.slack.push({ auth, body }); return send(res, 200, { ok: true }); }
  if (url.pathname === '/sheets/append') { records.sheets.push({ body }); return send(res, 200, { updates: { updatedRows: 1 } }); }
  send(res, 404, { error: 'unknown mock route ' + url.pathname });
});

// ---------- n8n lifecycle ----------
const home = join(scratch, 'n8n-e2e-home');
rmSync(home, { recursive: true, force: true });
mkdirSync(home, { recursive: true });
const env = { ...process.env, N8N_USER_FOLDER: home, N8N_PORT: String(N8N_PORT), N8N_DIAGNOSTICS_ENABLED: 'false', N8N_PERSONALIZATION_ENABLED: 'false', N8N_SECURE_COOKIE: 'false', N8N_ENCRYPTION_KEY: 'e2e-only-not-a-secret', WEBHOOK_URL: `http://127.0.0.1:${N8N_PORT}/`, N8N_LOG_LEVEL: 'warn', NO_COLOR: '1', N8N_LISTEN_ADDRESS: '127.0.0.1' };
const cli = (...args) => execFileSync(n8nBin, args, { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 180_000 });

const settings = { ...PRODUCTION_SETTINGS, brandName: 'Test Wellness Co', verifyToken: 'e2e-verify-token', graphBaseUrl: `${mockBase}/graph`, openaiBaseUrl: `${mockBase}/openai`, razorpayBaseUrl: `${mockBase}/razorpay`, slackBaseUrl: `${mockBase}/slack`, sheetsMockUrl: `${mockBase}/sheets/append`, faqText: 'Access: the course link is emailed within 10 minutes of payment. Refunds: requests within 7 days of purchase are reviewed by our team.' };
const workflow = { id: 'waSupportE2E0001', ...buildWorkflow(settings, { mockSheets: true, name: 'E2E mock — WhatsApp support agent' }) };
writeFileSync(join(home, 'workflow.json'), JSON.stringify(workflow));
writeFileSync(join(home, 'credentials.json'), JSON.stringify([
  { id: 'openaiCred000001', name: 'OpenAI', type: 'openAiApi', data: { apiKey: 'sk-e2e-test' } },
  { id: 'slackCred0000001', name: 'Slack bot token', type: 'slackApi', data: { accessToken: 'xoxb-e2e-test' } },
  { id: 'razorpayCred0001', name: 'Razorpay key id / secret', type: 'httpBasicAuth', data: { user: 'rzp_test_key', password: 'rzp_test_secret' } },
  { id: 'whatsappCred0001', name: 'WhatsApp Cloud API token (Authorization: Bearer …)', type: 'httpHeaderAuth', data: { name: 'Authorization', value: 'Bearer EAA-e2e-test' } }
]));

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, label, ms = 20_000) {
  const start = Date.now();
  for (;;) {
    const value = fn();
    if (value) return value;
    if (Date.now() - start > ms) throw new Error(`timed out waiting for ${label}`);
    await sleep(150);
  }
}

const webhookBody = (id, text, extra = {}) => ({ object: 'whatsapp_business_account', entry: [{ id: 'WABA', changes: [{ field: 'messages', value: {
  messaging_product: 'whatsapp', metadata: { display_phone_number: '919800000000', phone_number_id: 'PNID123' },
  contacts: [{ wa_id: extra.waId ?? '919811112222', profile: { name: 'Asha' } }],
  messages: [{ from: extra.waId ?? '919811112222', id, timestamp: '1792700000', type: 'text', text: { body: text } }] } }] }] });
const post = (payload) => fetch(`http://127.0.0.1:${N8N_PORT}/webhook/whatsapp-support`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });

const results = [];
async function scenario(name, fn) {
  try { await fn(); results.push({ name, ok: true }); console.log('PASS', name); }
  catch (error) { results.push({ name, ok: false, error: String(error?.message ?? error) }); console.log('FAIL', name, '-', error?.message); }
}
const lastGraph = () => records.graph.at(-1);

let n8n;
try {
  await new Promise(r => mock.listen(MOCK_PORT, '127.0.0.1', r));
  cli('import:credentials', `--input=${join(home, 'credentials.json')}`);
  cli('import:workflow', `--input=${join(home, 'workflow.json')}`);
  cli('publish:workflow', '--id=waSupportE2E0001');
  n8n = spawn(n8nBin, ['start'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  n8n.stdout.on('data', d => { log += d; }); n8n.stderr.on('data', d => { log += d; });
  let ready = false;
  const deadline = Date.now() + 180_000;
  while (!ready && Date.now() < deadline) {
    ready = await fetch(`http://127.0.0.1:${N8N_PORT}/healthz/readiness`).then(r => r.ok).catch(() => false);
    if (!ready) await sleep(500);
  }
  if (!ready) { console.error(log.slice(-3000)); throw new Error('n8n did not become ready'); }
  await sleep(1500);

  await scenario('Meta verification succeeds with the right token', async () => {
    const ok = await fetch(`http://127.0.0.1:${N8N_PORT}/webhook/whatsapp-support?hub.mode=subscribe&hub.verify_token=e2e-verify-token&hub.challenge=4242`);
    assert.equal(ok.status, 200); assert.equal(await ok.text(), '4242');
  });
  await scenario('Meta verification is refused with a wrong token', async () => {
    const bad = await fetch(`http://127.0.0.1:${N8N_PORT}/webhook/whatsapp-support?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=4242`);
    assert.equal(bad.status, 403);
  });
  await scenario('FAQ question is answered from the FAQ via OpenAI and sent on WhatsApp', async () => {
    const before = records.graph.length;
    assert.equal((await post(webhookBody('wamid.faq1', 'When do I get access to the course?'))).status, 200);
    await waitFor(() => records.graph.length > before, 'WhatsApp reply');
    assert.match(lastGraph().body.text.body, /emailed within 10 minutes/);
    assert.equal(lastGraph().body.to, '919811112222');
    assert.equal(lastGraph().phoneNumberId, 'PNID123');
    assert.equal(lastGraph().auth, 'Bearer EAA-e2e-test');
    assert.equal(records.openai.at(-1).auth, 'Bearer sk-e2e-test');
    assert.match(records.openai.at(-1).body.messages[0].content, /ONLY from the FAQ/);
  });
  await scenario('A retried webhook with the same message id is not answered twice', async () => {
    const before = records.graph.length, openaiBefore = records.openai.length;
    assert.equal((await post(webhookBody('wamid.faq1', 'When do I get access to the course?'))).status, 200);
    await sleep(3000);
    assert.equal(records.graph.length, before); assert.equal(records.openai.length, openaiBefore);
  });
  await scenario('Hindi question gets a Hindi answer', async () => {
    const before = records.graph.length;
    await post(webhookBody('wamid.hi1', 'कोर्स का एक्सेस कब मिलेगा?', { waId: '919833334444' }));
    await waitFor(() => records.graph.length > before, 'Hindi reply');
    assert.match(records.openai.at(-1).body.messages[0].content, /Hindi \(Devanagari/);
    assert.match(lastGraph().body.text.body, /[ऀ-ॿ]/);
  });
  await scenario('Low-confidence answer escalates to Slack and tells the customer a human will reply', async () => {
    const g = records.graph.length, s = records.slack.length;
    await post(webhookBody('wamid.lowconf', "What's the weather tomorrow?"));
    await waitFor(() => records.graph.length > g && records.slack.length > s, 'escalation');
    assert.match(records.slack.at(-1).body.text, /WhatsApp escalation/);
    assert.equal(records.slack.at(-1).body.channel, '#support-escalations');
    assert.equal(records.slack.at(-1).auth, 'Bearer xoxb-e2e-test');
    assert.match(lastGraph().body.text.body, /connecting you with our team/);
  });
  await scenario('Payment status is looked up in Razorpay without leaking private fields', async () => {
    const g = records.graph.length;
    await post(webhookBody('wamid.pay1', 'what is the status of pay_TESTCAPTURED01 ?'));
    await waitFor(() => records.graph.length > g, 'payment reply');
    assert.equal(records.razorpay.at(-1).id, 'pay_TESTCAPTURED01');
    assert.equal(records.razorpay.at(-1).auth, 'Basic ' + Buffer.from('rzp_test_key:rzp_test_secret').toString('base64'));
    const text = lastGraph().body.text.body;
    assert.match(text, /confirmed/); assert.match(text, /₹499/);
    assert.doesNotMatch(text, /private@example.com|9811112222/);
  });
  await scenario('Payment question without an id asks for the pay_ id instead of guessing', async () => {
    const g = records.graph.length, r = records.razorpay.length;
    await post(webhookBody('wamid.pay2', 'I paid but did not get access'));
    await waitFor(() => records.graph.length > g, 'ask-for-id reply');
    assert.match(lastGraph().body.text.body, /starts with pay_/);
    assert.equal(records.razorpay.length, r);
  });
  await scenario('Unknown payment id gets a not-found reply', async () => {
    const g = records.graph.length;
    await post(webhookBody('wamid.pay3', 'status pay_UNKNOWNPAYMNT1'));
    await waitFor(() => records.graph.length > g, 'not-found reply');
    assert.match(lastGraph().body.text.body, /couldn't find/);
  });
  await scenario('A malformed pay_ id gets a check-your-id reply, not an FAQ answer', async () => {
    const g = records.graph.length, o = records.openai.length, r = records.razorpay.length;
    await post(webhookBody('wamid.pay5', 'status pay_SHORT1'));
    await waitFor(() => records.graph.length > g, 'malformed-id reply');
    assert.match(lastGraph().body.text.body, /couldn't find/);
    assert.equal(records.openai.length, o); assert.equal(records.razorpay.length, r);
  });
  await scenario('Razorpay outage escalates instead of guessing', async () => {
    const g = records.graph.length, s = records.slack.length;
    await post(webhookBody('wamid.pay4', 'status pay_SERVERERROR123'));
    await waitFor(() => records.graph.length > g && records.slack.length > s, 'outage escalation');
    assert.match(records.slack.at(-1).body.text, /Razorpay lookup failed \(HTTP 502\)/);
  });
  await scenario('Refund request is logged as PENDING_APPROVAL, sent to Slack and acknowledged', async () => {
    const g = records.graph.length, s = records.slack.length, sh = records.sheets.length;
    await post(webhookBody('wamid.ref1', 'please refund pay_TESTREFUNDED01, it did not work for me'));
    await waitFor(() => records.graph.length > g && records.slack.length > s && records.sheets.length > sh, 'refund flow');
    assert.equal(records.sheets.at(-1).body.status, 'PENDING_APPROVAL');
    assert.equal(records.sheets.at(-1).body.payment_id, 'pay_TESTREFUNDED01');
    assert.equal(records.slack.at(-1).body.channel, '#refund-approvals');
    assert.match(records.slack.at(-1).body.text, /\*{8}2222/);
    assert.match(lastGraph().body.text.body, /refund request is logged/);
  });
  await scenario('Dispute language escalates immediately without calling OpenAI', async () => {
    const g = records.graph.length, o = records.openai.length, s = records.slack.length;
    await post(webhookBody('wamid.esc1', 'This is a scam, I will go to consumer court'));
    await waitFor(() => records.graph.length > g && records.slack.length > s, 'dispute escalation');
    assert.equal(records.openai.length, o);
    assert.match(records.slack.at(-1).body.text, /Recent conversation/);
  });
  await scenario('Delivery-status callbacks are ignored', async () => {
    const g = records.graph.length;
    await post({ object: 'whatsapp_business_account', entry: [{ changes: [{ value: { metadata: { phone_number_id: 'PNID123' }, statuses: [{ id: 'wamid.out.1', status: 'delivered' }] } }] }] });
    await sleep(2500);
    assert.equal(records.graph.length, g);
  });
} finally {
  n8n?.kill('SIGTERM');
  mock.close();
}

const evidence = {
  schemaVersion: 'uberbond.whatsapp-agent-e2e-1.0.0',
  ranAt: new Date().toISOString(),
  n8nVersion: execFileSync(n8nBin, ['--version'], { env, encoding: 'utf8' }).trim(),
  externalProvidersContacted: 'NONE (all APIs mocked on 127.0.0.1)',
  deviationFromProduction: 'Refund logging uses an HTTP call to a mock sheet instead of the native Google Sheets node, because Google OAuth cannot be mocked locally. Every other node is identical to workflow-phase1.n8n.json apart from base URLs and settings.',
  scenarios: results,
  passed: results.filter(r => r.ok).length,
  failed: results.filter(r => !r.ok).length,
  callsObserved: Object.fromEntries(Object.entries(records).map(([k, v]) => [k, v.length]))
};
writeFileSync(join(here, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify({ passed: evidence.passed, failed: evidence.failed, callsObserved: evidence.callsObserved }));
process.exit(evidence.failed ? 1 : 0);
