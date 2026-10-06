import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const indexUrl = new URL('../public/index.html', import.meta.url);
const storefrontUrl = new URL('../public/storefront.html', import.meta.url);
const adminUrl = new URL('../public/admin.html', import.meta.url);

test('Render root opens the UberBond command center instead of the legacy audit storefront', async () => {
  const [index, storefront, admin] = await Promise.all([
    fs.readFile(indexUrl, 'utf8'),
    fs.readFile(storefrontUrl, 'utf8'),
    fs.readFile(adminUrl, 'utf8')
  ]);

  assert.match(index, /location\.replace\(['"]\/admin\.html['"]\)/);
  assert.match(index, /storefront\.html/);
  assert.doesNotMatch(index, /id="audit-form"/);

  assert.match(admin, /UberBond Revenue Engine · Command Center/);
  assert.match(admin, /Prospect preflight/);
  assert.match(admin, /Owner-only exact frozen-effect execution/);

  assert.match(storefront, /UberBond Opportunity Audit/);
  assert.match(storefront, /id="audit-form"/);
  assert.match(storefront, /\/site\.js/);
});
