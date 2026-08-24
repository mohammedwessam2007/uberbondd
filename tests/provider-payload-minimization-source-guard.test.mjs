import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const REVENUE = new URL('../src/revenue.mjs', import.meta.url);

function webhookOrderWriter(source) {
  const start = source.indexOf('  paymentOrderWitness(event) {');
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
    'providerEventId: event.eventId',
    'providerOccurrenceId: event.providerOccurrenceId || event.eventId',
    'providerObjectId: event.providerObjectId || \'\'',
    'eventName: event.eventName',
    'leadId: event.custom.lead_id',
    'prospectId: event.custom.prospect_id',
    'product: event.custom.product',
    'amountCents: event.amountCents',
    'currency: event.currency',
    'status: event.status',
    'testMode: event.testMode'
  ]) {
    assert.equal(writer.includes(normalizedWitness), true,
      `bounded normalized witness disappeared: ${normalizedWitness}`);
  }
});
