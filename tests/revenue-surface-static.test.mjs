import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const r = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const js = r('public/constellation.js'); const html = r('public/constellation.html'); const server = r('server-core.mjs'); const svc = r('src/revenue-singularity-service.mjs');

test('constellation client is XSS-safe: no innerHTML/eval/inline handlers; untrusted text via textContent', () => {
  assert.doesNotMatch(js, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/);
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>|\son[a-z]+=/i);
  assert.match(js, /textContent = s/);
});

test('constellation client never persists credentials and has no send path', () => {
  assert.doesNotMatch(js, /localStorage|sessionStorage|document\.cookie|indexedDB/);
  assert.doesNotMatch(js, /\/api\/(outreach|send|dispatch-live)|messages\/send/);
  assert.match(html, /Dispatch \(dry run\)/);
});

test('constellation visual language remains data-bound instead of decorative fake activity', () => {
  assert.match(js, /Confidence aura is data, not decoration/);
  assert.match(js, /Event particles exist only for actual replayed events/);
  assert.match(js, /data\.edges\.filter/);
  assert.doesNotMatch(js, /Math\.random\(/);
});

test('every revenue API route sits behind the owner auth gate and no live dispatcher is injected', () => {
  assert.match(server, /url\.pathname\.startsWith\('\/api\/'\)[\s\S]{0,200}!publicApi\(url\.pathname\) && !auth\(req\)/);
  const at = server.indexOf("startsWith('/api/revenue/')");
  const block = server.slice(at, at + 4500);
  assert.match(block, /gs\.dispatch\(String\(body\.runId \|\| ''\)\)\)/);
  assert.doesNotMatch(block, /dispatchEffect|governedOutreachDispatch|sendMail|smtp/i);
  assert.doesNotMatch(server, /const publicApi = [^\n]*\/api\/revenue/);
});

test('G-SPOT authorization route authorizes only as MOHAMED over an exact digest', () => {
  assert.match(server, /gs\.authorize\(String\(body\.runId \|\| ''\), \{ batchDigest: String\(body\.batchDigest \|\| ''\), authorizedBy: 'MOHAMED' \}\)/);
});

test('service derives candidates through canonical stored evidence and live contact-history ledgers', () => {
  assert.match(svc, /evidenceBundleFromStoredProspect/);
  assert.match(svc, /buildProspectEvidenceBundle/);
  assert.match(svc, /compileContactHistory/);
  assert.doesNotMatch(svc, /contactHistoryVerified === true/);
  assert.match(svc, /never invents evidence/);
  assert.match(svc, /businessEffectAuthority:'NONE'/);
});

test('deal surface binds payment compression to provider-neutral live rail doctor', () => {
  assert.match(svc, /diagnosePaymentRail/);
  assert.match(svc, /compressPayment/);
  assert.match(svc, /paymentReadiness/);
});
