import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('network founder ops cannot import Personal Civilization private state', () => {
  const api = read('api/founder-ops.mjs');
  const view = read('src/founder-ops-view.mjs');
  for (const source of [api, view]) {
    assert.doesNotMatch(source, /from\s+['"][^'"]*personal-civilization-private/i);
    assert.doesNotMatch(source, /from\s+['"][^'"]*personal-civilization-core/i);
    assert.doesNotMatch(source, /UBERBOND_PRIVATE_LIFE_STORE/);
    assert.doesNotMatch(source, /PRIVATE_LIFE_STATE/);
  }
  assert.match(view, /rawPersonalCivilizationReachable:\s*false/);
  assert.match(view, /privateVaultDataIncluded:\s*false/);
  assert.match(view, /networkLifeStateAccessAuthorized:\s*false/);
});

test('iPad cockpit never persists or places the admin token into URLs or browser storage', () => {
  const js = read('public/ops.js');
  assert.doesNotMatch(js, /localStorage|sessionStorage|indexedDB/i);
  assert.doesNotMatch(js, /URLSearchParams|location\.search|location\.hash/i);
  assert.match(js, /let token = ''/);
  assert.match(js, /authorization:\s*`Bearer \$\{token\}`/);
  assert.match(js, /token = ''/);
});

test('the ops page contains no embedded private data, credentials or acting controls', () => {
  const html = read('public/ops.html');
  assert.doesNotMatch(html, /PAYPAL_(?:LIVE|SANDBOX)_CLIENT|DATABASE_URL|TOKEN_ENCRYPTION_KEY|PRIVATE_LIFE_STATE/);
  assert.doesNotMatch(html, /SEND EMAIL|CAPTURE PAYMENT|DEPLOY NOW|APPROVE OUTREACH/i);
  assert.match(html, /HIGHEST NETWORK RUNG/);
  assert.match(html, /Private life over network/);
  assert.match(html, /FORBIDDEN/);
});
