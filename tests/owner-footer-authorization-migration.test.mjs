import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const path = new URL('../migrations/20261005_preserve_owner_footer_authorization.sql', import.meta.url);

test('footer authorization migration contains no owner PII and preserves explicit revocation', async () => {
  const sql = await fs.readFile(path, 'utf8');
  assert.match(sql, /footerUseAuthorized/);
  assert.match(sql, /founder-explicit-2026-10-03/);
  assert.match(sql, /NOT \(NEW\.value \? 'footerUseAuthorized'\)/);
  assert.match(sql, /coalesce\(OLD\.value->>'footerUseAuthorized', 'false'\) = 'true'/);
  assert.match(sql, /length\(btrim\(coalesce\(value->>'legalName', ''\)\)\) >= 2/);
  assert.match(sql, /length\(btrim\(coalesce\(value->>'postalAddress', ''\)\)\) >= 12/);
  assert.doesNotMatch(sql, /Mohamed|Wessam|Solomon|Beverly|Montazah|UberBond/i);
});
