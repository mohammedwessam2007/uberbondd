import test from 'node:test';
import assert from 'node:assert/strict';
import { createUberWarm2GmailPlacementReader } from '../src/uberwarm2-gmail-placement-reader.mjs';
import { UBERWARM2_SEED_TEMPLATE } from '../src/uberwarm2-seed-executor.mjs';
import { createUberWarm2TrustedReceiverEvidenceDonor } from '../src/uberwarm2-trusted-receiver-evidence-donor.mjs';

const NOW = Date.parse('2026-10-17T13:30:00Z');
const receiver = 'owner@gmail.com';
const query = { probeId: 'owned-1', bodyToken: 'owned-1', senderEmail: 'sender@example.test',
  seedEmail: receiver, seedProvider: 'google', providerMessageId: '<exact@example.test>', at: NOW };
const body = UBERWARM2_SEED_TEMPLATE.bodyPrefix + query.probeId;
function fixture({ labels = ['INBOX'], changeMessage = () => {}, changeListing = () => {},
  profile = receiver, failAt = '', clock = () => NOW } = {}) {
  const calls = [];
  const message = { id: 'a123', labelIds: labels, payload: { mimeType: 'text/plain',
    headers: [ ['Message-ID', query.providerMessageId], ['From', 'Sender <sender@example.test>'],
      ['To', receiver], ['Subject', UBERWARM2_SEED_TEMPLATE.subject] ].map(([name,value])=>({name,value})),
    body: { data: Buffer.from(body).toString('base64url') } } };
  changeMessage(message);
  const listing = { messages: [{ id: 'a123' }] }; changeListing(listing);
  const client = createUberWarm2GmailPlacementReader({ receiverEmail: receiver,
    getAccessToken: async () => 'private-fixture-token', clock,
    fetchImpl: async (url, options) => {
      assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error');
      assert.equal(options.headers.authorization, 'Bearer private-fixture-token');
      assert.equal(new URL(url).origin, 'https://gmail.googleapis.com');
      calls.push(url);
      if (url.includes(failAt) && failAt) throw Error('private-fixture-token');
      const value = url.endsWith('/profile') ? { emailAddress: profile }
        : url.includes('/messages?') ? listing : message;
      return new Response(JSON.stringify(value), { status: 200 });
    }
  });
  return { client, calls };
}

test('reads exact recipient-side Inbox and Spam without treating observation as a signature', async () => {
  for (const folder of ['INBOX','SPAM','OTHER']) {
    const { client, calls } = fixture({ labels: folder === 'OTHER' ? ['CATEGORY_UPDATES'] : [folder] });
    const result = await client.inspect(query);
    assert.equal(result.ok, true); assert.equal(result.observation.providerFolder, folder);
    assert.equal(result.observation.messageId, query.providerMessageId);
    assert.equal(result.referenceSignatureVerified, false);
    assert.equal(result.protectedReferenceVerificationRequired, true);
    assert.equal(calls.length, 3); assert.equal(result.sends, 0);
    const search = new URL(calls[1]);
    assert.equal(search.searchParams.get('q'), 'in:anywhere rfc822msgid:exact@example.test');
    assert.equal(search.searchParams.get('includeSpamTrash'), 'true');
    for (const forbidden of ['private-fixture-token', body, 'rawHeaders', 'access_token'])
      assert.equal(JSON.stringify(result).includes(forbidden), false);
  }
});
test('missing receiver credentials and malformed or stale query do zero HTTP reads', async () => {
  assert.equal((await createUberWarm2GmailPlacementReader().inspect(query)).ok, false);
  for (const update of [{ seedEmail: 'other@gmail.com' }, { seedProvider: 'microsoft' },
    { providerMessageId: '<bad@example.test> OR subject:other' }, { providerMessageId: '<bad@example.test' },
    { bodyToken: 'other' }, { at: NOW - 300001 }, { at: NOW + 1 }, { probeId: null },
    { senderEmail: 'Sender@Example.test' }]) {
    const { client, calls } = fixture();
    assert.equal((await client.inspect({ ...query, ...update })).ok, false);
    assert.equal(calls.length, 0);
  }
});
test('wrong authenticated receiver stops before searching the mailbox', async () => {
  const { client, calls } = fixture({ profile: 'different@gmail.com' });
  assert.equal((await client.inspect(query)).ok, false); assert.equal(calls.length, 1);
});
test('missing, duplicate or paginated Message-ID search cannot claim placement', async () => {
  for (const changeListing of [x => { x.messages = []; }, x => { x.messages.push({id:'b123'}); },
    x => { x.nextPageToken = 'more'; }]) {
    const { client, calls } = fixture({ changeListing });
    assert.equal((await client.inspect(query)).ok, false); assert.equal(calls.length, 2);
  }
});
test('rejects mismatched sender, recipient, message, template, token and duplicate headers', async () => {
  const changes = [
    m => { m.id = 'b123'; },
    ...['Message-ID','From','To','Subject'].map(name => m => { m.payload.headers.find(h=>h.name===name).value='wrong'; }),
    m => { m.payload.headers.push({ name:'Message-ID',value:query.providerMessageId }); },
    m => { m.payload.body.data = Buffer.from(body + ' different').toString('base64url'); },
    m => { m.payload.mimeType = 'text/html'; },
    m => { m.payload.body.attachmentId = 'detached'; }
  ];
  for (const changeMessage of changes) {
    const { client } = fixture({ changeMessage });
    assert.equal((await client.inspect(query)).ok, false);
  }
});
test('contradictory/deleted folders and transport failures never default to Inbox', async () => {
  for (const options of [{labels:['INBOX','SPAM']}, {labels:['INBOX','TRASH']},
    {failAt:'/profile'}, {failAt:'/messages?'}]) {
    const { client } = fixture(options); const result = await client.inspect(query);
    assert.equal(result.ok, false); assert.equal(result.sends, 0);
    assert.equal(JSON.stringify(result).includes('private-fixture-token'), false);
  }
});
test('evidence expiry during awaited recipient read refuses placement', async () => {
  let ticks = 0;
  const { client } = fixture({ clock: () => NOW + (ticks++ ? 300001 : 0) });
  assert.equal((await client.inspect(query)).ok, false);
});
test('throwing clock and accessor queries fail closed without invoking getters', async () => {
  const broken = fixture({ clock: () => { throw Error('unreadable-clock'); } });
  assert.equal((await broken.client.inspect(query)).ok, false);
  let invoked = false;
  const q = { ...query }; Object.defineProperty(q, 'senderEmail', { get() { invoked = true; throw Error('getter'); } });
  const { client, calls } = fixture();
  assert.equal((await client.inspect(q)).ok, false);
  assert.equal(invoked, false); assert.equal(calls.length, 0);
  assert.equal((await client.inspect(null)).ok, false);
});
test('authenticated Gmail observation cannot bypass the existing signed reference gate', async () => {
  const { client } = fixture();
  const donor = createUberWarm2TrustedReceiverEvidenceDonor({
    readAuthenticatedReceivingEvidence: client.readAuthenticatedReceivingEvidence,
    readVerifiedEvidenceReference: async () => [], clock: () => NOW
  });
  const result = await donor.inspect({
    probe: { ...query, seedProvider: 'google' },
    receipt: { ...query, submittedAt: new Date(NOW - 1000).toISOString() }, at: NOW
  });
  assert.equal(result.ok, false);
  assert.equal(result.acceptedObservations, 0);
});
test('oversized and malformed recipient responses are bounded and not exposed', async () => {
  for (const payload of ['x'.repeat(262145), '{bad-json']) {
    const client = createUberWarm2GmailPlacementReader({ receiverEmail: receiver,
      getAccessToken: async () => 'private-fixture-token', clock: () => NOW,
      fetchImpl: async () => new Response(payload, {status:200}) });
    assert.equal((await client.inspect(query)).ok, false);
  }
});
