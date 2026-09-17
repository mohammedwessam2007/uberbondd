import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverContacts } from '../src/contacts.mjs';

test('public contact extraction retains the exact same-domain page provenance', async () => {
  const result = await discoverContacts(
    { website: 'https://example.com' },
    {
      startUrl: 'https://example.com/',
      completedAt: '2026-09-17T00:00:00.000Z',
      pages: [
        { url: 'https://example.com/contact', emails: ['hello@example.com', 'other@outside.example'] },
        { url: 'https://example.com/about', emails: ['hello@example.com'] }
      ],
      emails: ['hello@example.com']
    }
  );
  assert.equal(result.candidates.length, 1);
  assert.equal(result.selected.source, 'website');
  assert.equal(result.selected.sourceUrl, 'https://example.com/contact');
  assert.equal(result.selected.exact, true);
  assert.equal(result.selected.inferred, false);
});

test('contact discovery makes no provider call without an explicit key', async () => {
  const result = await discoverContacts(
    { website: 'https://example.com' },
    { startUrl: 'https://example.com/', pages: [], emails: [] }
  );
  assert.equal(result.candidates.length, 0);
  assert.equal(result.selected, null);
});
