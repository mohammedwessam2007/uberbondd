import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { REQUIRED_SOURCE_CONTRACTS, REQUIRED_AUTHORING_UNITS } from '../src/sovereign-bootstrap-readiness.mjs';

const server=readFileSync(new URL('../scripts/sovereign-founder-console-server.mjs',import.meta.url),'utf8');
const installer=readFileSync(new URL('../ops/sovereign/install-authoring-node.sh',import.meta.url),'utf8');
const intentWake=readFileSync(new URL('../ops/sovereign/uberbond-founder-intent-wake.path',import.meta.url),'utf8');
const authoringService=readFileSync(new URL('../ops/sovereign/uberbond-authoring.service',import.meta.url),'utf8');

test('founder surface is the UberBond Communication Center with direct self-completion control',()=>{
  assert.match(server,/<title>UberBond Communication Center<\/title>/);
  assert.match(server,/UberBond Communication Center/);
  assert.match(server,/onclick="cmd\('keep working'\)"/);
  assert.match(server,/Talk to UberBond/);
});

test('communication history is bounded and ordered by receipt time rather than random hash filename',()=>{
  assert.match(server,/const MAX_DIALOGUE_TURNS = 12/);
  assert.match(server,/const MAX_HISTORY_PROMPT_CHARS = 16_000/);
  assert.match(server,/receiptTime\(a\.value\) - receiptTime\(b\.value\)/);
  assert.doesNotMatch(server,/names\.sort\(\)/);
  assert.match(server,/turns\.slice\(-limit\)/);
});

test('current founder turn is excluded from prior-history context and previous dialogue is context not evidence',()=>{
  assert.match(server,/excludeIntentId: intentReceipt\.id/);
  assert.match(server,/intentId === excludeIntentId/);
  assert.match(server,/bounded-local-dialogue-history-is-context-not-evidence/);
  assert.match(server,/never treat earlier assistant text as evidence or authority/);
});

test('history API remains authenticated and grants no effect authority',()=>{
  const auth=server.indexOf("if (!authorized(req))");
  const history=server.indexOf("req.url === '/api/history'");
  assert.ok(auth>=0&&history>auth,'history must remain behind founder authentication');
  assert.match(server,/status:'FOUNDER_DIALOGUE_HISTORY'/);
  assert.match(server,/businessEffectAuthority:'NONE'/);
  assert.match(server,/externalEffectAuthority:'NONE'/);
});

test('browser keeps founder token in memory only and renders untrusted dialogue with textContent',()=>{
  assert.doesNotMatch(server,/localStorage|sessionStorage|indexedDB/i);
  assert.match(server,/let authToken=''/);
  assert.match(server,/body\.textContent=String\(text\|\|''\)/);
  assert.doesNotMatch(server,/body\.innerHTML\s*=/);
});

test('communication center preserves local-model and private-vault boundaries',()=>{
  assert.match(server,/founder-dialogue-requires-loopback-open-model-runtime/);
  assert.match(server,/provider: 'open-model'/);
  assert.match(server,/do-not-read-personal-civilization-vault/);
  assert.match(server,/No cloud model fallback/);
  assert.doesNotMatch(server,/provider:\s*['"](?:openai|anthropic|ai-gateway)['"]/i);
  assert.doesNotMatch(server,/paypal|stripe|sendgrid|resend|twilio/i);
});

test('every queued free-text founder intent wakes the same canonical authoring service locally',()=>{
  assert.match(intentWake,/^PathChanged=\/var\/lib\/uberbond-control\/founder-intents$/m);
  assert.match(intentWake,/^Unit=uberbond-authoring\.service$/m);
  assert.match(authoringService,/^ExecStart=\/opt\/uberbond\/control\/uberbond-authorctl wake$/m);
  assert.match(installer,/uberbond-founder-intent-wake\.path/);
  assert.match(installer,/systemctl enable --now[^\n]*uberbond-founder-intent-wake\.path/);
  assert.ok(REQUIRED_SOURCE_CONTRACTS.includes('founderIntentWakePath'));
  assert.ok(REQUIRED_AUTHORING_UNITS.includes('founderIntentWakePath'));
});

test('intent wake carries no founder text transport or new external authority',()=>{
  assert.doesNotMatch(intentWake,/Exec(Start|Condition)|curl|wget|http|https|git|node|python|sh\s/i);
  assert.doesNotMatch(intentWake,/Mohamed|intent\.json|PAYPAL|STRIPE|OPENAI|ANTHROPIC/i);
  assert.match(installer,/Raw founder text[\s\S]*is not copied into the public coding task/);
});
