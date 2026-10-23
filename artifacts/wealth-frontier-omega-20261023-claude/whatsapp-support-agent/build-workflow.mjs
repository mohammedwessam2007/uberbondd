// Builds the importable n8n workflow for the Phase 1 WhatsApp support agent.
//
//   node build-workflow.mjs                 -> workflow-phase1.n8n.json (production endpoints)
//   node build-workflow.mjs --mock <url>    -> e2e variant whose API calls go to a local mock
//
// Code nodes receive the exact function sources from logic.mjs, so the node:test
// suite and the running workflow share one implementation.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as logic from './logic.mjs';

const here = dirname(fileURLToPath(import.meta.url));

export const PRODUCTION_SETTINGS = {
  brandName: 'YOUR_BRAND_NAME',
  verifyToken: 'SET_A_LONG_RANDOM_VERIFY_TOKEN',
  graphBaseUrl: 'https://graph.facebook.com/v21.0',
  openaiBaseUrl: 'https://api.openai.com/v1',
  openaiModel: 'gpt-4o-mini',
  razorpayBaseUrl: 'https://api.razorpay.com/v1',
  slackBaseUrl: 'https://slack.com/api',
  slackEscalationChannel: '#support-escalations',
  slackRefundChannel: '#refund-approvals',
  refundSheetId: 'GOOGLE_SHEET_ID',
  refundSheetTab: 'Refunds',
  minConfidence: 0.6,
  faqText: 'PASTE YOUR FAQ, PRODUCT, ACCESS, PAYMENT AND REFUND POLICY TEXT HERE.'
};

const library = () => Object.values(logic).map(fn => fn.toString()).join('\n\n');
const preamble = settings => `// Generated from logic.mjs by build-workflow.mjs. Edit there, not here.\nconst SETTINGS = ${JSON.stringify(settings, null, 2)};\n\n${library()}\n\n`;

const code = (settings, body, mode = 'runOnceForAllItems') => ({ mode, jsCode: preamble(settings) + body });

const ROUTE_NODE = 'Normalize, dedupe and route';

function nodes(settings, { mockSheets }) {
  const http = (name, position, params, credentials) => ({ name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position, parameters: params, ...(credentials ? { credentials } : {}) });
  const fullResponse = { response: { response: { fullResponse: true, neverError: true } } };
  const slackPost = (name, position, channelKey, textExpr) => http(name, position, {
    method: 'POST', url: `${settings.slackBaseUrl}/chat.postMessage`,
    authentication: 'predefinedCredentialType', nodeCredentialType: 'slackApi',
    sendBody: true, specifyBody: 'json',
    jsonBody: `={{ JSON.stringify({ channel: ${JSON.stringify(settings[channelKey])}, text: ${textExpr} }) }}`,
    options: fullResponse
  }, { slackApi: { id: 'slackCred0000001', name: 'Slack bot token' } });

  const list = [
    { name: 'WhatsApp webhook (verify)', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, -300], webhookId: 'b7c1f3d2-6a4e-4f0e-9d51-2f0c7a9e3a11',
      parameters: { httpMethod: 'GET', path: 'whatsapp-support', responseMode: 'responseNode', options: {} } },
    { name: 'Check verify token', type: 'n8n-nodes-base.code', typeVersion: 2, position: [240, -300],
      parameters: code(settings, `const q = $input.first().json.query ?? {};
const ok = q['hub.mode'] === 'subscribe' && q['hub.verify_token'] === SETTINGS.verifyToken;
return [{ json: { status: ok ? 200 : 403, body: ok ? String(q['hub.challenge'] ?? '') : 'forbidden' } }];`) },
    { name: 'Answer Meta verification', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position: [480, -300],
      parameters: { respondWith: 'text', responseBody: '={{ $json.body }}', options: { responseCode: '={{ $json.status }}' } } },

    { name: 'WhatsApp webhook (messages)', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 0], webhookId: 'b7c1f3d2-6a4e-4f0e-9d51-2f0c7a9e3a12',
      parameters: { httpMethod: 'POST', path: 'whatsapp-support', responseMode: 'onReceived', options: {} } },
    { name: ROUTE_NODE, type: 'n8n-nodes-base.code', typeVersion: 2, position: [240, 0],
      parameters: code(settings, `const store = $getWorkflowStaticData('global');
const now = Date.now();
const out = [];
for (const item of $input.all()) {
  for (const message of normalizeInbound(item.json.body ?? item.json)) {
    const d = dedupeMessage(store.seen ?? {}, message.messageId, now);
    store.seen = d.seen;
    if (d.duplicate) continue;
    if (!message.text) continue;
    message.language = detectLanguage(message.text);
    const references = extractReferences(message.text);
    const intent = classifyIntent(message.text, references);
    const history = (store.history ?? {})[message.waId] ?? [];
    store.history = appendHistory(store.history, message.waId, 'customer', message.text);
    const row = { ...message, references, route: intent.route, reason: intent.reason, phoneNumberId: message.phoneNumberId };
    if (intent.route === 'faq') row.openaiBody = { model: SETTINGS.openaiModel, temperature: 0.2, response_format: { type: 'json_object' }, messages: buildFaqMessages(SETTINGS.faqText, SETTINGS.brandName, message, history) };
    if (intent.route === 'payment_status') {
      if (references.paymentIds.length) row.razorpayUrl = SETTINGS.razorpayBaseUrl + '/payments/' + references.paymentIds[0];
      else if (references.orderIds.length) row.razorpayUrl = SETTINGS.razorpayBaseUrl + '/orders/' + references.orderIds[0] + '/payments';
      else if (references.malformedIds.length) { row.route = 'reply'; row.replyText = paymentReply({ found: false }, message.language, false); }
      else { row.route = 'reply'; row.replyText = paymentReply(null, message.language, true); }
    }
    if (intent.route === 'refund') {
      row.sheetRow = refundRow(message, references, new Date(now).toISOString());
      row.slackText = refundSlackText(row.sheetRow);
      row.replyText = refundAck(message.language, references.paymentIds.length > 0);
    }
    if (intent.route === 'escalate') {
      row.slackText = escalationSlackText(message, intent.reason, [...history, { role: 'customer', text: message.text }]);
      row.replyText = escalationAck(message.language);
    }
    out.push({ json: row });
  }
}
return out;`) },
    { name: 'Route by intent', type: 'n8n-nodes-base.switch', typeVersion: 3.2, position: [480, 0],
      parameters: { mode: 'expression', numberOutputs: 5, output: "={{ ({ faq: 0, payment_status: 1, refund: 2, escalate: 3, reply: 4 })[$json.route] ?? 3 }}", options: {} } },

    http('OpenAI: answer from FAQ', [720, -240], {
      method: 'POST', url: `${settings.openaiBaseUrl}/chat/completions`,
      authentication: 'predefinedCredentialType', nodeCredentialType: 'openAiApi',
      sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.openaiBody) }}', options: fullResponse
    }, { openAiApi: { id: 'openaiCred000001', name: 'OpenAI' } }),
    { name: 'Check AI answer', type: 'n8n-nodes-base.code', typeVersion: 2, position: [960, -240],
      parameters: code(settings, `const source = $('${ROUTE_NODE}').item.json;
const res = $json;
const content = res.statusCode === 200 ? res.body?.choices?.[0]?.message?.content : null;
const verdict = parseAiAnswer(content, SETTINGS.minConfidence);
if (!verdict.escalate) return { json: { ...source, route: 'reply', replyText: verdict.answer, aiConfidence: verdict.confidence } };
const store = $getWorkflowStaticData('global');
const history = (store.history ?? {})[source.waId] ?? [];
return { json: { ...source, route: 'escalate', reason: res.statusCode === 200 ? verdict.reason : 'AI request failed (HTTP ' + res.statusCode + ')', slackText: escalationSlackText(source, res.statusCode === 200 ? verdict.reason : 'AI request failed', history), replyText: escalationAck(source.language) } };`, 'runOnceForEachItem') },

    http('Razorpay: look up payment', [720, -60], {
      method: 'GET', url: '={{ $json.razorpayUrl }}',
      authentication: 'genericCredentialType', genericAuthType: 'httpBasicAuth', options: fullResponse
    }, { httpBasicAuth: { id: 'razorpayCred0001', name: 'Razorpay key id / secret' } }),
    { name: 'Write payment reply', type: 'n8n-nodes-base.code', typeVersion: 2, position: [960, -60],
      parameters: code(settings, `const source = $('${ROUTE_NODE}').item.json;
const res = $json;
if (res.statusCode === 200) {
  const payment = Array.isArray(res.body?.items) ? res.body.items.find(p => p.status === 'captured') ?? res.body.items[0] : res.body;
  return { json: { ...source, route: 'reply', replyText: paymentReply(mapRazorpayPayment(payment), source.language, false) } };
}
if (res.statusCode === 400 || res.statusCode === 404) return { json: { ...source, route: 'reply', replyText: paymentReply({ found: false }, source.language, false) } };
const store = $getWorkflowStaticData('global');
const history = (store.history ?? {})[source.waId] ?? [];
return { json: { ...source, route: 'escalate', reason: 'Razorpay lookup failed (HTTP ' + res.statusCode + ')', slackText: escalationSlackText(source, 'Razorpay lookup failed (HTTP ' + res.statusCode + ')', history), replyText: escalationAck(source.language) } };`, 'runOnceForEachItem') },
    { name: 'Reply or escalate', type: 'n8n-nodes-base.switch', typeVersion: 3.2, position: [1200, -150],
      parameters: { mode: 'expression', numberOutputs: 2, output: "={{ $json.route === 'reply' ? 0 : 1 }}", options: {} } },

    mockSheets
      ? http('Log refund request (Google Sheets)', [720, 120], {
          method: 'POST', url: `${settings.sheetsMockUrl}`, authentication: 'none',
          sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.sheetRow) }}', options: fullResponse })
      : { name: 'Log refund request (Google Sheets)', type: 'n8n-nodes-base.googleSheets', typeVersion: 4.5, position: [720, 120],
          parameters: {
            operation: 'append',
            documentId: { __rl: true, mode: 'id', value: settings.refundSheetId },
            sheetName: { __rl: true, mode: 'name', value: settings.refundSheetTab },
            columns: { mappingMode: 'defineBelow', value: Object.fromEntries(['received_at', 'customer_name', 'whatsapp', 'payment_id', 'order_id', 'language', 'customer_message', 'status', 'message_id'].map(k => [k, `={{ $json.sheetRow.${k} }}`])), matchingColumns: [], schema: [] },
            options: {}
          },
          credentials: { googleSheetsOAuth2Api: { id: 'sheetsCred000001', name: 'Google Sheets' } } },
    slackPost('Slack: refund for approval', [960, 120], 'slackRefundChannel', `$('${ROUTE_NODE}').item.json.slackText`),
    slackPost('Slack: escalate to a human', [1440, 300], 'slackEscalationChannel', '$json.slackText'),
    { name: 'Prepare customer reply', type: 'n8n-nodes-base.code', typeVersion: 2, position: [1680, 0],
      parameters: code(settings, `const source = $json.replyText ? $json : $('${ROUTE_NODE}').item.json;
return { json: { waId: source.waId, phoneNumberId: source.phoneNumberId, replyText: source.replyText, messageId: source.messageId, route: source.route } };`, 'runOnceForEachItem') },
    http('WhatsApp: send reply', [1920, 0], {
      method: 'POST', url: `=${settings.graphBaseUrl}/{{ $json.phoneNumberId }}/messages`,
      authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
      sendBody: true, specifyBody: 'json',
      jsonBody: "={{ JSON.stringify({ messaging_product: 'whatsapp', to: $json.waId, type: 'text', text: { preview_url: false, body: $json.replyText } }) }}",
      options: fullResponse
    }, { httpHeaderAuth: { id: 'whatsappCred0001', name: 'WhatsApp Cloud API token (Authorization: Bearer …)' } }),
    { name: 'Remember agent reply', type: 'n8n-nodes-base.code', typeVersion: 2, position: [2160, 0],
      parameters: code(settings, `const store = $getWorkflowStaticData('global');
const sent = $('Prepare customer reply').item.json;
store.history = appendHistory(store.history, sent.waId, 'agent', sent.replyText);
return { json: { waId: sent.waId, route: sent.route, whatsappStatus: $json.statusCode } };`, 'runOnceForEachItem') }
  ];
  return list;
}

function connections() {
  const to = (...names) => names.map(node => ({ node, type: 'main', index: 0 }));
  return {
    'WhatsApp webhook (verify)': { main: [to('Check verify token')] },
    'Check verify token': { main: [to('Answer Meta verification')] },
    'WhatsApp webhook (messages)': { main: [to(ROUTE_NODE)] },
    [ROUTE_NODE]: { main: [to('Route by intent')] },
    // Escalations fan out: Slack and the customer acknowledgement run side by side,
    // so a Slack response never replaces the reply text.
    'Route by intent': { main: [to('OpenAI: answer from FAQ'), to('Razorpay: look up payment'), to('Log refund request (Google Sheets)'), to('Slack: escalate to a human', 'Prepare customer reply'), to('Prepare customer reply')] },
    'OpenAI: answer from FAQ': { main: [to('Check AI answer')] },
    'Check AI answer': { main: [to('Reply or escalate')] },
    'Razorpay: look up payment': { main: [to('Write payment reply')] },
    'Write payment reply': { main: [to('Reply or escalate')] },
    'Reply or escalate': { main: [to('Prepare customer reply'), to('Slack: escalate to a human', 'Prepare customer reply')] },
    // The refund is acknowledged only after the sheet append succeeds.
    'Log refund request (Google Sheets)': { main: [to('Slack: refund for approval', 'Prepare customer reply')] },
    'Prepare customer reply': { main: [to('WhatsApp: send reply')] },
    'WhatsApp: send reply': { main: [to('Remember agent reply')] }
  };
}

export function buildWorkflow(settings = PRODUCTION_SETTINGS, { mockSheets = false, name = 'WhatsApp AI support agent — Phase 1 (Hindi/English, Razorpay, refunds, Slack)' } = {}) {
  return {
    name,
    nodes: nodes(settings, { mockSheets }),
    connections: connections(),
    settings: { executionOrder: 'v1', saveDataSuccessExecution: 'all', saveDataErrorExecution: 'all' },
    pinData: {},
    meta: { templateCredsSetupCompleted: false, generatedBy: 'uberbond build-workflow.mjs' }
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const mockIndex = process.argv.indexOf('--mock');
  if (mockIndex > 0) {
    const base = process.argv[mockIndex + 1];
    const settings = { ...PRODUCTION_SETTINGS, brandName: 'Test Wellness Co', verifyToken: 'e2e-verify-token', graphBaseUrl: `${base}/graph`, openaiBaseUrl: `${base}/openai`, razorpayBaseUrl: `${base}/razorpay`, slackBaseUrl: `${base}/slack`, sheetsMockUrl: `${base}/sheets/append`, faqText: 'Access: the course link is emailed within 10 minutes of payment. Refunds: requests within 7 days of purchase are reviewed by our team.' };
    process.stdout.write(JSON.stringify(buildWorkflow(settings, { mockSheets: true, name: 'E2E mock — WhatsApp support agent' }), null, 2));
  } else {
    writeFileSync(join(here, 'workflow-phase1.n8n.json'), JSON.stringify(buildWorkflow(), null, 2) + '\n');
    console.log('wrote workflow-phase1.n8n.json');
  }
}
