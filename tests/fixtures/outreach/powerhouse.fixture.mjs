// Hermetic fixture for the generic prospect-preflight suites.
//
// Powerhouse is a FIXTURE proving the generic pipeline, not a code path: nothing
// in src/ names it. The suites import this file instead of reading
// artifacts/*.json so they run unchanged in the mutation war's sandbox, which
// copies src/ and tests/ but not artifacts/.
export const POWERHOUSE_RECORD = Object.freeze({
  "company": "Powerhouse Consulting Group",
  "website": "https://mypowerhouse.group/",
  "hqCountry": "US",
  "evidenceClass": "PAGE_FETCH_VERIFIED",
  "currentOwnership": {
    "status": "INDEPENDENT",
    "evidenceUrl": "https://mypowerhouse.group/"
  },
  "recipient": {
    "email": "hello@mypowerhouse.group",
    "publishedRole": "GENERAL_BUSINESS_AND_PARTNERSHIP_CONTACT",
    "sourceUrl": "https://mypowerhouse.group/event/webinar-servicetitan-field-mobile-app-advanced-features/",
    "sourcePageExact": true,
    "excerpt": "Also available to non-clients – just email hello@mypowerhouse.group for more information!",
    "observedAt": "2026-10-02T19:57:19.134Z"
  },
  "notices": {
    "noSolicitationChecked": true,
    "noSolicitationFound": false,
    "noHarvestChecked": true,
    "noHarvestFound": false,
    "pagesChecked": [
      "https://mypowerhouse.group/contact/",
      "privacy policy",
      "homepage",
      "current event pages",
      "targeted indexed searches for harvest / solicitation / scrape / address-collection restrictions"
    ]
  },
  "offerFit": {
    "servesHomeServiceClients": true,
    "evidenceUrl": "https://mypowerhouse.group/",
    "rationale": "Software/FSM consultancy serving home-service contractors with a named, current client."
  },
  "clientEvidence": {
    "clientName": "Sylvester Electric",
    "clientSiteUrl": "https://sylvesterelectric.com/",
    "observation": {
      "verifiable": true,
      "text": "Homepage gives two different emergency-availability representations: business hours plus qualifying after-hours, versus 24/7 Emergency Service.",
      "sourceUrl": "https://sylvesterelectric.com/",
      "excerpt": "during business hours and for qualifying after-hours situations / 24/7 Emergency Service (same page); corroborated by /generator-installation and /electric-panel-replacement",
      "observedAt": "2026-10-02T19:57:19.134Z"
    }
  },
  "offerRoute": {
    "offerId": "REVENUE_PROOF_AND_RENEWAL_PACK",
    "rationale": "Consultancy serving multiple contractors with an ongoing client model; independent evidence of client-facing inconsistencies supports renewal and proof conversations."
  }
});

export const powerhouseRecord = () => structuredClone(POWERHOUSE_RECORD);

export const POWERHOUSE_SLOTS = Object.freeze({
  issueCode: 'same-page-public-service-promise-inconsistency',
  subjectNoun: 'availability',
  observationClause: 'makes two different emergency-service promises on the same page: its homepage says emergency service covers business hours and qualifying after-hours situations, and its service list further down advertises 24/7 Emergency Service',
  corroborationSentence: 'Its generator and panel pages also say 24/7.',
  groundingPhrases: ['qualifying after-hours situations', '24/7 Emergency Service', 'generator', 'panel', '24/7'],
  artifactPhrase: 'a one-page reconciliation note',
  altitudePhrase: 'client QA',
  unsupportedPatterns: [{ pattern: 'ServiceTitan', reason: 'no evidence Sylvester after-hours rules live in ServiceTitan' }]
});

export const POWERHOUSE_ARTIFACT_REF = 'artifacts/outreach/SYLVESTER_EMERGENCY_AVAILABILITY_RECONCILIATION_DRAFT.md';

// The body the hand-built 2026-10-02 tournament selected (F_SAME_PAGE_FULL). The
// generic pipeline must re-derive it from the grounded slots, not copy it.
export const PRIOR_HAND_BUILT_WINNER_BODY = "Hi there,\n\nI noticed one of Powerhouse's publicly named clients, Sylvester Electric, makes two different emergency-service promises on the same page: its homepage says emergency service covers business hours and qualifying after-hours situations, and its service list further down advertises 24/7 Emergency Service. Its generator and panel pages also say 24/7. I put the exact wording into a one-page reconciliation note for client QA. Want me to send it?";
