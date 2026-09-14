import { UBEROUTBOUND_EVIDENCE_STATES } from './uberoutbound-genome.mjs';

export const UBEROUTBOUND_POLICY_REGISTRY_VERSION = 'uberbond.uberoutbound-policy-registry.v1';

const freezeRows = rows => Object.freeze(rows.map(row => Object.freeze(row)));
const clean = (value, max = 240) => String(value ?? '').trim().slice(0, max);
const upper = value => clean(value).toUpperCase();
const unique = values => [...new Set(values.filter(Boolean))];

export const UBEROUTBOUND_VISIBLE_SOURCE_LEDGER = freezeRows([
  { id: 'gong-jason-bay-28m', source: 'Gong / Jason Bay', scale: '28M+ cold emails', contribution: 'Performance gap, length, pitch language, subject/body principles', methodGrade: 'B+', evidenceState: UBEROUTBOUND_EVIDENCE_STATES.PROBABLE, conflict: 'large observational vendor dataset; commercial collaboration' },
  { id: 'gong-85m-guide', source: 'Gong 85M+ guide', scale: '85M+ cold emails', contribution: 'Word-count bins, sentence count, CTA comparisons, personalization, sequence behavior', methodGrade: 'B+', evidenceState: UBEROUTBOUND_EVIDENCE_STATES.PROBABLE, conflict: 'descriptive; chart-level controls not fully public' },
  { id: 'gong-personalization', source: 'Gong personalization analysis', scale: '30k+ emails; 250+ companies; 2,300 classifiers', contribution: 'Seniority-conditioned personalization taxonomy', methodGrade: 'B', evidenceState: UBEROUTBOUND_EVIDENCE_STATES.PROBABLE, conflict: 'warmth and targeting confounding' },
  { id: 'gong-30mpc-exec', source: 'Gong / 30MPC executive research', scale: '1M+ executive sales cycles reported', contribution: 'Executive-specific messaging and lower executive response propensity', methodGrade: 'B+', evidenceState: UBEROUTBOUND_EVIDENCE_STATES.PROBABLE, conflict: 'observational' },
  { id: 'lavender-2026', source: 'Lavender 2026 benchmark', scale: '231,818 recent emails', contribution: 'Department, seniority and industry heterogeneity', methodGrade: 'B', evidenceState: UBEROUTBOUND_EVIDENCE_STATES.PROBABLE, conflict: 'vendor-defined score; selected user population' },
  { id: 'lavender-finance', source: 'Lavender finance study', scale: 'same benchmark family', contribution: 'Finance 3.2% overall vs 5.7% for 90+ scored emails; seniority differences', methodGrade: 'B-', evidenceState: UBEROUTBOUND_EVIDENCE_STATES.PROBABLE, conflict: 'causal inference weak; commercially conflicted' },
  { id: '30mpc-armand', source: '30MPC / Armand Farrokh', scale: 'practitioner corpus', contribution: 'First Is Best, problem-linked triggers, minimum mechanism, low-friction CTA', methodGrade: 'C+/B-', evidenceState: UBEROUTBOUND_EVIDENCE_STATES.SPECULATIVE, conflict: 'stronger when directly tied to Gong' },
  { id: 'josh-braun', source: 'Josh Braun', scale: 'practitioner corpus', contribution: 'Low-friction CTA and resistance reduction', methodGrade: 'C', evidenceState: UBEROUTBOUND_EVIDENCE_STATES.SPECULATIVE, conflict: 'largely practitioner doctrine' },
  { id: 'outreach-cadence-2026', source: 'Outreach 2026 cadence', scale: 'large platform telemetry; reports 930k sequences and 29M prospects', contribution: 'Adaptive cadence and multichannel hypotheses', methodGrade: 'C+', evidenceState: UBEROUTBOUND_EVIDENCE_STATES.SPECULATIVE, conflict: 'methodology varies' },
  { id: 'outreach-icebox-2026', source: 'Outreach Icebox 2026', scale: 'platform benchmark', contribution: 'Touch-count and multichannel priors', methodGrade: 'C+', evidenceState: UBEROUTBOUND_EVIDENCE_STATES.SPECULATIVE, conflict: 'public controls limited' },
  { id: 'google-gmail-guidelines', source: 'Google Gmail sender guidelines', scale: 'all/bulk senders to personal Gmail', contribution: 'Authentication, DNS/PTR, TLS, gradual ramping, unsubscribe and reputation rules', methodGrade: 'A', evidenceState: UBEROUTBOUND_EVIDENCE_STATES.PROVEN_NORMATIVE, conflict: 'normative provider policy' },
  { id: 'google-sender-faq', source: 'Google sender FAQ', scale: 'bulk Gmail senders', contribution: 'Spam-rate guidance and mitigation consequences', methodGrade: 'A', evidenceState: UBEROUTBOUND_EVIDENCE_STATES.PROVEN_NORMATIVE, conflict: 'normative provider policy' },
  { id: 'yahoo-sender-hub', source: 'Yahoo Sender Hub', scale: 'Yahoo/AOL bulk senders', contribution: 'Authentication, unsubscribe and complaint controls', methodGrade: 'A', evidenceState: UBEROUTBOUND_EVIDENCE_STATES.PROVEN_NORMATIVE, conflict: 'normative provider policy' },
  { id: 'microsoft-2025-high-volume', source: 'Microsoft 2025 sender announcement', scale: 'Outlook consumer ecosystem', contribution: 'SPF/DKIM/DMARC expectations for high-volume senders', methodGrade: 'A', evidenceState: UBEROUTBOUND_EVIDENCE_STATES.PROVEN_NORMATIVE, conflict: 'normative provider policy' },
  { id: 'ftc-can-spam', source: 'FTC CAN-SPAM', scale: 'US commercial email', contribution: 'Sender identity, subject, address and opt-out obligations', methodGrade: 'A', evidenceState: UBEROUTBOUND_EVIDENCE_STATES.PROVEN_NORMATIVE, conflict: 'primary legal/regulatory' },
  { id: 'eu-eprivacy-gdpr', source: 'EU ePrivacy + GDPR', scale: 'EU/EEA', contribution: 'Consent, existing-customer exception, processing and objection framework', methodGrade: 'A', evidenceState: UBEROUTBOUND_EVIDENCE_STATES.PROVEN_NORMATIVE, conflict: 'member-state implementation differs' },
  { id: 'ico-b2b-marketing', source: 'ICO B2B marketing', scale: 'United Kingdom', contribution: 'Corporate subscriber vs individual/sole-trader distinction', methodGrade: 'A', evidenceState: UBEROUTBOUND_EVIDENCE_STATES.PROVEN_NORMATIVE, conflict: 'recipient type matters' },
  { id: 'canada-casl', source: 'Canadian CASL sources', scale: 'Canada', contribution: 'Consent-before-CEM model and proof burden', methodGrade: 'A', evidenceState: UBEROUTBOUND_EVIDENCE_STATES.PROVEN_NORMATIVE, conflict: 'statutory exceptions require evidence' },
  { id: 'australia-spam-act', source: 'ACMA / Spam Act', scale: 'Australia', contribution: 'Consent, identity, unsubscribe and anti-harvesting requirements', methodGrade: 'A', evidenceState: UBEROUTBOUND_EVIDENCE_STATES.PROVEN_NORMATIVE, conflict: 'regulator/statute' },
  { id: 'saudi-pdpl', source: 'Saudi PDPL regulations', scale: 'Saudi Arabia', contribution: 'Direct-marketing consent and withdrawal controls', methodGrade: 'A', evidenceState: UBEROUTBOUND_EVIDENCE_STATES.PROVEN_NORMATIVE, conflict: 'regulation' },
  { id: 'egypt-pdpc', source: 'Egypt PDPC', scale: 'Egypt', contribution: '2025 executive regulations governing electronic direct marketing', methodGrade: 'A-', evidenceState: UBEROUTBOUND_EVIDENCE_STATES.PROVEN_NORMATIVE, conflict: 'official; English detail thinner' },
  { id: 'swiss-ofcom', source: 'Swiss OFCOM', scale: 'Switzerland', contribution: 'Opt-in framework for automated mass electronic advertising and existing-customer exception', methodGrade: 'A', evidenceState: UBEROUTBOUND_EVIDENCE_STATES.PROVEN_NORMATIVE, conflict: 'regulator' }
]);

export const UBEROUTBOUND_EXPERT_RESEARCH_COUNCIL = Object.freeze({
  A_EMPIRICAL_NORMATIVE: Object.freeze([
    'Gong Labs', 'Dan Morgese', 'Lavender Research', 'Will Allred', 'Outreach Research',
    'Salesloft Research', 'Google Gmail Sender team', 'Yahoo Sender team', 'Microsoft sender/security teams'
  ]),
  B_HIGH_VALUE_PRACTITIONER: Object.freeze([
    'Jason Bay', 'Armand Farrokh', 'Nick Cegelski', 'Jen Allen-Knuth', 'Becc Holland', 'Josh Braun',
    'John Barrows', 'Morgan Ingram', 'Sarah Brazier', 'Kyle Coleman', 'Jeb Blount', 'Keenan',
    'Trish Bertuzzi', 'Jacco van der Kooij', 'Aaron Ross', 'Mike Weinberg', 'Anthony Iannarino',
    'Todd Caponi', 'Jill Konrath', 'Mark Kosoglow', 'Kevin Dorsey', 'Sam Nelson', 'Florin Tatulea',
    'Jed Mahrle', 'Richard Harris', 'Dale Dupree', 'Amy Volas', 'Gabrielle Blackwell', 'Belal Batrawy',
    'Leslie Venetz', 'Tom Slocum', 'Collin Mitchell', 'Steli Efti', 'Peep Laja', 'April Dunford',
    'Dave Gerhardt', 'Devin Reed', 'Scott Leese', 'Andy Paul', 'Lori Richardson', 'Alice Heiman',
    'Marylou Tyler', 'Mike Kunkle'
  ]),
  C_VENDOR_COMMUNITY_HYPOTHESIS: Object.freeze([
    'Cognism', 'ZoomInfo', 'Apollo', 'Clay ecosystem practitioners', 'Common Room', '6sense', 'Demandbase',
    'Belkins', 'Woodpecker', 'Smartlead', 'Instantly', 'Reply.io', 'Lemlist/Guillaume Moubeche',
    'HubSpot Sales Research', 'Salesforce State of Sales', 'LinkedIn Sales Solutions', 'Pavilion',
    'RevGenius', 'SaaStr/Jason Lemkin'
  ])
});

export const UBEROUTBOUND_TRIGGER_TAXONOMY = freezeRows([
  { tier: 'A', family: 'KNOWN_ACTIVITY_INTENT_OR_DIRECT_ENGAGEMENT', rationale: 'Strong predictive signal with substantial warmth confounding', evidenceState: UBEROUTBOUND_EVIDENCE_STATES.PROBABLE },
  { tier: 'A', family: 'DIRECT_OBSERVABLE_PROBLEM_SIGNAL', rationale: 'Closest connection between evidence and problem hypothesis', evidenceState: UBEROUTBOUND_EVIDENCE_STATES.PROBABLE },
  { tier: 'B', family: 'PROBLEM_LINKED_HIRING_JOB_POST_EXPANSION_TECH_CHANGE', rationale: 'Plausible why-now when directly tied to workload or transition', evidenceState: UBEROUTBOUND_EVIDENCE_STATES.PROBABLE },
  { tier: 'B', family: 'EXPLICIT_EXECUTIVE_STRATEGIC_PRIORITY', rationale: 'Strong relevance for senior buyers when tied to consequence', evidenceState: UBEROUTBOUND_EVIDENCE_STATES.PROBABLE },
  { tier: 'B_C', family: 'REGULATION_OR_COMPLIANCE_EVENT', rationale: 'Urgency can be sharp but relevance and legal sensitivity differ by sector', evidenceState: UBEROUTBOUND_EVIDENCE_STATES.SPECULATIVE },
  { tier: 'C', family: 'FUNDING', rationale: 'Weak as congratulations; stronger only when it creates a substantiated problem', evidenceState: UBEROUTBOUND_EVIDENCE_STATES.SPECULATIVE },
  { tier: 'C', family: 'LEADERSHIP_CHANGE', rationale: 'Plausible timing signal; optimal delay unknown', evidenceState: UBEROUTBOUND_EVIDENCE_STATES.SPECULATIVE },
  { tier: 'D', family: 'GENERIC_SOCIAL_POST_AWARD_PODCAST_TRIVIA', rationale: 'May prove research effort but often lacks buying relevance', evidenceState: UBEROUTBOUND_EVIDENCE_STATES.SPECULATIVE }
]);

export const UBEROUTBOUND_OFFER_TAXONOMY = freezeRows([
  { family: 'CUSTOM_BENCHMARK_PEER_COMPARISON', bestHypothesizedUse: 'executive or strategic problem', risk: 'generic AI bait if not genuinely customized', prior: 'STRONG', evidenceState: UBEROUTBOUND_EVIDENCE_STATES.PROBABLE },
  { family: 'TEARDOWN_AUDIT', bestHypothesizedUse: 'externally observable operational problem', risk: 'free-consulting seekers and fulfillment cost', prior: 'STRONG', evidenceState: UBEROUTBOUND_EVIDENCE_STATES.PROBABLE },
  { family: 'DIAGNOSTIC_ASSESSMENT', bestHypothesizedUse: 'complex problem with multiple causes', risk: 'too much commitment on first touch', prior: 'STRONG', evidenceState: UBEROUTBOUND_EVIDENCE_STATES.PROBABLE },
  { family: 'CUSTOM_SHORT_REPORT', bestHypothesizedUse: 'high-value account', risk: 'research cost', prior: 'MEDIUM_STRONG', evidenceState: UBEROUTBOUND_EVIDENCE_STATES.SPECULATIVE },
  { family: 'RELEVANT_CASE_STUDY', bestHypothesizedUse: 'credibility after interest', risk: 'generic logo-dropping underperforms relevance', prior: 'MEDIUM', evidenceState: UBEROUTBOUND_EVIDENCE_STATES.PROBABLE },
  { family: 'CALCULATOR', bestHypothesizedUse: 'quantifiable cost or problem', risk: 'fake precision', prior: 'MEDIUM', evidenceState: UBEROUTBOUND_EVIDENCE_STATES.SPECULATIVE },
  { family: 'PILOT', bestHypothesizedUse: 'buyer already has intent', risk: 'too much ask for purely cold prospect', prior: 'LATER_STAGE', evidenceState: UBEROUTBOUND_EVIDENCE_STATES.SPECULATIVE },
  { family: 'FREE_TRIAL', bestHypothesizedUse: 'simple self-serve product', risk: 'often misaligned with cold enterprise buyer', prior: 'SEGMENT_SPECIFIC', evidenceState: UBEROUTBOUND_EVIDENCE_STATES.SPECULATIVE },
  { family: 'GUARANTEE', bestHypothesizedUse: 'offer-dependent', risk: 'legal and credibility risk', prior: 'EXPERIMENT_ONLY', evidenceState: UBEROUTBOUND_EVIDENCE_STATES.SPECULATIVE }
]);

export const UBEROUTBOUND_SEGMENT_POLICIES = freezeRows([
  { key: 'C_SUITE', dimension: 'SENIORITY', policy: '50-100 words starting prior; strategic priority/problem; company/activity evidence; one relevant proof point; offer perspective rather than immediate meeting demand', evidenceState: UBEROUTBOUND_EVIDENCE_STATES.PROBABLE },
  { key: 'VP_HEAD', dimension: 'SENIORITY', policy: 'bridge strategic consequence and owned function; company plus role relevance', evidenceState: UBEROUTBOUND_EVIDENCE_STATES.PROBABLE },
  { key: 'DIRECTOR', dimension: 'SENIORITY', policy: 'specific functional problem; company-level signal; credible operational consequence', evidenceState: UBEROUTBOUND_EVIDENCE_STATES.PROBABLE },
  { key: 'MANAGER', dimension: 'SENIORITY', policy: 'workflow-level pain; plain language; concrete operational outcome', evidenceState: UBEROUTBOUND_EVIDENCE_STATES.PROBABLE },
  { key: 'IC', dimension: 'SENIORITY', policy: 'exact task or friction; individual/context personalization; very small CTA', evidenceState: UBEROUTBOUND_EVIDENCE_STATES.PROBABLE },
  { key: 'FINANCE', dimension: 'DEPARTMENT', policy: 'precision, cost/risk/time, little hype; test numerical proof carefully', evidenceState: UBEROUTBOUND_EVIDENCE_STATES.PROBABLE },
  { key: 'OPERATIONS', dimension: 'DEPARTMENT', policy: 'workflow and problem specificity', evidenceState: UBEROUTBOUND_EVIDENCE_STATES.PROBABLE },
  { key: 'HR', dimension: 'DEPARTMENT', policy: 'human relevance and credible workflow context; avoid fake warmth', evidenceState: UBEROUTBOUND_EVIDENCE_STATES.PROBABLE },
  { key: 'ENGINEERING_PRODUCT', dimension: 'DEPARTMENT', policy: 'test mechanism credibility explicitly; generic scoring may have less leverage than in some departments', evidenceState: UBEROUTBOUND_EVIDENCE_STATES.SPECULATIVE },
  { key: 'SALES_MARKETING', dimension: 'DEPARTMENT', policy: 'strong trigger/problem relevance; aggressive experimentation because recipients are highly exposed to sales language', evidenceState: UBEROUTBOUND_EVIDENCE_STATES.SPECULATIVE }
]);

export const UBEROUTBOUND_INDUSTRY_POLICIES = freezeRows([
  { industry: 'SAAS', triggers: ['HIRING', 'PRICING_PRODUCT_CHANGE', 'TECH_CHANGE', 'GROWTH'], problemAltitude: ['PIPELINE', 'RETENTION', 'EFFICIENCY'], offers: ['BENCHMARK', 'TEARDOWN'], confidence: 'M' },
  { industry: 'PROFESSIONAL_SERVICES', triggers: ['HIRING', 'UTILIZATION', 'GEOGRAPHIC_EXPANSION'], problemAltitude: ['UTILIZATION', 'LEAD_FLOW', 'DELIVERY_CAPACITY'], offers: ['BENCHMARK', 'DIAGNOSTIC'], confidence: 'L_M' },
  { industry: 'AGENCIES', triggers: ['CLIENT_CHURN_SIGNALS', 'HIRING', 'SERVICE_EXPANSION'], problemAltitude: ['MARGIN', 'ACQUISITION', 'CLIENT_DELIVERY'], offers: ['TEARDOWN', 'BENCHMARK'], confidence: 'L_M' },
  { industry: 'HEALTHCARE', triggers: ['REGULATION', 'CAPACITY', 'STAFFING', 'PATIENT_ACCESS'], problemAltitude: ['RISK', 'THROUGHPUT', 'COST'], offers: ['DIAGNOSTIC'], confidence: 'L' },
  { industry: 'CLINICS', triggers: ['LOCATIONS', 'REVIEWS', 'STAFFING', 'APPOINTMENT_CAPACITY'], problemAltitude: ['UTILIZATION', 'PATIENT_ACQUISITION'], offers: ['AUDIT', 'BENCHMARK'], confidence: 'L' },
  { industry: 'MEDSPAS', triggers: ['LOCATION_EXPANSION', 'REVIEWS', 'SERVICE_MIX'], problemAltitude: ['UTILIZATION', 'PATIENT_ACQUISITION', 'RETENTION'], offers: ['LOCAL_BENCHMARK', 'TEARDOWN'], confidence: 'L' },
  { industry: 'HVAC', triggers: ['SEASONALITY', 'SERVICE_AREA', 'HIRING', 'REVIEWS'], problemAltitude: ['BOOKED_JOBS', 'DISPATCH', 'LEAD_RESPONSE'], offers: ['LOCAL_DIAGNOSTIC'], confidence: 'L' },
  { industry: 'PLUMBING', triggers: ['SERVICE_AREA_EXPANSION', 'HIRING', 'REVIEWS'], problemAltitude: ['RESPONSE_SPEED', 'JOB_VOLUME'], offers: ['AUDIT'], confidence: 'L' },
  { industry: 'ELECTRICAL', triggers: ['PROJECT_WINS', 'HIRING', 'SERVICE_COVERAGE'], problemAltitude: ['PIPELINE', 'UTILIZATION'], offers: ['ACCOUNT_DIAGNOSTIC'], confidence: 'L' },
  { industry: 'FINANCIAL_SERVICES', triggers: ['COMPLIANCE_CHANGES', 'PRODUCT_LAUNCHES', 'MARKET_EVENTS'], problemAltitude: ['RISK', 'EFFICIENCY', 'ACQUISITION'], offers: ['PEER_BENCHMARK'], confidence: 'M' },
  { industry: 'MANUFACTURING', triggers: ['PLANT_EXPANSION', 'HIRING', 'ERP_AUTOMATION_CHANGE'], problemAltitude: ['THROUGHPUT', 'DOWNTIME', 'COST'], offers: ['DIAGNOSTIC'], confidence: 'L_M' },
  { industry: 'LOGISTICS', triggers: ['ROUTE_NETWORK_EXPANSION', 'FUEL_COST_PRESSURE', 'HIRING'], problemAltitude: ['UTILIZATION', 'COST', 'SERVICE_LEVEL'], offers: ['BENCHMARK'], confidence: 'L_M' },
  { industry: 'REAL_ESTATE', triggers: ['INVENTORY', 'MARKET_ACTIVITY', 'HIRING_TEAM_CHANGE'], problemAltitude: ['PIPELINE', 'CONVERSION', 'OCCUPANCY'], offers: ['LOCAL_BENCHMARK'], confidence: 'L' },
  { industry: 'E_COMMERCE', triggers: ['CATALOG_TRAFFIC_MARKET_EXPANSION', 'HIRING'], problemAltitude: ['CONVERSION', 'CAC', 'RETURNS', 'OPS'], offers: ['TEARDOWN'], confidence: 'L_M' },
  { industry: 'HOSPITALITY', triggers: ['OPENINGS', 'REVIEWS', 'SEASONALITY', 'OCCUPANCY_SIGNALS'], problemAltitude: ['OCCUPANCY', 'REVENUE', 'LABOR'], offers: ['LOCAL_DIAGNOSTIC'], confidence: 'L' },
  { industry: 'LEGAL', triggers: ['PRACTICE_EXPANSION', 'LATERAL_HIRES', 'REGULATION'], problemAltitude: ['CASE_ACQUISITION', 'UTILIZATION', 'OPERATIONS'], offers: ['BENCHMARK'], confidence: 'L' },
  { industry: 'EDUCATION', triggers: ['ENROLLMENT_CYCLE', 'PROGRAM_LAUNCH', 'FUNDING'], problemAltitude: ['ENROLLMENT', 'RETENTION', 'OPERATIONS'], offers: ['DIAGNOSTIC'], confidence: 'L' },
  { industry: 'CONSTRUCTION', triggers: ['BIDS_PROJECTS', 'HIRING', 'GEOGRAPHIC_EXPANSION'], problemAltitude: ['PIPELINE', 'UTILIZATION', 'SCHEDULING'], offers: ['PROJECT_BENCHMARK'], confidence: 'L' }
]);

export const UBEROUTBOUND_CTA_TOURNAMENT = freezeRows([
  { ctaClass: 'MAKE_AN_OFFER', reportedRelativeReplyAssociation: 0.28, v1Treatment: 'CHALLENGER', evidenceState: UBEROUTBOUND_EVIDENCE_STATES.PROBABLE },
  { ctaClass: 'ASK_FOR_INTEREST', reportedRelativeReplyAssociation: 0.07, v1Treatment: 'CHALLENGER_OR_CONTROL', evidenceState: UBEROUTBOUND_EVIDENCE_STATES.PROBABLE },
  { ctaClass: 'ASK_PROSPECT_TO_ARTICULATE_PROBLEM', reportedRelativeReplyAssociation: -0.29, v1Treatment: 'GENERALLY_AVOID_FIRST_TOUCH', evidenceState: UBEROUTBOUND_EVIDENCE_STATES.PROBABLE },
  { ctaClass: 'DIRECT_MEETING_ASK', reportedRelativeReplyAssociation: -0.44, v1Treatment: 'RESERVE_FOR_HIGHER_INTENT_AND_TEST', evidenceState: UBEROUTBOUND_EVIDENCE_STATES.PROBABLE }
]);

export const UBEROUTBOUND_SEQUENCE_STATE_MACHINE = freezeRows([
  { state: 'TOUCH_ONE', action: 'HIGHEST_CONFIDENCE_TRIGGER_PROBLEM_PLUS_STRONGEST_OFFER_HYPOTHESIS' },
  { state: 'NO_RESPONSE_NO_NEGATIVE_SIGNAL', action: 'ADD_NEW_INFORMATION_NOT_RESTATEMENT' },
  { state: 'ENGAGEMENT_NO_REPLY', action: 'ADJUST_CONTEXT_OR_OFFER_DO_NOT_INFER_BUYING_INTENT_FROM_OPENS' },
  { state: 'FRESH_TRIGGER', action: 'CONTEXTUAL_REENTRY' },
  { state: 'EXPLICIT_NO_OR_UNSUBSCRIBE', action: 'IMMEDIATE_GLOBAL_SUPPRESSION' },
  { state: 'COMPLAINT_OR_REPUTATION_DETERIORATION', action: 'REDUCE_OR_FREEZE_AFFECTED_SENDER_PATH' },
  { state: 'MARGINAL_SEQUENCE_RESPONSE_COLLAPSES', action: 'STOP_AND_MOVE_TO_GOVERNED_NURTURE' },
  { state: 'QUALIFIED_REPLY', action: 'EXIT_COLD_AUTOMATION_TO_REPLY_OPPORTUNITY_POLICY' }
]);

export const UBEROUTBOUND_CLAIM_MATRIX = freezeRows([
  { id: 'length-le-100', claim: '<=100 words is a strong prior', support: 'Gong 28M+ and 85M+', limitation: 'older practitioner/vendor guidance sometimes favors 25-50; causality unresolved', state: UBEROUTBOUND_EVIDENCE_STATES.PROBABLE },
  { id: 'sentences-3-4', claim: '3-4 sentences is a strong prior', support: 'Gong', limitation: 'segment interactions unknown', state: UBEROUTBOUND_EVIDENCE_STATES.PROBABLE },
  { id: 'offer-vs-meeting', claim: 'Offer CTA beats direct meeting ask as a first-touch prior', support: 'Gong guide', limitation: 'observational assignment', state: UBEROUTBOUND_EVIDENCE_STATES.PROBABLE },
  { id: 'product-pitching', claim: 'Product pitching hurts first-touch response', support: 'Gong', limitation: 'some technical audiences need mechanism detail', state: UBEROUTBOUND_EVIDENCE_STATES.PROBABLE },
  { id: 'personalization-seniority', claim: 'Personalization differs by seniority', support: 'Gong personalization study', limitation: 'warmth confounding', state: UBEROUTBOUND_EVIDENCE_STATES.PROBABLE },
  { id: 'activity-signal', claim: 'Activity signals are valuable for targeting', support: 'Gong', limitation: 'signal may select already-warm leads; copy effect unclear', state: UBEROUTBOUND_EVIDENCE_STATES.PROBABLE },
  { id: 'short-subject', claim: 'Short subjects are a good prior', support: 'Gong executive/85M work', limitation: 'opens can diverge from replies', state: UBEROUTBOUND_EVIDENCE_STATES.PROBABLE },
  { id: 'opens-not-terminal', claim: 'Open rate should not be a terminal metric', support: 'Google plus Gong', limitation: 'still useful diagnostically', state: UBEROUTBOUND_EVIDENCE_STATES.STRONG_INFERENCE },
  { id: 'followup-matters', claim: 'Follow-up matters', support: 'Gong/30MPC', limitation: 'exact optimal cadence varies', state: UBEROUTBOUND_EVIDENCE_STATES.PROBABLE },
  { id: 'multichannel-add-value', claim: 'Multichannel can add value', support: 'Outreach and Gong-derived voicemail study', limitation: 'weaker causal identification', state: UBEROUTBOUND_EVIDENCE_STATES.SPECULATIVE },
  { id: 'global-industry-policy-bad', claim: 'One global industry policy is inadequate', support: 'Lavender segment heterogeneity', limitation: 'vendor-defined population', state: UBEROUTBOUND_EVIDENCE_STATES.PROBABLE },
  { id: 'auth-complaint-hard-gates', claim: 'Authentication and complaint constraints are hard gates', support: 'Google/Yahoo/Microsoft', limitation: 'none', state: UBEROUTBOUND_EVIDENCE_STATES.PROVEN_NORMATIVE },
  { id: 'jurisdiction-per-recipient', claim: 'Jurisdiction must be evaluated per recipient', support: 'regulators/law', limitation: 'legal facts vary', state: UBEROUTBOUND_EVIDENCE_STATES.PROVEN_NORMATIVE },
  { id: 'capacity-not-quota', claim: '100k capacity should not force 100k sends', support: 'provider complaint/reputation regime', limitation: 'exact optimum unknown', state: UBEROUTBOUND_EVIDENCE_STATES.STRONG_INFERENCE }
]);

export const UBEROUTBOUND_CONTRADICTION_MAP = freezeRows([
  { dimension: 'LENGTH', sideA: 'Gong 85M+: 51-100 word bin highest displayed reply', sideB: 'older practitioner/vendor guidance sometimes favors 25-50', resolution: 'resolve conditionally by persona/industry and randomized trial' },
  { dimension: 'PERSONALIZATION', sideA: 'Gong: personalization type varies by seniority', sideB: 'activity-personalized leads are inherently warmer', resolution: 'separate targeting/selection effect from message mention effect' },
  { dimension: 'CADENCE', sideA: 'Gong/30MPC: roughly 6-7 emails before steep diminishing returns', sideB: 'Outreach 2026 favors shorter/adaptive behavior-driven cadences', resolution: 'no universal cadence; estimate marginal sequence value' },
  { dimension: 'SUBJECT_OPEN_RATE', sideA: 'short/novel subjects can lift opens', sideB: 'some open-lifting tactics reduce reply quality', resolution: 'do not optimize opens as terminal objective' },
  { dimension: 'CTA', sideA: 'offer/interest CTAs outperform direct meeting asks observationally', sideB: 'higher-intent buyers may be ready for direct scheduling', resolution: 'condition CTA policy on intent state' }
]);

export const UBEROUTBOUND_DELIVERABILITY_CONSTITUTION = freezeRows([
  { rule: 'AUTHENTICATION', treatment: 'SPF/DKIM/DMARC and applicable alignment are hard gates at relevant scale', evidenceState: UBEROUTBOUND_EVIDENCE_STATES.PROVEN_NORMATIVE },
  { rule: 'DNS_TRANSPORT', treatment: 'forward/reverse DNS/PTR and TLS must be healthy where provider policy requires them', evidenceState: UBEROUTBOUND_EVIDENCE_STATES.PROVEN_NORMATIVE },
  { rule: 'REPUTATION_LEVELS', treatment: 'track mailbox, domain, IP/route and recipient-provider health separately', evidenceState: UBEROUTBOUND_EVIDENCE_STATES.STRONG_INFERENCE },
  { rule: 'COMPLAINT_BUDGET', treatment: 'internal warning threshold must remain materially below provider failure thresholds', evidenceState: UBEROUTBOUND_EVIDENCE_STATES.STRONG_INFERENCE },
  { rule: 'UNSUBSCRIBE', treatment: 'applicable one-click/body unsubscribe plus immediate global suppression', evidenceState: UBEROUTBOUND_EVIDENCE_STATES.PROVEN_NORMATIVE },
  { rule: 'RAMPING', treatment: 'start low, send wanted/relevant traffic, monitor responses/reputation, increase gradually; no artificial warm-up network', evidenceState: UBEROUTBOUND_EVIDENCE_STATES.PROVEN_NORMATIVE },
  { rule: 'RECIPIENT_PROVIDER_BUDGETS', treatment: 'Gmail/Yahoo/Microsoft maintain independent health and budget state', evidenceState: UBEROUTBOUND_EVIDENCE_STATES.STRONG_INFERENCE },
  { rule: 'QUALITY_FLOOR', treatment: 'target-volume controller may never lower ICP/evidence threshold to fill capacity', evidenceState: UBEROUTBOUND_EVIDENCE_STATES.STRONG_INFERENCE }
]);

export const UBEROUTBOUND_LEGAL_MATRIX = freezeRows([
  { jurisdiction: 'US', defaultPolicy: 'PERMIT_ONLY_AFTER_CAN_SPAM_FIELDS_AND_SUPPRESSION_PASS', confidence: 'VH', state: UBEROUTBOUND_EVIDENCE_STATES.PROVEN_NORMATIVE },
  { jurisdiction: 'EU_EEA', defaultPolicy: 'RESOLVE_COUNTRY_SUBSCRIBER_TYPE_AND_NATIONAL_EPRIVACY_IMPLEMENTATION_BEFORE_SEND', confidence: 'VH', state: UBEROUTBOUND_EVIDENCE_STATES.PROVEN_NORMATIVE },
  { jurisdiction: 'UK', defaultPolicy: 'CORPORATE_RECIPIENT_MAY_BE_ELIGIBLE_AFTER_GDPR_PECR_CHECK_SOLE_TRADER_INDIVIDUAL_REQUIRES_CONSENT_OR_APPLICABLE_SOFT_OPT_IN', confidence: 'VH', state: UBEROUTBOUND_EVIDENCE_STATES.PROVEN_NORMATIVE },
  { jurisdiction: 'CANADA', defaultPolicy: 'DEFAULT_DENY_WITHOUT_RECORDED_CONSENT_OR_QUALIFYING_STATUTORY_BASIS', confidence: 'VH', state: UBEROUTBOUND_EVIDENCE_STATES.PROVEN_NORMATIVE },
  { jurisdiction: 'AUSTRALIA', defaultPolicy: 'DEFAULT_DENY_WITHOUT_DOCUMENTED_CONSENT_BASIS_REJECT_HARVESTED_SOURCES', confidence: 'VH', state: UBEROUTBOUND_EVIDENCE_STATES.PROVEN_NORMATIVE },
  { jurisdiction: 'UAE', defaultPolicy: 'STRICT_DEFAULT_REQUIRE_RECORDED_APPLICABLE_BASIS_AND_CAMPAIGN_SPECIFIC_LEGAL_REVIEW', confidence: 'H', state: UBEROUTBOUND_EVIDENCE_STATES.PROVEN_NORMATIVE },
  { jurisdiction: 'SAUDI_ARABIA', defaultPolicy: 'DEFAULT_DENY_COLD_DIRECT_MARKETING_WITHOUT_AUDITABLE_CONSENT', confidence: 'VH', state: UBEROUTBOUND_EVIDENCE_STATES.PROVEN_NORMATIVE },
  { jurisdiction: 'EGYPT', defaultPolicy: 'STRICT_CONSENT_FIRST_DEFAULT_PENDING_CAMPAIGN_SPECIFIC_REVIEW', confidence: 'H', state: UBEROUTBOUND_EVIDENCE_STATES.PROVEN_NORMATIVE },
  { jurisdiction: 'SWITZERLAND', defaultPolicy: 'CONSENT_OR_APPLICABLE_EXISTING_CUSTOMER_EXCEPTION_REQUIRED', confidence: 'VH', state: UBEROUTBOUND_EVIDENCE_STATES.PROVEN_NORMATIVE }
]);

export const UBEROUTBOUND_EXPERIMENT_PROTOCOL = Object.freeze({
  assignmentUnit: 'ACCOUNT_OR_RECIPIENT',
  rules: Object.freeze([
    'RANDOMIZE_AT_ACCOUNT_OR_RECIPIENT_LEVEL_WHEN_REPEAT_EXPOSURE_IS_POSSIBLE',
    'PREDECLARE_PRIMARY_OUTCOME_AND_TREATMENT_DIMENSION',
    'KEEP_ONE_PRIMARY_OUTCOME_PER_CORE_CAUSAL_QUESTION',
    'USE_HIERARCHICAL_PARTIAL_POOLING_FOR_SMALL_SEGMENTS',
    'INTRODUCE_CONTEXTUAL_BANDITS_ONLY_AFTER_CAUSAL_BASELINES',
    'CONSTRAIN_BANDITS_BY_LEGAL_REPUTATION_MINIMUM_EXPLORATION_AND_DELAYED_REVENUE',
    'CONTROL_MULTIPLE_TESTING_WITH_SHRINKAGE_OR_FDR_AND_UNTOUCHED_VALIDATION_TRAFFIC',
    'KEEP_PERSISTENT_HOLDOUTS_FOR_INCREMENTALITY',
    'STRATIFY_OR_BLOCK_ON_SENDER_DOMAIN_ROUTE_HEALTH_TO_AVOID_INFRASTRUCTURE_CONFOUNDING'
  ])
});

export const UBEROUTBOUND_VISIBLE_PRIORITY_HYPOTHESES = Object.freeze([
  'OFFER_CTA_BEATS_DIRECT_MEETING_ASK_ON_FIRST_COLD_TOUCH',
  'WORDS_51_TO_100_BEATS_101_TO_200',
  'SENTENCES_3_TO_4_BEATS_LONGER_STRUCTURES',
  'PROBLEM_FIRST_BEATS_SOLUTION_FIRST',
  'COMPANY_PERSONALIZATION_BEATS_INDIVIDUAL_FOR_DIRECTOR_PLUS',
  'INDIVIDUAL_OR_WORKFLOW_PERSONALIZATION_BEATS_COMPANY_FOR_IC',
  'TRIGGER_SELECTION_EFFECT_EXCEEDS_TRIGGER_MENTION_EFFECT',
  'RELEVANT_SOCIAL_PROOF_BEATS_FAMOUS_GENERIC_LOGO',
  'ONE_STRONG_CAUSAL_TRIGGER_BEATS_MULTIPLE_WEAK_PERSONALIZATION_FACTS',
  'NEW_INFORMATION_FOLLOWUP_BEATS_JUST_BUMPING_THIS',
  'SIX_OR_SEVEN_EMAIL_ADAPTIVE_POLICY_BEATS_ONE_OR_TWO_MESSAGE_ABANDONMENT',
  'INTENT_CONDITIONED_CTA_BEATS_ONE_GLOBAL_CTA',
  'SEGMENT_MODEL_BEATS_UNIVERSAL_MESSAGE_MODEL',
  'REVENUE_TRAINED_POLICY_BEATS_REPLY_TRAINED_POLICY',
  'QUALIFIED_INVENTORY_CAP_BEATS_VOLUME_QUOTA'
]);

export const UBEROUTBOUND_VISIBLE_UNKNOWN_UNKNOWNS = Object.freeze([
  'CLOSED_WON_LOOKALIKE_TARGETING_MAY_TRAP_SYSTEM_INSIDE_YESTERDAYS_MARKET',
  'ACCOUNT_VALUE_THRESHOLD_FOR_EXPENSIVE_AI_RESEARCH',
  'WHICH_TRIGGERS_PREDICT_ACTUAL_PAIN_VS_ACTIVITY',
  'TRIGGER_DECAY_CURVE_BY_CLASS',
  'SOME_TRIGGERS_MAY_BE_TOO_FRESH_TO_CONTACT_IMMEDIATELY',
  'PERSONALIZATION_CREEPINESS_THRESHOLD',
  'RECIPIENT_AI_RESEARCH_DETECTION_AFTER_QUALITY_CONTROL',
  'MARGINAL_RETURN_PER_COMPUTE_DOLLAR_OR_RESEARCH_MINUTE',
  'LENGTH_OPTIMUM_MAY_BE_SENDER_SKILL_CONFOUNDED',
  'WHICH_MESSAGE_ATOM_CARRIES_MOST_CAUSAL_VALUE',
  'WHICH_SOCIAL_PROOF_SIMILARITY_DIMENSION_MATTERS_MOST',
  'OFFER_CTA_MAY_RAISE_REPLIES_BUT_REDUCE_WILLINGNESS_TO_PAY',
  'MARGINAL_REPUTATION_COST_OF_LATE_FOLLOWUPS',
  'OMNICHANNEL_EFFECTS_MAY_REFLECT_GOOD_REP_CONFOUNDING',
  'DOMAIN_REPUTATION_TRANSFER_ACROSS_RELATED_IDENTITIES',
  'RECIPIENT_PROVIDER_REPUTATION_WEIGHTING_BY_SENDER_MATURITY',
  'INTERNAL_COMPLAINT_THRESHOLD_FOR_LIFETIME_QUALIFIED_DELIVERY',
  'COPY_PERFORMANCE_VS_SENDER_HEALTH_CONFOUNDING',
  'EU_COUNTRY_BY_COUNTRY_EPRIVACY_AUTOMATION',
  'QUALIFIED_LEGAL_INVENTORY_MAY_BIND_BELOW_INFRASTRUCTURE_CAPACITY',
  'AI_STRUCTURAL_MONOCULTURE_AT_INDUSTRIAL_SCALE',
  'AUTONOMOUS_EARLY_WARNING_SIGNAL_FOR_CAPACITY_CONTRACTION'
]);

export const UBEROUTBOUND_RESEARCH_GAPS = Object.freeze([
  'CAUSALITY', 'DOWN_FUNNEL_TRUTH', 'TARGET_QUALITY_ELASTICITY', 'REPUTATION_ECONOMICS',
  'OFFER_MARKET_INTERACTION', 'GLOBAL_LEGAL_AUTOMATION', 'AI_MONOCULTURE_RISK', 'OPTIMAL_ABSTENTION',
  'COUNTERFACTUAL_INCREMENTALITY', 'MAXIMUM_STABLE_DAILY_OPPORTUNITY_PROCESSING'
]);

export const UBEROUTBOUND_ROADMAP_PHASES = Object.freeze([
  'FOUNDATION', 'MESSAGE_GENOME', 'TARGETING_GENOME', 'SEGMENT_INTELLIGENCE',
  'SEQUENCE_INTELLIGENCE', 'ECONOMIC_OPTIMIZATION', 'GOVERNED_SCALE'
]);

export const UBEROUTBOUND_MISSING_EXTERNAL_RESEARCH_ASSETS = Object.freeze([
  'COMPLETE_SOURCE_LEDGER_CSV_26_CORE_SOURCES',
  '71_EXPERT_RESEARCH_UNIVERSE_CSV',
  'COMPLETE_CLAIM_MATRIX_CSV',
  'TOP_100_TESTABLE_HYPOTHESES_CSV',
  'TOP_50_UNKNOWN_UNKNOWNS_CSV',
  'EXPERIMENT_SAMPLE_SIZE_CSV',
  'CONSOLIDATED_MACHINE_READABLE_DATASET_JSON',
  'GENOME_SCHEMA_JSON',
  'COMPLETE_RESEARCH_PACK_ZIP'
]);

function normalizeSeniority(value) {
  const raw = upper(value);
  if (['CEO', 'CFO', 'COO', 'CMO', 'CRO', 'CTO', 'CIO', 'CHRO', 'C_SUITE', 'EXECUTIVE'].includes(raw)) return 'C_SUITE';
  if (raw.includes('VP') || raw.includes('VICE PRESIDENT') || raw === 'HEAD') return 'VP_HEAD';
  if (raw.includes('DIRECTOR')) return 'DIRECTOR';
  if (raw.includes('MANAGER')) return 'MANAGER';
  if (raw) return 'IC';
  return 'UNKNOWN';
}

function normalizeDepartment(value) {
  const raw = upper(value).replace(/[&/ -]+/g, '_');
  if (raw.includes('FINANCE') || raw.includes('ACCOUNTING')) return 'FINANCE';
  if (raw.includes('OPERATIONS') || raw === 'OPS') return 'OPERATIONS';
  if (raw === 'HR' || raw.includes('HUMAN_RESOURCES') || raw.includes('PEOPLE')) return 'HR';
  if (raw.includes('ENGINEERING') || raw.includes('PRODUCT')) return 'ENGINEERING_PRODUCT';
  if (raw.includes('SALES') || raw.includes('MARKETING') || raw.includes('REVENUE')) return 'SALES_MARKETING';
  return raw || 'UNKNOWN';
}

function normalizeIndustry(value) {
  const raw = upper(value).replace(/[&/ -]+/g, '_');
  const aliases = {
    SOFTWARE_AS_A_SERVICE: 'SAAS',
    PROFESSIONAL_SERVICE: 'PROFESSIONAL_SERVICES',
    AGENCY: 'AGENCIES',
    CLINIC: 'CLINICS',
    MEDSPA: 'MEDSPAS',
    FINANCE: 'FINANCIAL_SERVICES',
    ECOMMERCE: 'E_COMMERCE',
    REALTY: 'REAL_ESTATE'
  };
  return aliases[raw] || raw || 'UNKNOWN';
}

export function compileUberOutboundContextPolicy({ seniority = null, department = null, industry = null, intentState = 'COLD' } = {}) {
  const seniorityKey = normalizeSeniority(seniority);
  const departmentKey = normalizeDepartment(department);
  const industryKey = normalizeIndustry(industry);
  const seniorityPolicy = UBEROUTBOUND_SEGMENT_POLICIES.find(row => row.dimension === 'SENIORITY' && row.key === seniorityKey) || null;
  const departmentPolicy = UBEROUTBOUND_SEGMENT_POLICIES.find(row => row.dimension === 'DEPARTMENT' && row.key === departmentKey) || null;
  const industryPolicy = UBEROUTBOUND_INDUSTRY_POLICIES.find(row => row.industry === industryKey) || null;
  const intent = upper(intentState) || 'COLD';
  const ctaPolicy = intent === 'HIGH_INTENT' || intent === 'QUALIFIED_POSITIVE_REPLY'
    ? ['DIRECT_NEXT_STEP', 'SCHEDULING']
    : ['MAKE_AN_OFFER', 'ASK_FOR_INTEREST', 'SEND_ASSET', 'BENCHMARK'];

  return {
    version: UBEROUTBOUND_POLICY_REGISTRY_VERSION,
    seniorityKey,
    departmentKey,
    industryKey,
    intentState: intent,
    seniorityPolicy,
    departmentPolicy,
    industryPolicy,
    ctaPolicy,
    evidenceState: industryPolicy?.confidence?.startsWith('L')
      ? UBEROUTBOUND_EVIDENCE_STATES.SPECULATIVE
      : UBEROUTBOUND_EVIDENCE_STATES.PROBABLE,
    externalEffectAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    truthBoundary: 'This is evidence-weighted retrieval of report-visible policy priors. It is not proof that the selected policy causes better outcomes and never creates contact authority.'
  };
}

export function compileUberOutboundSequenceDecision({
  state = 'TOUCH_ONE',
  unsubscribed = false,
  explicitNo = false,
  complaint = false,
  reputationDeterioration = false,
  qualifiedReply = false,
  freshTrigger = false,
  marginalSequenceValueState = 'UNKNOWN'
} = {}) {
  let action;
  let reason;
  if (unsubscribed || explicitNo) {
    action = 'IMMEDIATE_GLOBAL_SUPPRESSION';
    reason = 'suppression-dominates-sequence-optimization';
  } else if (complaint || reputationDeterioration) {
    action = 'REDUCE_OR_FREEZE_AFFECTED_SENDER_PATH';
    reason = 'reputation-guardrail';
  } else if (qualifiedReply) {
    action = 'EXIT_COLD_AUTOMATION_TO_REPLY_OPPORTUNITY_POLICY';
    reason = 'qualified-reply';
  } else if (upper(marginalSequenceValueState) === 'COLLAPSED' || upper(marginalSequenceValueState) === 'NEGATIVE') {
    action = 'STOP_AND_MOVE_TO_GOVERNED_NURTURE';
    reason = 'marginal-sequence-value-collapsed';
  } else if (freshTrigger) {
    action = 'CONTEXTUAL_REENTRY';
    reason = 'fresh-trigger';
  } else if (upper(state) === 'NO_RESPONSE_NO_NEGATIVE_SIGNAL') {
    action = 'ADD_NEW_INFORMATION_NOT_RESTATEMENT';
    reason = 'no-response';
  } else if (upper(state) === 'ENGAGEMENT_NO_REPLY') {
    action = 'ADJUST_CONTEXT_OR_OFFER_DO_NOT_INFER_BUYING_INTENT_FROM_OPENS';
    reason = 'engagement-without-reply';
  } else {
    action = 'HIGHEST_CONFIDENCE_TRIGGER_PROBLEM_PLUS_STRONGEST_OFFER_HYPOTHESIS';
    reason = 'touch-one-or-unknown-state';
  }

  return {
    version: UBEROUTBOUND_POLICY_REGISTRY_VERSION,
    action,
    reason,
    externalEffectAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    truthBoundary: 'Sequence output is a zero-authority policy recommendation. No message is sent and opens alone never create buying-intent truth.'
  };
}

function structuralFingerprint(genotype = {}) {
  const atoms = genotype.atoms || genotype.genotypeAtoms || {};
  return [
    atoms.subject?.architecture,
    atoms.opening?.architecture,
    atoms.problem?.architecture,
    atoms.offer?.type,
    atoms.cta?.type,
    atoms.tone?.type,
    atoms.sequence?.position
  ].map(value => clean(value, 120)).join('|');
}

export function compileUberOutboundMonocultureAudit({ genotypes = [], policy = {} } = {}) {
  const rows = (Array.isArray(genotypes) ? genotypes : []).filter(Boolean);
  const fingerprints = rows.map(structuralFingerprint);
  const nonEmpty = fingerprints.filter(value => value.replaceAll('|', '').length > 0);
  const total = rows.length;
  const uniqueGenotypeIds = unique(rows.map(row => row.genotypeId)).length;
  const uniqueFingerprints = unique(nonEmpty).length;
  const structuralDiversityRatio = total ? uniqueFingerprints / total : 0;
  const genotypeDiversityRatio = total ? uniqueGenotypeIds / total : 0;
  const minStructuralDiversityRatio = Number.isFinite(Number(policy.minStructuralDiversityRatio))
    ? Math.max(0, Math.min(1, Number(policy.minStructuralDiversityRatio)))
    : null;
  const flagged = minStructuralDiversityRatio != null && total >= 5 && structuralDiversityRatio < minStructuralDiversityRatio;

  return {
    version: UBEROUTBOUND_POLICY_REGISTRY_VERSION,
    sampleSize: total,
    uniqueGenotypeIds,
    uniqueStructuralFingerprints: uniqueFingerprints,
    genotypeDiversityRatio: Number(genotypeDiversityRatio.toFixed(4)),
    structuralDiversityRatio: Number(structuralDiversityRatio.toFixed(4)),
    state: flagged ? 'MONOCULTURE_RISK_CANDIDATE' : total < 5 ? 'INSUFFICIENT_SAMPLE' : 'OBSERVABILITY_ONLY',
    evidenceState: UBEROUTBOUND_EVIDENCE_STATES.SPECULATIVE,
    externalEffectAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    truthBoundary: 'Structural sameness is an explicitly identified research risk, not a proven provider or conversion threshold. This audit observes strategy diversity and only flags against an explicitly supplied policy threshold.'
  };
}

export function compileUberOutboundResearchCoverage() {
  const expertCount = Object.values(UBEROUTBOUND_EXPERT_RESEARCH_COUNCIL).reduce((sum, rows) => sum + rows.length, 0);
  return {
    version: UBEROUTBOUND_POLICY_REGISTRY_VERSION,
    reportCutoff: '2026-09-14',
    reportVisible: {
      visibleSourceLedgerRows: UBEROUTBOUND_VISIBLE_SOURCE_LEDGER.length,
      reportedFullSourceLedgerRows: 26,
      expertResearchUniverseRows: expertCount,
      triggerRows: UBEROUTBOUND_TRIGGER_TAXONOMY.length,
      offerRows: UBEROUTBOUND_OFFER_TAXONOMY.length,
      segmentRows: UBEROUTBOUND_SEGMENT_POLICIES.length,
      industryRows: UBEROUTBOUND_INDUSTRY_POLICIES.length,
      ctaRows: UBEROUTBOUND_CTA_TOURNAMENT.length,
      sequenceRows: UBEROUTBOUND_SEQUENCE_STATE_MACHINE.length,
      claimRowsVisible: UBEROUTBOUND_CLAIM_MATRIX.length,
      contradictionRows: UBEROUTBOUND_CONTRADICTION_MAP.length,
      legalJurisdictions: UBEROUTBOUND_LEGAL_MATRIX.length,
      experimentProtocolRules: UBEROUTBOUND_EXPERIMENT_PROTOCOL.rules.length,
      visiblePriorityHypotheses: UBEROUTBOUND_VISIBLE_PRIORITY_HYPOTHESES.length,
      reportedFullHypotheses: 100,
      visibleUnknownUnknowns: UBEROUTBOUND_VISIBLE_UNKNOWN_UNKNOWNS.length,
      reportedFullUnknownUnknowns: 50,
      researchGaps: UBEROUTBOUND_RESEARCH_GAPS.length
    },
    externalResearchAssetsPending: [...UBEROUTBOUND_MISSING_EXTERNAL_RESEARCH_ASSETS],
    state: 'REPORT_VISIBLE_CORPUS_COMPLETE_EXTERNAL_DOWNLOADS_PENDING',
    externalEffectAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    truthBoundary: 'The founder-supplied PDF is fully represented for the material visible in the document. The PDF explicitly references downloadable rows not embedded in the file; those remain pending rather than being reconstructed from guesses.'
  };
}
