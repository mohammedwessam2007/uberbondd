import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const path = new URL('../migrations/20261006_powerhouse_sender_scope_resolution.sql', import.meta.url);

test('Powerhouse sender-scope migration is exact, narrow, and grants no send authority', async () => {
  const sql = await fs.readFile(path, 'utf8');
  assert.match(sql, /pros_d8ced49c-38e1-4d70-8b3d-61a1a2533377/);
  assert.match(sql, /lower\(domain\) = 'mypowerhouse\.group'/);
  assert.match(sql, /hello@mypowerhouse\.group/g);
  assert.match(sql, /recipient,jurisdiction/);
  assert.match(sql, /namedPersonEvidence,present/);
  assert.match(sql, /'resolutionRef'/);
  assert.match(sql, /'sendAuthority', false/);
  assert.doesNotMatch(sql, /UPDATE\s+campaigns/i);
  assert.doesNotMatch(sql, /auto_send\s*=\s*true/i);
  assert.doesNotMatch(sql, /INSERT\s+INTO\s+(?:messages|outbound_events|outbound_reservations)/i);
});
