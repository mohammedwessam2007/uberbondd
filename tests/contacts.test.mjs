import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyMailbox,
  discoverContacts,
  extractPublishedContactEvidence,
  isFreePersonalEmail,
  isRiskyMailbox,
  verifyEmail
} from '../src/contacts.mjs';

const prospect = { company: 'North Clinic', website: 'https://clinic.example' };

const published = (email, overrides = {}) => ({
  email,
  sourceUrl: 'https://clinic.example/contact',
  sourceType: 'visible_text',
  evidenceExcerpt: `Public business contact: ${email}`,
  context: 'contact_page',
  published: true,
  ...overrides
});

test('public website contacts retain evidence and prioritize named decision-makers over generic mailboxes', async () => {
  const crawl = { pages: [{
    url: 'https://clinic.example/contact',
    emailEvidence: [
      published('hello@clinic.example'),
      published('sara@clinic.example', {
        sourceUrl: 'https://clinic.example/team',
        evidenceExcerpt: 'Dr Sara Khan — Medical Director — sara@clinic.example',
        context: 'team_page',
        name: 'Dr Sara Khan',
        firstName: 'Sara',
        lastName: 'Khan',
        position: 'Medical Director'
      })
    ],
    emails: ['hidden@clinic.example'],
    bodyText: 'Contact our clinic.'
  }] };

  const result = await discoverContacts(prospect, crawl);
  assert.equal(result.candidates.length, 2);
  assert.equal(result.selected.email, 'sara@clinic.example');
  assert.equal(result.selected.mailboxType, 'named');
  assert.equal(result.selected.role, 'director');
  assert.equal(result.selected.published, true);
  assert.equal(result.selected.automationEligible, true);
  assert.equal(result.selected.sourceUrl, 'https://clinic.example/team');
  assert.match(result.selected.evidenceExcerpt, /sara@clinic\.example/i);
  assert.equal(result.candidates.some(contact => contact.email === 'hidden@clinic.example'), false);
  assert.equal(result.candidates.find(contact => contact.email === 'hello@clinic.example').mailboxType, 'role');
});

test('fallback extraction supports visible text, mailto links, and structured data with page provenance', () => {
  const crawl = { pages: [
    {
      url: 'https://clinic.example/contact',
      bodyText: 'Appointments: appointments@clinic.example',
      mailtoLinks: [{ url: 'mailto:owner@clinic.example?subject=Hello', text: 'Email the owner', visible: true }],
      jsonLd: []
    },
    {
      url: 'https://clinic.example/team',
      bodyText: 'Meet our clinical team.',
      mailtoLinks: [],
      jsonLd: [JSON.stringify({
        '@type': 'Person', name: 'Dr Amira Noor', givenName: 'Amira', familyName: 'Noor',
        jobTitle: 'Practice Manager', email: 'amira@clinic.example'
      })]
    }
  ] };

  const evidence = extractPublishedContactEvidence(crawl);
  assert.deepEqual(new Set(evidence.map(item => item.email)), new Set([
    'appointments@clinic.example', 'owner@clinic.example', 'amira@clinic.example'
  ]));
  assert.equal(evidence.find(item => item.email === 'owner@clinic.example').sourceType, 'mailto');
  const structured = evidence.find(item => item.email === 'amira@clinic.example');
  assert.equal(structured.sourceType, 'structured_data');
  assert.equal(structured.position, 'Practice Manager');
  assert.equal(structured.sourceUrl, 'https://clinic.example/team');
});

test('risky, free-mail, unrelated-domain, and raw hidden addresses are rejected', async () => {
  const crawl = { pages: [{
    url: 'https://clinic.example/contact',
    bodyText: 'Public contact page',
    emails: ['hidden@clinic.example'],
    emailEvidence: [
      published('legal@clinic.example'),
      published('security-alerts@clinic.example'),
      published('clinic@gmail.com'),
      published('sales@unrelated.example'),
      published('office@clinic.example')
    ]
  }] };
  const result = await discoverContacts(prospect, crawl);
  assert.deepEqual(result.candidates.map(contact => contact.email), ['office@clinic.example']);
  assert.equal(result.rejected['risky-mailbox'], 2);
  assert.equal(result.rejected['free-mail-contact'], 1);
  assert.equal(result.rejected['contact-domain-mismatch'], 1);
  assert.equal(isRiskyMailbox('postmaster+alerts@clinic.example'), true);
  assert.equal(isFreePersonalEmail('clinic@outlook.com'), true);
  assert.deepEqual(classifyMailbox('owner@clinic.example'), { mailboxType: 'role', personal: false });
});

test('optional Hunter contacts require positive verification and never become guessed addresses', async () => {
  let request;
  const fetchImpl = async (url, options) => {
    request = { url: String(url), options };
    return {
      ok: true,
      async json() {
        return { data: { emails: [
          { value: 'owner@clinic.example', position: 'Owner', verification: { status: 'unknown' }, sources: [{ uri: 'https://clinic.example/about' }] },
          { value: 'founder@clinic.example', position: 'Founder', verification: { status: 'valid' }, first_name: 'Fara' },
          { value: 'privacy@clinic.example', verification: { status: 'valid' } },
          { value: 'clinic@gmail.com', verification: { status: 'valid' } },
          { value: 'director@other.example', verification: { status: 'valid' } },
          { first_name: 'Pattern', last_name: 'Only', verification: { status: 'valid' } }
        ] } };
      }
    };
  };

  const result = await discoverContacts(prospect, { pages: [] }, 'hunter-secret', { fetchImpl });
  assert.equal(new URL(request.url).searchParams.get('domain'), 'clinic.example');
  assert.equal(new URL(request.url).searchParams.has('api_key'), false);
  assert.equal(request.options.headers['X-API-KEY'], 'hunter-secret');
  assert.equal(result.selected.email, 'founder@clinic.example');
  assert.equal(result.selected.externallyVerified, true);
  assert.equal(result.selected.eligibilityMode, 'externally_verified');
  assert.equal(result.candidates.find(contact => contact.email === 'owner@clinic.example').automationEligible, false);
  assert.equal(result.candidates.some(contact => /pattern/i.test(contact.email)), false);
  assert(result.candidates.every(contact => contact.guessed === false));
});

test('Hunter failures expose only a non-PII error code and do not block public extraction', async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 429,
    async text() { return 'owner@clinic.example and private provider detail'; }
  });
  const result = await discoverContacts(prospect, { pages: [{
    url: 'https://clinic.example/contact',
    emailEvidence: [published('office@clinic.example')]
  }] }, 'hunter-secret', { fetchImpl });
  assert.equal(result.selected.email, 'office@clinic.example');
  assert.deepEqual(result.providerErrors, [{ provider: 'hunter', code: 'hunter_http_429' }]);
  assert.doesNotMatch(JSON.stringify(result.providerErrors), /owner@|private provider detail/);
});

test('email verification remains optional and marks only valid provider results externally verified', async () => {
  assert.deepEqual(await verifyEmail('Office@Clinic.Example'), {
    email: 'office@clinic.example', status: 'unverified', score: 0, externallyVerified: false
  });
  const verified = await verifyEmail('owner@clinic.example', 'hunter-secret', {
    fetchImpl: async () => ({ ok: true, async json() { return { data: { status: 'valid', score: 91 } }; } })
  });
  assert.equal(verified.status, 'valid');
  assert.equal(verified.externallyVerified, true);
  assert.equal(verified.score, 91);
});
