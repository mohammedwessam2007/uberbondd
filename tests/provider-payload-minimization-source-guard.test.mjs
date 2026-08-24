import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const REVENUE = new URL('../src/revenue.mjs', import.meta.url);

function webhookOrderWriter(source) {
  const start = source.indexOf('async handleLemonWebhook(rawBody, signature)');
  assert.notEqual(start, -1, 'handleLemonWebhook must exist');
  const end = source.indexOf('\n  async processMonitoring()', start);
  assert.notEqual(end, -1, 'handleLemonWebhook boundary must remain discoverable');
  return source.slice(start, end);
}

test('PRIV-01: payment webhook writer cannot persist the decoded raw provider payload', async () => {
  const source = await fs.readFile(REVENUE, 'utf8');
  const writer = webhookOrderWriter(source);

  assert.equal(/\braw\s*:\s*payload\b/.test(writer), false,
    'decoded provider payload must not be persisted in the ordinary order record');
  assert.equal(/\brawPayload\s*:\s*payload\b/.test(writer), false,
    'renaming raw payload retention does not satisfy minimization');
  assert.equal(/\bproviderPayload\s*:\s*payload\b/.test(writer), false,
    'provider payload aliases must not become durable order state');

  for (const normalizedWitness of [
    "provider: 'lemonsqueezy'",
    'providerEventId: preparedEvent.eventId',
    'providerOccurrenceId: preparedEvent.providerOccurrenceId || preparedEvent.eventId',
    'providerObjectId: preparedEvent.providerObjectId || \'\'',
    'eventName: preparedEvent.eventName',
    'leadId: preparedEvent.custom.lead_id',
    'prospectId: preparedEvent.custom.prospect_id',
    'product: preparedEvent.custom.product',
    'amountCents: preparedEvent.amountCents',
    'currency: preparedEvent.currency',
    'status: preparedEvent.status',
    'testMode: preparedEvent.testMode'
  ]) {
    assert.equal(writer.includes(normalizedWitness), true,
      `bounded normalized witness disappeared: ${normalizedWitness}`);
  }
});
