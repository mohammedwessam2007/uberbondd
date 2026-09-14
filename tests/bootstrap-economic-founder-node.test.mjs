import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../ops/sovereign/bootstrap-economic-founder-node.sh', import.meta.url), 'utf8');

test('economic founder bootstrap composes founder node plus outcome heartbeat and verifies activation', () => {
  assert.match(source, /bootstrap-founder-node\.sh/);
  assert.match(source, /install-founder-outcome-mission\.sh/);
  assert.match(source, /systemctl is-active uberbond-founder-outcome-mission\.path/);
  assert.match(source, /systemctl is-active uberbond-founder-outcome-mission\.timer/);
  assert.match(source, /systemctl show -p Result --value uberbond-founder-outcome-mission\.service/);
  assert.match(source, /ECONOMIC_FOUNDER_NODE_READY/);
  assert.match(source, /does not by itself prove provider credentials, sends, customers, cleared payments, accepted delivery, profit, or 24-hour endurance/);
});
