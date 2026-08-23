import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const MODULE = new URL('../src/outreach-provider-events.mjs', import.meta.url);

function normalizerSource(source) {
  const start = source.indexOf('export function normalizeProviderEvent(');
  assert.notEqual(start, -1, 'normalizeProviderEvent must exist');
  const end = source.indexOf('\nexport function internalReplyFromProviderEvent(', start);
  assert.notEqual(end, -1, 'normalizer boundary must remain discoverable');
  return source.slice(start, end);
}

test('PRIV-02: normalized outreach events cannot retain the complete provider object under raw aliases', async () => {
  const source = await fs.readFile(MODULE, 'utf8');
  const normalizer = normalizerSource(source);

  for (const forbidden of [
    /\braw\s*:\s*input\b/,
    /\brawPayload\s*:\s*input\b/,
    /\bproviderPayload\s*:\s*input\b/,
    /\bproviderRaw\s*:\s*input\b/
  ]) {
    assert.equal(forbidden.test(normalizer), false,
      `full provider object retention returned through alias ${forbidden}`);
  }

  for (const boundedField of [
    'providerEventId', 'providerEventKey', 'occurredAt', 'campaignId',
    'prospectId', 'leadEmail', 'emailId', 'threadId', 'replyBody'
  ]) {
    assert.equal(normalizer.includes(boundedField), true,
      `bounded normalized field disappeared: ${boundedField}`);
  }
});
