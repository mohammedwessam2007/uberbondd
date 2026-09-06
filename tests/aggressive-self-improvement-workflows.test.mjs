import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const maintainer = fs.readFileSync('.github/workflows/uberbond-self-maintainer.yml', 'utf8');
const gamechanger = fs.readFileSync('.github/workflows/gamechanger-mesh-hourly.yml', 'utf8');

test('self-maintainer runs four bounded pulses per hour without widening real-world authority', () => {
  assert.match(maintainer, /cron:\s*'2,17,32,47 \* \* \* \*'/);
  assert.match(maintainer, /group:\s*uberbond-self-maintainer/);
  assert.match(maintainer, /cancel-in-progress:\s*false/);
  assert.match(maintainer, /for attempt in 1 2 3/);
  assert.match(maintainer, /sleep 120/);

  for (const line of [
    "OUTBOUND_ENABLED: 'false'",
    "OUTBOUND_DRY_RUN: 'true'",
    "AUTO_EMAIL_REPORTS: 'false'",
    "DISCOVERY_ENABLED: 'false'",
    "DISCOVERY_DRY_RUN: 'true'",
    "ALLOW_TEST_PAYMENT_UNLOCK: 'false'"
  ]) assert.ok(maintainer.includes(line), `missing fail-closed workflow invariant: ${line}`);

  assert.doesNotMatch(maintainer, /OUTBOUND_ENABLED:\s*'true'/);
  assert.doesNotMatch(maintainer, /ALLOW_TEST_PAYMENT_UNLOCK:\s*'true'/);
});

test('whole-brain sensing runs twice hourly and remains read-only', () => {
  assert.match(gamechanger, /cron:\s*'7,37 \* \* \* \*'/);
  assert.match(gamechanger, /permissions:\s*\n\s*contents:\s*read/);
  assert.match(gamechanger, /npm run gamechanger:tick/);
  assert.match(gamechanger, /npm run genesis:tick/);
  assert.match(gamechanger, /uberbond-cognitive-cycle-synaptic\.mjs/);
  assert.doesNotMatch(gamechanger, /contents:\s*write/);
});
