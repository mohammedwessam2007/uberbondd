import crypto from 'node:crypto';
import { CANONICAL_OPPORTUNITY_REGISTRY_SCHEMA_VERSION } from './opportunity-registry.mjs';

export const AI_ACCESS_OPPORTUNITY_POLICY_VERSION = 'ai-access-opportunity-registry-1.0.0';

export const AI_ACCESS_UNIVERSE_POLICY_VERSION = 'ai-access-opportunity-universe-2.0.0';
export const AI_ACCESS_UNIVERSE_FAMILIES = Object.freeze([
  'consumer_student_plans',
  'student_developer_bundles',
  'regional_education_programs',
  'api_free_tiers',
  'developer_credits',
  'cloud_free_tiers',
  'startup_cloud_credits',
  'ai_startup_cloud_credits',
  'startup_inference_credits',
  'startup_gpu_credits',
  'startup_database_credits',
  'startup_partner_benefits',
  'open_source_benefits',
  'open_source_compute_credits',
  'research_api_credits',
  'research_grants',
  'academic_gpu_credits',
  'science_grants',
  'model_builder_grants',
  'startup_partner_credits'
]);
export const AI_ACCESS_FAMILY_ROUTE_IDS = Object.freeze({
  consumer_student_plans: ['google-ai-pro-us-student-2026'],
  student_developer_bundles: ['github-student-developer-pack'],
  regional_education_programs: ['aws-kiro-singapore-ihl', 'kiro-student-university-list'],
  api_free_tiers: ['gemini-api-free-tier', 'groq-free-plan', 'openrouter-free-models'],
  developer_credits: ['amd-ai-developer-program', 'elevenlabs-api-credits'],
  cloud_free_tiers: ['aws-new-customer-free-tier', 'azure-for-students'],
  startup_cloud_credits: ['google-startups-pre-funded', 'google-startups-early-stage', 'aws-activate-founder', 'digitalocean-hatch', 'oracle-startup-growth-engine-latam'],
  ai_startup_cloud_credits: ['google-cloud-ai-startup-program'],
  startup_inference_credits: ['together-ai-startup-accelerator', 'fireworks-startups'],
  startup_gpu_credits: ['modal-startups'],
  startup_database_credits: ['mongodb-for-startups'],
  startup_partner_benefits: ['google-cloud-startup-perks'],
  open_source_benefits: ['openai-codex-open-source'],
  open_source_compute_credits: ['ona-open-source'],
  research_api_credits: ['openai-researcher-api', 'anthropic-external-researcher-access'],
  research_grants: ['openai-cybersecurity-grant'],
  academic_gpu_credits: ['modal-academics'],
  science_grants: ['anthropic-ai-for-science-program', 'anthropic-rare-disease-grants'],
  model_builder_grants: ['arcee-trinity-builders'],
  startup_partner_credits: ['openai-for-startups', 'anthropic-vc-partner-program']
});

export const AI_ACCESS_REFERENCE_DATE = '2026-08-21';
export const AI_ACCESS_CLAIM_CLASSES = Object.freeze([
  'VERIFIED_FACT',
  'COMPANY_CLAIM',
  'INFERENCE',
  'ESTIMATE',
  'HYPOTHESIS',
  'OWNER_REVIEW_REQUIRED',
  'UNRESOLVED'
]);

export const AI_ACCESS_STATUSES = Object.freeze([
  'FREE_TIER_AVAILABLE',
  'OWNER_REVIEW_REQUIRED',
  'APPLICATION_REQUIRED',
  'EXPIRED',
  'PROGRAM_CLOSED',
  'NOT_MATCHED_TO_PUBLISHED_LIST',
  'NOT_ELIGIBLE_GIVEN_CONTEXT',
  'DENIED_ACCOUNT_FARMING',
  'ALREADY_CONSUMED_OR_CHECK_REQUIRED',
  'UNKNOWN_OPPORTUNITY'
]);

const ZERO_EXTERNAL_EFFECTS = Object.freeze({
  providerCalls: 0,
  messages: 0,
  purchases: 0,
  deployments: 0,
  credentialChanges: 0,
  dnsChanges: 0,
  productionMutations: 0,
  spendCents: 0
});

const DEFAULT_OWNER_STEPS = Object.freeze([
  'Verify your own identity, eligibility, institution, company, or research status with the provider.',
  'Review current terms, privacy treatment, expiry, one-per-person rules, and auto-renewal before accepting.',
  'Create or confirm the provider account, payment method, API key, or application submission yourself.'
]);

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function validDate(value) {
  const candidate = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isNaN(candidate.getTime()) ? new Date() : candidate;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function record(definition) {
  return {
    ...definition,
    policy: {
      consequenceClass: 'LOCAL_PREPARATION',
      externalEffects: [],
      automaticApplication: false,
      automaticAccountCreation: false,
      automaticCredentialUse: false,
      accountFarming: 'DENY',
      ...definition.policy
    },
    ownerOnlySteps: definition.ownerOnlySteps || [...DEFAULT_OWNER_STEPS],
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
}

const PACK_BENEFITS = [
  'GitHub Pro',
  'GitHub Codespaces',
  'GitHub Actions',
  'Azure student credits',
  'Heroku credit',
  'MongoDB credit',
  'Datadog Pro',
  'Camber credits',
  'Clerk Pro',
  'Appwrite',
  'Sentry',
  'New Relic',
  'LambdaTest',
  '1Password',
  'domains',
  'Stripe fee waiver',
  'Notion Education and AI responses',
  'Microsoft 365 student benefits'
];

const RAW_OPPORTUNITIES = [
  record({
    id: 'google-ai-pro-us-student-2026',
    provider: 'Google',
    name: 'Google AI Pro student offer',
    kind: 'subscription_trial',
    regions: ['US'],
    officialUrl: 'https://gemini.google/students/',
    lastVerifiedOn: '2026-08-21',
    expiresOn: '2026-12-31',
    status: 'OWNER_REVIEW_REQUIRED',
    evidenceClass: 'VERIFIED_FACT',
    valueText: 'Google advertises one year of Google AI Pro at no charge for eligible US college students 18+ who redeem by the published deadline; a valid payment method and later auto-renewal terms apply.',
    eligibility: ['Genuine US college student eligibility', 'Age and institution verification', 'Valid payment method for the post-trial terms'],
    ownerOnlySteps: ['Confirm genuine US eligibility and complete Google verification.', 'Review the $19.99/month post-offer renewal and cancel before renewal if unwanted.', 'Redeem from the official offer page using your own Google account.'],
    safePreparation: ['Keep this as an eligibility-gated route.', 'Never infer US eligibility from IP, billing country, or a VPN.', 'Route non-sensitive experimentation to free API tiers until owner proof exists.'],
    dataRisk: 'Review Google AI plan data controls before using customer or secret material.',
    stackability: 'Do not assume stackability with another Google AI plan or trial.',
    onePerPerson: true,
    tags: ['gemini', 'student', 'us-only', 'high-value']
  }),
  record({
    id: 'google-ai-pro-egypt-student-2025-expired',
    provider: 'Google',
    name: 'Google AI Pro student campaign for Egypt and Saudi Arabia',
    kind: 'expired_student_campaign',
    regions: ['EG', 'SA'],
    officialUrl: 'https://blog.google/intl/en-mena/company-news/outreach-initiatives/free-gemini-pro-students-saudi-arabia-egypt/',
    lastVerifiedOn: '2026-08-21',
    expiresOn: '2025-11-03',
    status: 'EXPIRED',
    evidenceClass: 'VERIFIED_FACT',
    valueText: 'Google published a regional student campaign whose published redemption deadline was November 3, 2025; it is retained as historical context only.',
    eligibility: ['Historical Egypt or Saudi student eligibility did not preserve the expired deadline.'],
    ownerOnlySteps: ['No application: monitor the official Google student page for a new regional offer.', 'Do not submit an expired claim or use an old link as proof of current eligibility.'],
    safePreparation: ['Keep historical record separate from currently available offers.', 'Do not route production work to this record.'],
    dataRisk: 'Historical record only.',
    stackability: 'Not applicable while expired.',
    onePerPerson: true,
    tags: ['gemini', 'egypt', 'expired']
  }),
  record({
    id: 'google-ai-plans-egypt',
    provider: 'Google',
    name: 'Google AI plans in Egypt',
    kind: 'regional_subscription',
    regions: ['EG'],
    officialUrl: 'https://one.google.com/intl/ar_eg/about/google-ai-plans/',
    lastVerifiedOn: '2026-08-21',
    expiresOn: null,
    status: 'OWNER_REVIEW_REQUIRED',
    evidenceClass: 'VERIFIED_FACT',
    valueText: 'Google publishes AI plan availability for Egypt, including paid plan options and account/family-sharing rules subject to current terms.',
    eligibility: ['Egypt account and current plan availability', 'Owner choice to pay or use a trial if presented', 'Review of family-sharing and renewal rules'],
    ownerOnlySteps: ['Open the official Egypt plan page while signed into your own account.', 'Review current price, trial, renewal, and family-sharing terms.', 'Decide whether the paid plan is justified by measured UberBond contribution.'],
    safePreparation: ['Use free tiers for routing tests.', 'Keep plan selection and payment owner-gated.', 'Record provider, plan, price, and renewal only after owner confirmation.'],
    dataRisk: 'Do not place secrets or customer data into a consumer plan without reviewing provider controls.',
    stackability: 'Do not assume multiple Google plans stack.',
    onePerPerson: false,
    tags: ['gemini', 'egypt', 'paid-plan']
  }),
  record({
    id: 'gemini-api-free-tier',
    provider: 'Google',
    name: 'Gemini API and AI Studio free tier',
    kind: 'api_free_tier',
    regions: ['GLOBAL'],
    officialUrl: 'https://ai.google.dev/gemini-api/docs/pricing',
    lastVerifiedOn: '2026-08-21',
    expiresOn: null,
    status: 'FREE_TIER_AVAILABLE',
    evidenceClass: 'VERIFIED_FACT',
    valueText: 'Google publishes free-tier access for selected Gemini API models and separate limits for paid tiers and grounding; free-tier data-use terms require review.',
    eligibility: ['A Google AI Studio/API account in a supported region', 'Current model and rate-limit availability', 'No assumption that free-tier data is private'],
    ownerOnlySteps: ['Create or confirm your own AI Studio account and API key.', 'Review free-tier data-use and retention terms before sending any non-public material.', 'Set a hard quota and rotate/revoke the key yourself.'],
    safePreparation: ['Add Gemini as an optional model-router provider.', 'Use redacted synthetic fixtures only until a key and data policy are owner-approved.', 'Fail over when rate limits or quota are reached.'],
    dataRisk: 'Google states free-tier usage may be used to improve products; treat it as unsuitable for unredacted customer secrets.',
    stackability: 'Free API quota is provider-specific and does not imply plan credits.',
    onePerPerson: false,
    tags: ['gemini', 'api', 'free-tier', 'router']
  }),
  record({
    id: 'github-student-developer-pack',
    provider: 'GitHub Education',
    name: 'GitHub Student Developer Pack',
    kind: 'student_benefit_bundle',
    regions: ['GLOBAL'],
    officialUrl: 'https://education.github.com/pack/',
    lastVerifiedOn: '2026-08-21',
    expiresOn: null,
    status: 'OWNER_REVIEW_REQUIRED',
    evidenceClass: 'VERIFIED_FACT',
    valueText: 'GitHub Education publishes a student bundle with GitHub Pro and partner benefits. The current catalog should be checked at redemption because individual partner offers change.',
    includedBenefits: PACK_BENEFITS,
    eligibility: ['Genuine student status at an eligible institution', 'GitHub Education verification', 'Each partner may impose additional terms'],
    ownerOnlySteps: ['Complete GitHub Education verification with genuine enrollment evidence.', 'Accept only benefits you actually need; inspect each partner renewal and privacy rule.', 'Do not create duplicate accounts to multiply benefits.'],
    safePreparation: ['Map useful benefits to UberBond capability gaps without activating them.', 'Prioritize compute, observability, testing, and secrets hygiene.', 'Keep partner activation receipts owner-supplied.'],
    dataRisk: 'Partner-specific; review each provider before uploading data.',
    stackability: 'Partner benefits are not automatically stackable.',
    onePerPerson: true,
    tags: ['student', 'github', 'bundle', 'infrastructure']
  }),
  record({
    id: 'azure-for-students',
    provider: 'Microsoft Azure',
    name: 'Azure for Students',
    kind: 'cloud_student_credit',
    regions: ['GLOBAL'],
    officialUrl: 'https://learn.microsoft.com/en-us/azure/education-hub/about-azure-for-students',
    lastVerifiedOn: '2026-08-21',
    expiresOn: null,
    status: 'OWNER_REVIEW_REQUIRED',
    evidenceClass: 'VERIFIED_FACT',
    valueText: 'Microsoft documents $100 Azure credit for eligible students without requiring a credit card, with a one-year term and possible annual renewal while eligible.',
    eligibility: ['Eligible student identity and institutional verification', 'One subscription per eligible customer', 'Current country and education rules'],
    ownerOnlySteps: ['Verify student status with Microsoft using your own identity.', 'Accept Azure terms and review renewal/expiry.', 'Choose any deployment or spending beyond credit only after owner approval.'],
    safePreparation: ['Prepare an Azure adapter and budget caps only.', 'Do not create a subscription or deploy resources automatically.', 'Use shadow cost modeling before any cloud spend.'],
    dataRisk: 'Cloud credentials and customer data require owner-approved secret handling.',
    stackability: 'Separate from GitHub partner benefits; verify current terms.',
    onePerPerson: true,
    tags: ['student', 'azure', 'cloud', 'credit']
  }),
  record({
    id: 'google-cloud-student-skills',
    provider: 'Google Cloud',
    name: 'Google Cloud student skills credits',
    kind: 'training_credit',
    regions: ['GLOBAL'],
    officialUrl: 'https://cloud.google.com/edu/students',
    lastVerifiedOn: '2026-08-21',
    expiresOn: null,
    status: 'OWNER_REVIEW_REQUIRED',
    evidenceClass: 'VERIFIED_FACT',
    valueText: 'Google Cloud publishes student learning access including Google Skills credits for courses and labs; this is not automatically equivalent to production Cloud compute credit.',
    eligibility: ['Eligible student access and current course availability'],
    ownerOnlySteps: ['Verify the student learning account.', 'Select relevant labs without exposing customer secrets.', 'Do not treat learning credits as production infrastructure funding.'],
    safePreparation: ['Add as a training route for model/cloud operations.', 'Keep production cost model at zero credit until separately proven.'],
    dataRisk: 'Training environments may have retention and sharing constraints.',
    stackability: 'Learning credits are distinct from startup/cloud infrastructure credits.',
    onePerPerson: true,
    tags: ['student', 'google-cloud', 'training']
  }),
  record({
    id: 'google-startups-pre-funded',
    provider: 'Google for Startups',
    name: 'Google for Startups Cloud Program pre-funded tier',
    kind: 'startup_cloud_credits',
    regions: ['GLOBAL'],
    officialUrl: 'https://cloud.google.com/startup/pre-funded',
    lastVerifiedOn: '2026-08-21',
    expiresOn: null,
    status: 'APPLICATION_REQUIRED',
    evidenceClass: 'VERIFIED_FACT',
    valueText: 'Google publishes a pre-funded startup route with up to $2,000 Cloud credits and related benefits for qualifying startups with a working MVP/clear business model and other criteria.',
    eligibility: ['Real startup founded within the stated age limit', 'Working MVP and clear business model', 'Startup application and provider approval'],
    ownerOnlySteps: ['Confirm UberBond truthfully meets the published startup criteria.', 'Submit the application with accurate company and founder information.', 'Accept cloud terms and authorize any billing beyond credits only if desired.'],
    safePreparation: ['Prepare a factual application packet from repository evidence.', 'Model credit burn and expiry before requesting infrastructure.', 'Do not claim revenue, funding, customers, or incorporation that is not proven.'],
    dataRisk: 'Cloud billing and production secrets remain owner-gated.',
    stackability: 'Do not assume this stacks with other Google startup tiers.',
    onePerPerson: false,
    tags: ['startup', 'google-cloud', 'application']
  }),
  record({
    id: 'google-startups-early-stage',
    provider: 'Google for Startups',
    name: 'Google for Startups Cloud Program early-stage and AI tiers',
    kind: 'startup_cloud_credits',
    regions: ['GLOBAL'],
    officialUrl: 'https://cloud.google.com/startup/early-stage',
    lastVerifiedOn: '2026-08-21',
    expiresOn: null,
    status: 'APPLICATION_REQUIRED',
    evidenceClass: 'VERIFIED_FACT',
    valueText: 'Google publishes larger early-stage and AI startup credit routes for qualifying startups; eligibility depends on stage, funding, AI-first status, and provider review.',
    eligibility: ['Published stage/funding/AI criteria', 'Accurate startup identity and application', 'Provider approval'],
    ownerOnlySteps: ['Verify stage and funding facts.', 'Submit only if UberBond meets the published criteria.', 'Review expiry, billing, and data terms before activation.'],
    safePreparation: ['Create a tier decision matrix so the system never applies to an ineligible tier.', 'Keep all claims as OWNER_REVIEW_REQUIRED until proof is supplied.'],
    dataRisk: 'Cloud and AI workload data requires explicit governance.',
    stackability: 'Tier transitions and stacking are provider-controlled.',
    onePerPerson: false,
    tags: ['startup', 'ai', 'google-cloud', 'application']
  }),
  record({
    id: 'aws-activate-founder',
    provider: 'AWS',
    name: 'AWS Activate founder and portfolio packages',
    kind: 'startup_cloud_credits',
    regions: ['GLOBAL'],
    officialUrl: 'https://aws.amazon.com/aws-startups/learn/applying-for-aws-activate-credits-a-step-by-step-guide/',
    lastVerifiedOn: '2026-08-21',
    expiresOn: null,
    status: 'APPLICATION_REQUIRED',
    evidenceClass: 'VERIFIED_FACT',
    valueText: 'AWS publishes a founder package of $1,000 and larger portfolio routes up to $100,000 when the startup has eligible provider/VC/accelerator backing and meets current criteria.',
    eligibility: ['Real startup and AWS account', 'Founder or portfolio program criteria', 'Provider or investor relationship for larger tier'],
    ownerOnlySteps: ['Create or confirm the AWS account yourself.', 'Apply truthfully for the package that matches current evidence.', 'Review credit expiry and paid overage before enabling workloads.'],
    safePreparation: ['Build a provider-agnostic AWS cost model and Activate application packet.', 'Keep model-serving experiments dry-run until credit is actually granted.'],
    dataRisk: 'AWS credentials, billing, and customer data require explicit controls.',
    stackability: 'AWS credits do not imply eligibility for other provider programs.',
    onePerPerson: false,
    tags: ['startup', 'aws', 'cloud', 'application']
  }),
  record({
    id: 'aws-new-customer-free-tier',
    provider: 'AWS',
    name: 'AWS new-customer free plan and credits',
    kind: 'cloud_free_tier',
    regions: ['GLOBAL'],
    officialUrl: 'https://aws.amazon.com/about-aws/whats-new/2025/07/aws-free-tier-credits-month-free-plan/',
    lastVerifiedOn: '2026-08-21',
    expiresOn: null,
    status: 'OWNER_REVIEW_REQUIRED',
    evidenceClass: 'VERIFIED_FACT',
    valueText: 'AWS publishes a new-customer free-plan path with credits and a limited free period; current account eligibility and service limits must be checked at signup.',
    eligibility: ['New AWS customer under current rules', 'Current account and region conditions'],
    ownerOnlySteps: ['Confirm whether the account is genuinely new and eligible.', 'Review free-plan conversion and billing terms.', 'Set budget alerts before creating resources.'],
    safePreparation: ['Prepare a zero-spend infrastructure plan and hard caps.', 'Do not create an account or resources automatically.'],
    dataRisk: 'Cloud credentials and accidental overage risk.',
    stackability: 'Separate from Activate; do not double-count credits.',
    onePerPerson: true,
    tags: ['aws', 'cloud', 'free-tier']
  }),
  record({
    id: 'kiro-student-university-list',
    provider: 'Kiro',
    name: 'Kiro student plan',
    kind: 'student_developer_tool',
    regions: ['PUBLISHED_INSTITUTIONS_ONLY'],
    officialUrl: 'https://kiro.dev/students/',
    lastVerifiedOn: '2026-08-21',
    expiresOn: null,
    status: 'NOT_MATCHED_TO_PUBLISHED_LIST',
    evidenceClass: 'VERIFIED_FACT',
    valueText: 'Kiro advertises a one-year student plan with monthly credits for students at a published list of universities. Cairo University was not in the published list checked for this catalog; recheck the live list before concluding.',
    publishedInstitutionList: ['Arizona State University', 'Cal Poly', 'California State University Fullerton', 'Carnegie Mellon University', 'Georgia Tech', 'Hampton University', 'New York University', 'University of Chicago', 'University of Waterloo', 'University of Texas at Austin'],
    eligibility: ['Enrollment at a currently listed institution', 'Institution verification'],
    ownerOnlySteps: ['Check the current official institution list yourself.', 'Do not submit false institution information or use a purchased account.', 'Use the startup route only if UberBond independently qualifies.'],
    safePreparation: ['Keep Kiro as a conditional model/coding-tool adapter.', 'Do not provision seats or keys without verified eligibility.'],
    dataRisk: 'Review code/data handling before using a hosted coding agent.',
    stackability: 'Student and startup programs are separate.',
    onePerPerson: true,
    tags: ['kiro', 'student', 'institution-gated']
  }),
  record({
    id: 'kiro-startups',
    provider: 'Kiro',
    name: 'Kiro startup program',
    kind: 'startup_developer_tool',
    regions: ['GLOBAL_EXCEPT_PROVIDER_EXCLUSIONS'],
    officialUrl: 'https://kiro.dev/startups/',
    lastVerifiedOn: '2026-08-21',
    expiresOn: null,
    status: 'APPLICATION_REQUIRED',
    evidenceClass: 'VERIFIED_FACT',
    valueText: 'Kiro publishes a startup route for qualifying early-stage through Series A VC-backed startups with tiered Pro+ credits and a one-year term, subject to application and approval.',
    eligibility: ['Genuine startup', 'AWS account', 'Business-domain email', 'Published stage and VC-backed criteria', 'Provider approval'],
    ownerOnlySteps: ['Confirm real startup stage, funding, AWS account, and domain email.', 'Submit one truthful application only.', 'Review overage and expiry terms before activation.'],
    safePreparation: ['Prepare a truthful startup packet and model-routing adapter.', 'Do not create a second application while one is pending.', 'Keep overage disabled until owner approval.'],
    dataRisk: 'Hosted coding-agent access can expose repository data; use least privilege.',
    stackability: 'Kiro terms govern credit activation and expiry.',
    onePerPerson: false,
    tags: ['kiro', 'startup', 'coding-agent']
  }),
  record({
    id: 'microsoft-for-startups',
    provider: 'Microsoft',
    name: 'Microsoft for Startups',
    kind: 'startup_cloud_credits',
    regions: ['GLOBAL'],
    officialUrl: 'https://learn.microsoft.com/en-us/startups/microsoft-for-startups/getting-started-mfs',
    lastVerifiedOn: '2026-08-21',
    expiresOn: null,
    status: 'APPLICATION_REQUIRED',
    evidenceClass: 'VERIFIED_FACT',
    valueText: 'Microsoft publishes immediate startup credits and a path to unlock more based on verified progress; investor-backed routes may have larger limits.',
    eligibility: ['Real startup information', 'Microsoft account and verification', 'Investor/referral facts for higher tiers where applicable'],
    ownerOnlySteps: ['Provide accurate company and founder identity.', 'Apply using a real business domain and referral relationship if applicable.', 'Review billing behavior after credits are exhausted.'],
    safePreparation: ['Prepare a factual application packet and Azure cost plan.', 'Do not invent incorporation, revenue, or investor status.'],
    dataRisk: 'Cloud identity, billing, and production access are owner-gated.',
    stackability: 'Microsoft-specific; do not count as Azure for Students.',
    onePerPerson: false,
    tags: ['microsoft', 'startup', 'azure', 'application']
  }),
  record({
    id: 'cloudflare-startups',
    provider: 'Cloudflare',
    name: 'Cloudflare for Startups',
    kind: 'edge_cloud_credits',
    regions: ['GLOBAL'],
    officialUrl: 'https://www.cloudflare.com/startups/',
    lastVerifiedOn: '2026-08-21',
    expiresOn: null,
    status: 'APPLICATION_REQUIRED',
    evidenceClass: 'VERIFIED_FACT',
    valueText: 'Cloudflare publishes startup tiers with credits and Workers AI allowances, with tier criteria, payment-method, overage, and one-year conditions.',
    eligibility: ['Real startup stage and funding profile', 'Application approval', 'Valid payment method and review of overages'],
    ownerOnlySteps: ['Confirm the correct bootstrapped or funded tier.', 'Apply with accurate company information.', 'Add a payment method only after reviewing caps and overage behavior.'],
    safePreparation: ['Prepare an edge/runtime workload plan and credit burn budget.', 'Keep deployment and production mutations disabled.'],
    dataRisk: 'Workers and edge logs may carry customer data; define retention.',
    stackability: 'Cloudflare credits are separate from Vercel and cloud credits.',
    onePerPerson: false,
    tags: ['cloudflare', 'startup', 'workers-ai']
  }),
  record({
    id: 'vercel-startups',
    provider: 'Vercel',
    name: 'Vercel for Startups',
    kind: 'hosting_credits',
    regions: ['GLOBAL'],
    officialUrl: 'https://vercel.com/startups/credits',
    lastVerifiedOn: '2026-08-21',
    expiresOn: null,
    status: 'APPLICATION_REQUIRED',
    evidenceClass: 'VERIFIED_FACT',
    valueText: 'Vercel advertises free Pro and up to $30,000 in credits for approved startup partners, with application, company website, and matching-email requirements.',
    eligibility: ['Approved startup partner or qualifying route', 'Company website and matching email', 'Application approval'],
    ownerOnlySteps: ['Confirm UberBond has truthful public company evidence and matching email.', 'Submit the application yourself if eligible.', 'Review credit expiry and paid overage before linking production.'],
    safePreparation: ['Prepare deployment-budget and environment-separation packets.', 'Do not deploy production or modify DNS as part of eligibility preparation.'],
    dataRisk: 'Environment variables and deployment logs require secret hygiene.',
    stackability: 'Do not assume Vercel startup credits cover unrelated providers.',
    onePerPerson: false,
    tags: ['vercel', 'startup', 'hosting']
  }),
  record({
    id: 'modal-startups',
    provider: 'Modal',
    name: 'Modal startup program',
    kind: 'gpu_credits',
    regions: ['GLOBAL'],
    officialUrl: 'https://modal.com/startups',
    lastVerifiedOn: '2026-08-21',
    expiresOn: null,
    status: 'APPLICATION_REQUIRED',
    evidenceClass: 'VERIFIED_FACT',
    valueText: 'Modal advertises free startup credits and technical support for qualifying startups, including GPU workloads.',
    eligibility: ['Startup application and provider approval', 'Actual workload need'],
    ownerOnlySteps: ['Apply truthfully with the real UberBond stage and use case.', 'Review credit limits and billing after credits.', 'Approve any workload and secret access yourself.'],
    safePreparation: ['Model GPU jobs with deterministic local substitutes.', 'Prepare a sandbox adapter with zero provider calls.'],
    dataRisk: 'GPU jobs may process sensitive prompts; redact by default.',
    stackability: 'Provider-specific credits.',
    onePerPerson: false,
    tags: ['modal', 'startup', 'gpu']
  }),
  record({
    id: 'fireworks-startups',
    provider: 'Fireworks AI',
    name: 'Fireworks AI startup credits',
    kind: 'model_api_credits',
    regions: ['GLOBAL'],
    officialUrl: 'https://fireworks.ai/startups',
    lastVerifiedOn: '2026-08-21',
    expiresOn: null,
    status: 'APPLICATION_REQUIRED',
    evidenceClass: 'VERIFIED_FACT',
    valueText: 'Fireworks advertises a one-year startup-credit route for eligible startups subject to application and approval.',
    eligibility: ['Real startup and accepted application', 'Provider credit terms'],
    ownerOnlySteps: ['Apply with accurate company details.', 'Review model/data terms and expiry.', 'Create or connect credentials yourself only after approval.'],
    safePreparation: ['Add Fireworks as a replaceable model-provider adapter.', 'Benchmark with fixtures before sending any customer content.'],
    dataRisk: 'Review provider data retention and training terms.',
    stackability: 'Do not count approval until the provider issues a receipt.',
    onePerPerson: false,
    tags: ['fireworks', 'startup', 'model-provider']
  }),
  record({
    id: 'vercel-ai-accelerator-2026',
    provider: 'Vercel',
    name: 'Vercel AI Accelerator 2026',
    kind: 'accelerator_credits',
    regions: ['GLOBAL'],
    officialUrl: 'https://vercel.com/blog/the-vercel-ai-accelerator-is-back-with-6-million-in-credits',
    lastVerifiedOn: '2026-08-21',
    expiresOn: '2026-02-16',
    status: 'PROGRAM_CLOSED',
    evidenceClass: 'VERIFIED_FACT',
    valueText: 'The 2026 cohort application window was published for February 2026 and is not a currently open route in this catalog.',
    eligibility: ['Future cohort only; monitor official announcements.'],
    ownerOnlySteps: ['Do not submit a late or fabricated application.', 'Monitor the official accelerator page for the next cohort.'],
    safePreparation: ['Keep an opportunity monitor and evidence record.', 'Do not treat closed cohort language as current credit.'],
    dataRisk: 'Program-specific.',
    stackability: 'Not applicable while closed.',
    onePerPerson: false,
    tags: ['vercel', 'accelerator', 'closed']
  }),
  record({
    id: 'vercel-open-source-program',
    provider: 'Vercel',
    name: 'Vercel Open Source Program',
    kind: 'open_source_credits',
    regions: ['GLOBAL'],
    officialUrl: 'https://vercel.com/open-source-program',
    lastVerifiedOn: '2026-08-21',
    expiresOn: null,
    status: 'PROGRAM_CLOSED',
    evidenceClass: 'VERIFIED_FACT',
    valueText: 'Vercel publishes an open-source credit program with an application window that may reopen, but UberBond must not be made public solely to pursue credits.',
    eligibility: ['Genuine qualifying open-source project and current application window'],
    ownerOnlySteps: ['Only apply if UberBond independently meets the open-source requirements.', 'Do not release private code or customer data for the offer.', 'Review current application status yourself.'],
    safePreparation: ['Monitor the official page.', 'Build a separate open-source eligibility checklist without changing repository visibility.'],
    dataRisk: 'Public-source disclosure can expose proprietary strategy or secrets.',
    stackability: 'Program-specific.',
    onePerPerson: false,
    tags: ['vercel', 'open-source', 'closed']
  }),
  record({
    id: 'lennys-product-pass',
    provider: 'Lenny Newsletter',
    name: 'Lenny Product Pass / Google AI and tool bundle',
    kind: 'paid_bundle',
    regions: ['GLOBAL_INCLUDING_EG'],
    officialUrl: 'https://one.google.com/offer/terms-and-conditions/lennys-newsletter-aip-12month-trial',
    lastVerifiedOn: '2026-08-21',
    expiresOn: '2026-12-31',
    status: 'OWNER_REVIEW_REQUIRED',
    evidenceClass: 'VERIFIED_FACT',
    valueText: 'Official Google terms describe a 12-month no-charge Google AI trial for qualifying Lenny Product Pass customers, with Egypt included in the published country list; the pass itself is a paid product and post-trial rules apply.',
    eligibility: ['Qualifying Lenny Product Pass customer', 'Published-country eligibility', 'Payment method and acceptance of terms'],
    ownerOnlySteps: ['Decide whether the paid Product Pass is worth its cost.', 'Purchase only through the official route if desired.', 'Review the Google trial renewal and non-stackability terms.'],
    safePreparation: ['Compare bundle cost against independently available free tiers.', 'Do not represent the bundle as free overall.'],
    dataRisk: 'Review each included provider separately.',
    stackability: 'Official terms say the Google offer is not stackable with certain existing plans/trials.',
    onePerPerson: true,
    tags: ['google-ai', 'bundle', 'egypt', 'paid']
  }),
  record({
    id: 'cohere-command-a-plus-trial',
    provider: 'Cohere',
    name: 'Cohere trial API / Command A+',
    kind: 'api_free_trial',
    regions: ['GLOBAL'],
    officialUrl: 'https://docs.cohere.com/docs/command-a-plus',
    lastVerifiedOn: '2026-08-21',
    expiresOn: null,
    status: 'FREE_TIER_AVAILABLE',
    evidenceClass: 'VERIFIED_FACT',
    valueText: 'Cohere documents Command A+ availability for trial and production keys subject to rate limits and current account terms.',
    eligibility: ['Cohere account and current key/rate limits', 'Data-policy review'],
    ownerOnlySteps: ['Create or confirm your own Cohere key.', 'Review trial/data terms.', 'Set a quota and revoke the key if no longer needed.'],
    safePreparation: ['Add as a model-router candidate for long-context or tool-use evaluation.', 'Use synthetic/redacted fixtures only before owner approval.'],
    dataRisk: 'Provider-specific data handling must be checked.',
    stackability: 'Separate from Cohere grants.',
    onePerPerson: false,
    tags: ['cohere', 'api', 'free-tier', 'router']
  }),
  record({
    id: 'cohere-catalyst-grants',
    provider: 'Cohere',
    name: 'Cohere Catalyst Grants',
    kind: 'research_grant',
    regions: ['GLOBAL'],
    officialUrl: 'https://cohere.com/research/grants',
    lastVerifiedOn: '2026-08-21',
    expiresOn: null,
    status: 'APPLICATION_REQUIRED',
    evidenceClass: 'VERIFIED_FACT',
    valueText: 'Cohere publishes rolling Catalyst Grants for public-benefit or open-science research such as education, healthcare, and climate; it is not a general startup coupon.',
    eligibility: ['Real qualifying research project', 'Public-benefit/open-science fit', 'Application and review'],
    ownerOnlySteps: ['Define a genuine research project and collaborators.', 'Obtain any institutional or ethics approvals required.', 'Submit an accurate grant application.'],
    safePreparation: ['Prepare a research concept note without pretending UberBond is a qualifying study.', 'Keep customer/commercial work separate from research claims.'],
    dataRisk: 'Research data and ethics requirements apply.',
    stackability: 'Grant-specific.',
    onePerPerson: false,
    tags: ['cohere', 'research', 'grant', 'healthcare']
  }),
  record({
    id: 'groq-free-plan',
    provider: 'Groq',
    name: 'Groq free developer plan',
    kind: 'api_free_tier',
    regions: ['GLOBAL'],
    officialUrl: 'https://console.groq.com/docs/rate-limits',
    lastVerifiedOn: '2026-08-21',
    expiresOn: null,
    status: 'FREE_TIER_AVAILABLE',
    evidenceClass: 'VERIFIED_FACT',
    valueText: 'Groq publishes free-plan rate limits by model and account tier; limits can change and are not a promise of production capacity.',
    eligibility: ['Groq account and current rate-limit access'],
    ownerOnlySteps: ['Create or confirm your own key.', 'Review rate limits, data policy, and quota.', 'Keep a hard cap and revoke unused credentials.'],
    safePreparation: ['Use Groq for cheap classification or fast triage only after key approval.', 'Keep deterministic code ahead of model calls where possible.'],
    dataRisk: 'Do not send unredacted customer secrets until policy is approved.',
    stackability: 'Free plan is provider-specific.',
    onePerPerson: false,
    tags: ['groq', 'api', 'free-tier', 'router']
  }),
  record({
    id: 'cerebras-free-trial',
    provider: 'Cerebras',
    name: 'Cerebras API free trial',
    kind: 'api_free_trial',
    regions: ['GLOBAL'],
    officialUrl: 'https://www.cerebras.ai/pricing',
    lastVerifiedOn: '2026-08-21',
    expiresOn: null,
    status: 'FREE_TIER_AVAILABLE',
    evidenceClass: 'VERIFIED_FACT',
    valueText: 'Cerebras publishes a free trial credit for new accounts subject to current signup and usage terms.',
    eligibility: ['New account eligibility and current trial terms'],
    ownerOnlySteps: ['Create the account yourself and confirm the trial terms.', 'Set a cost cap and inspect the expiry.', 'Keep the key out of source control.'],
    safePreparation: ['Add Cerebras as a speed benchmark provider.', 'Run only synthetic benchmark fixtures before key approval.'],
    dataRisk: 'Review API data handling.',
    stackability: 'Trial is provider-specific and may be one per account.',
    onePerPerson: true,
    tags: ['cerebras', 'api', 'trial', 'router']
  }),
  record({
    id: 'openrouter-free-models',
    provider: 'OpenRouter',
    name: 'OpenRouter free-model routing',
    kind: 'multi_provider_free_tier',
    regions: ['GLOBAL'],
    officialUrl: 'https://openrouter.ai/pricing',
    lastVerifiedOn: '2026-08-21',
    expiresOn: null,
    status: 'FREE_TIER_AVAILABLE',
    evidenceClass: 'VERIFIED_FACT',
    valueText: 'OpenRouter publishes access to free models with low request limits and provider-specific behavior; free capacity is not a production SLA.',
    eligibility: ['OpenRouter account and current free-model availability'],
    ownerOnlySteps: ['Create or confirm your own account and key.', 'Review which upstream provider receives prompts.', 'Set a daily request cap and do not pass secrets.'],
    safePreparation: ['Use as a non-sensitive fallback for classification and exploration.', 'Record upstream model/provider in each evaluation receipt.'],
    dataRisk: 'Multi-provider routing increases data-governance complexity; redact by default.',
    stackability: 'Free model limits are not interchangeable with upstream provider quotas.',
    onePerPerson: false,
    tags: ['openrouter', 'multi-provider', 'free-tier', 'router']
  }),
  record({
    id: 'deepseek-free-app',
    provider: 'DeepSeek',
    name: 'DeepSeek free consumer app',
    kind: 'consumer_free_access',
    regions: ['GLOBAL'],
    officialUrl: 'https://api-docs.deepseek.com/news/news250115',
    lastVerifiedOn: '2026-08-21',
    expiresOn: null,
    status: 'FREE_TIER_AVAILABLE',
    evidenceClass: 'VERIFIED_FACT',
    valueText: 'DeepSeek announced a free app with no ads or in-app purchases; this does not imply free API capacity or suitability for confidential UberBond data.',
    eligibility: ['Consumer app availability and current terms'],
    ownerOnlySteps: ['Review current app privacy terms before use.', 'Do not confuse consumer app access with an API contract.', 'Do not upload customer secrets.'],
    safePreparation: ['Keep as a manual research option only.', 'Do not place it in unattended production routing without a governed API contract.'],
    dataRisk: 'Consumer-app privacy and data residency must be reviewed.',
    stackability: 'Separate from API pricing.',
    onePerPerson: false,
    tags: ['deepseek', 'consumer', 'free']
  }),
  record({
    id: 'mistral-le-chat-free',
    provider: 'Mistral',
    name: 'Le Chat free plan',
    kind: 'consumer_free_access',
    regions: ['GLOBAL'],
    officialUrl: 'https://help.mistral.ai/en/articles/455205-how-can-i-upgrade-or-cancel-my-le-chat-subscription',
    lastVerifiedOn: '2026-08-21',
    expiresOn: null,
    status: 'FREE_TIER_AVAILABLE',
    evidenceClass: 'VERIFIED_FACT',
    valueText: 'Mistral documents a free Le Chat plan and agent interaction/building subject to current limits and plan terms.',
    eligibility: ['Account and current free-plan limits'],
    ownerOnlySteps: ['Review the current plan and privacy terms.', 'Use only your own account.', 'Do not expose customer secrets or treat the consumer plan as an API SLA.'],
    safePreparation: ['Keep Le Chat as a manual or evaluation fallback.', 'Use a provider adapter only after a separate API contract is verified.'],
    dataRisk: 'Consumer-plan data handling must be reviewed.',
    stackability: 'Separate from API and business plans.',
    onePerPerson: false,
    tags: ['mistral', 'consumer', 'free']
  }),
  record({
    id: 'elevenlabs-student',
    provider: 'ElevenLabs',
    name: 'ElevenLabs student and educator benefits',
    kind: 'student_ai_audio',
    regions: ['GLOBAL'],
    officialUrl: 'https://elevenlabs.io/students',
    lastVerifiedOn: '2026-08-21',
    expiresOn: null,
    status: 'OWNER_REVIEW_REQUIRED',
    evidenceClass: 'VERIFIED_FACT',
    valueText: 'ElevenLabs publishes expanded student/educator free-plan benefits and an ElevenReader offer for verified institutions, subject to current verification.',
    eligibility: ['Genuine student/educator verification or institution email', 'Current product availability'],
    ownerOnlySteps: ['Verify student or educator status with your own institution.', 'Review voice/content rights and plan limits.', 'Do not process third-party audio without permission.'],
    safePreparation: ['Prepare a licensed-content transformation adapter.', 'Require content-rights evidence before any automated asset generation.'],
    dataRisk: 'Voice and likeness rights are high-risk; customer authorization is mandatory.',
    stackability: 'Student benefits are provider-specific.',
    onePerPerson: true,
    tags: ['elevenlabs', 'student', 'audio', 'content']
  }),
  record({
    id: 'elevenlabs-api-credits',
    provider: 'ElevenLabs',
    name: 'ElevenLabs API developer credits',
    kind: 'api_free_credits',
    regions: ['GLOBAL'],
    officialUrl: 'https://join.elevenlabs.io/api/developer-api',
    lastVerifiedOn: '2026-08-21',
    expiresOn: null,
    status: 'FREE_TIER_AVAILABLE',
    evidenceClass: 'VERIFIED_FACT',
    valueText: 'ElevenLabs advertises a limited free API credit allocation for developers, subject to current signup and usage terms.',
    eligibility: ['Current developer signup and credit terms'],
    ownerOnlySteps: ['Create or confirm the developer account yourself.', 'Review voice/content rights and data handling.', 'Set usage caps and keep the key secret.'],
    safePreparation: ['Add a no-op audio provider adapter.', 'Use only owned or licensed test audio.'],
    dataRisk: 'Voice identity, likeness, and copyrighted material require permission.',
    stackability: 'Developer credits are separate from student benefits.',
    onePerPerson: false,
    tags: ['elevenlabs', 'api', 'free-credits', 'audio']
  }),
  record({
    id: 'lovable-student',
    provider: 'Lovable',
    name: 'Lovable student discount and free plan',
    kind: 'student_developer_tool',
    regions: ['GLOBAL'],
    officialUrl: 'https://lovable.dev/students',
    lastVerifiedOn: '2026-08-21',
    expiresOn: null,
    status: 'OWNER_REVIEW_REQUIRED',
    evidenceClass: 'VERIFIED_FACT',
    valueText: 'Lovable publishes a student discount for verified students and a free plan with limited build/cloud credits.',
    eligibility: ['Student verification for discount', 'Current free-plan limits'],
    ownerOnlySteps: ['Verify student status yourself.', 'Review any recurring subscription after the discount.', 'Do not connect production credentials or customer data without owner approval.'],
    safePreparation: ['Use free local/preparation paths for prototypes.', 'Add generated-code review and secret scanning before any import.'],
    dataRisk: 'Hosted code-generation environments can process repository contents.',
    stackability: 'Discount and free plan terms are provider-specific.',
    onePerPerson: true,
    tags: ['lovable', 'student', 'builder']
  }),
  record({
    id: 'jetbrains-student',
    provider: 'JetBrains',
    name: 'JetBrains student tools and AI features',
    kind: 'student_developer_tool',
    regions: ['GLOBAL'],
    officialUrl: 'https://lp.jetbrains.com/pycharm-for-students/',
    lastVerifiedOn: '2026-08-21',
    expiresOn: null,
    status: 'OWNER_REVIEW_REQUIRED',
    evidenceClass: 'VERIFIED_FACT',
    valueText: 'JetBrains publishes free student IDE access and related AI/Junie features subject to current product and trial terms; a general one-year AI subscription should not be assumed.',
    eligibility: ['Genuine student verification', 'Feature-specific plan terms'],
    ownerOnlySteps: ['Verify student status with JetBrains.', 'Review AI feature trial/renewal requirements.', 'Do not assume an AI feature is included just because the IDE is free.'],
    safePreparation: ['List JetBrains as an optional coding-worker tool.', 'Require human review and tests for generated changes.'],
    dataRisk: 'Repository access must be least-privilege and owner-authorized.',
    stackability: 'IDE license and AI feature terms may differ.',
    onePerPerson: true,
    tags: ['jetbrains', 'student', 'coding-agent']
  }),
  record({
    id: 'openai-researcher-api',
    provider: 'OpenAI',
    name: 'OpenAI Researcher Access API credits',
    kind: 'research_api_credits',
    regions: ['SUPPORTED_COUNTRIES'],
    officialUrl: 'https://help.openai.com/en/articles/10139500',
    lastVerifiedOn: '2026-08-21',
    expiresOn: null,
    status: 'APPLICATION_REQUIRED',
    evidenceClass: 'VERIFIED_FACT',
    valueText: 'OpenAI documents a researcher-access route with API credits for qualifying academic/nonprofit research, subject to application and review; it is not a general startup coupon.',
    eligibility: ['Qualifying academic or nonprofit research', 'Supported country', 'Application and quarterly review'],
    ownerOnlySteps: ['Confirm genuine research status and project scope.', 'Obtain institutional or ethics approvals where required.', 'Submit an accurate application and use credits only for the approved purpose.'],
    safePreparation: ['Keep research routing separate from commercial UberBond traffic.', 'Prepare a research packet without inventing faculty or nonprofit status.'],
    dataRisk: 'Research data governance and approved-use restrictions apply.',
    stackability: 'Program-specific.',
    onePerPerson: false,
    tags: ['openai', 'research', 'api', 'application']
  }),
  record({
    id: 'openai-academic-researchers',
    provider: 'OpenAI',
    name: 'ChatGPT Academic Researchers workspace',
    kind: 'research_workspace',
    regions: ['ELIGIBLE_INSTITUTIONS'],
    officialUrl: 'https://help.openai.com/en/articles/20001406-chatgpt-for-academic-researchers',
    lastVerifiedOn: '2026-08-21',
    expiresOn: null,
    status: 'APPLICATION_REQUIRED',
    evidenceClass: 'VERIFIED_FACT',
    valueText: 'OpenAI describes a complimentary workspace route for eligible research faculty/postdocs with qualifying recent work; ordinary student status alone is not enough.',
    eligibility: ['Faculty/postdoc role at eligible institution', 'Qualifying recent paper or research evidence', 'Institutional verification'],
    ownerOnlySteps: ['Do not apply as faculty/postdoc unless that is genuinely true.', 'Confirm institutional eligibility and paper requirement.', 'Submit only a truthful research application.'],
    safePreparation: ['Mark as owner-only research route, not an UberBond subscription.', 'Keep commercial claims out of any research application.'],
    dataRisk: 'Research workspace data and institutional policy apply.',
    stackability: 'Program-specific.',
    onePerPerson: false,
    tags: ['openai', 'academic', 'research']
  }),
  record({
    id: 'anthropic-rare-disease-grants',
    provider: 'Anthropic',
    name: 'Anthropic rare disease research grants',
    kind: 'research_api_credits',
    regions: ['ELIGIBLE_RESEARCHERS'],
    officialUrl: 'https://www.anthropic.com/news/rare-disease-research-grants',
    lastVerifiedOn: '2026-08-21',
    expiresOn: null,
    status: 'APPLICATION_REQUIRED',
    evidenceClass: 'VERIFIED_FACT',
    valueText: 'Anthropic announced a 2026 call offering Claude credits for qualifying rare-disease research projects; this is not a general AI subscription and requires genuine research fit.',
    eligibility: ['Real rare-disease research project', 'Appropriate researcher/faculty/organization status', 'Ethics and institutional approvals where needed'],
    ownerOnlySteps: ['Confirm a real research project and sponsor/ethics status.', 'Apply only with accurate scientific claims.', 'Use any grant for the approved research purpose, not general commercial activity.'],
    safePreparation: ['Create a separate research-opportunity record.', 'Do not mix medical-student status with faculty or research-lab claims.'],
    dataRisk: 'Health data and research ethics are high-risk.',
    stackability: 'Grant-specific.',
    onePerPerson: false,
    tags: ['anthropic', 'research', 'healthcare', 'grant']
  }),

  record({
    id: "openai-codex-students-us-canada",
    provider: "OpenAI",
    name: "Codex for Students",
    kind: "student_developer_tool",
    regions: ["US", "CA"],
    officialUrl: "https://developers.openai.com/community",
    lastVerifiedOn: "2026-08-21",
    expiresOn: null,
    status: "OWNER_REVIEW_REQUIRED",
    evidenceClass: "VERIFIED_FACT",
    valueText: "OpenAI's official developer community page describes Codex for Students as a $100 ChatGPT credit offer for verified university students in the United States and Canada, subject to current claim terms.",
    eligibility: ["Genuine university student status in the published countries", "OpenAI verification", "Current offer availability"],
    ownerOnlySteps: ["Verify genuine US or Canadian university status yourself.", "Review claim, expiry, and product terms.", "Claim only on your own account and do not create duplicate identities."],
    safePreparation: ["Add Codex as an optional coding/review route.", "Keep keys and repository access owner-gated.", "Do not treat ChatGPT credits as API credits unless the official terms say so."],
    dataRisk: "Do not upload UberBond secrets or customer data until the product's data controls are reviewed.",
    stackability: "Do not assume stackability with a paid ChatGPT plan or API credits.",
    onePerPerson: true,
    tags: ["openai", "codex", "student", "us", "canada"]
  }),
  record({
    id: "openai-codex-open-source",
    provider: "OpenAI",
    name: "Codex for Open Source",
    kind: "open_source_benefit",
    regions: ["GLOBAL"],
    officialUrl: "https://developers.openai.com/community",
    lastVerifiedOn: "2026-08-21",
    expiresOn: null,
    status: "APPLICATION_REQUIRED",
    evidenceClass: "VERIFIED_FACT",
    valueText: "OpenAI's developer community page describes support for open-source maintainers using Codex and OpenAI APIs. Eligibility depends on real qualifying public maintenance and current program terms.",
    eligibility: ["Genuine public open-source maintenance or contribution", "Project and maintainer review", "Any application or invitation requirements"],
    ownerOnlySteps: ["Confirm UberBond's public repository and license genuinely meet the current program requirements.", "Submit truthful project and maintainer information if an application is available.", "Keep private code, credentials, and customer data outside any public-benefit workflow."],
    safePreparation: ["Prepare a public-project evidence packet without claiming commercial traction.", "Separate open-source support from proprietary UberBond infrastructure.", "Never open-source a moat or secret merely to chase credits."],
    dataRisk: "Public repository and maintainer data may be reviewed; never disclose secrets.",
    stackability: "Program-specific and not assumed to stack with other OpenAI credits.",
    onePerPerson: false,
    tags: ["openai", "codex", "open-source", "application"]
  }),
  record({
    id: "openai-for-startups",
    provider: "OpenAI",
    name: "OpenAI for Startups",
    kind: "startup_ai_support",
    regions: ["GLOBAL"],
    officialUrl: "https://developers.openai.com/community",
    lastVerifiedOn: "2026-08-21",
    expiresOn: null,
    status: "OWNER_REVIEW_REQUIRED",
    evidenceClass: "VERIFIED_FACT",
    valueText: "OpenAI's official developer community page lists OpenAI for Startups as a startup support route. Specific credits, access, and eligibility are provider-controlled and must not be inferred from the listing.",
    eligibility: ["Genuine startup identity", "Current program availability", "Any company, funding, or product criteria"],
    ownerOnlySteps: ["Verify the current official startup route and eligibility.", "Prepare accurate company facts only.", "Review whether any credits are product credits, API credits, or partner benefits before accepting."],
    safePreparation: ["Create a factual startup profile from repository evidence.", "Do not claim funding, revenue, customers, or incorporation without proof.", "Keep all account creation and applications owner-only."],
    dataRisk: "Review commercial data and API terms before sharing company information.",
    stackability: "Do not assume this stacks with Researcher, Codex, or grant routes.",
    onePerPerson: false,
    tags: ["openai", "startup", "support", "application"]
  }),
  record({
    id: "openai-cybersecurity-grant",
    provider: "OpenAI",
    name: "OpenAI Cybersecurity Grant Program",
    kind: "research_grant",
    regions: ["GLOBAL"],
    officialUrl: "https://openai.com/index/openai-cybersecurity-grant-program/",
    lastVerifiedOn: "2026-08-21",
    expiresOn: null,
    status: "APPLICATION_REQUIRED",
    evidenceClass: "VERIFIED_FACT",
    valueText: "OpenAI publishes a cybersecurity grant route for defensive cybersecurity tools, methods, and processes. The 2026 update describes Trusted Access for Cyber and a commitment to API credits; it is not a general-purpose startup subsidy.",
    eligibility: ["Defensive cybersecurity project", "Public-benefit orientation and sharing plan", "Application and provider review"],
    ownerOnlySteps: ["Confirm the project is genuinely defensive and fits the published scope.", "Prepare a truthful public-benefit proposal.", "Do not apply with a general lead-generation or commercial automation thesis."],
    safePreparation: ["Keep this as a separate grant lane for defensive security work.", "Draft only from verified capabilities and repository evidence.", "Do not run offensive security actions or submit an application automatically."],
    dataRisk: "Security research may involve sensitive data; use approved datasets only.",
    stackability: "Grant-specific; no stacking assumed.",
    onePerPerson: false,
    tags: ["openai", "cybersecurity", "grant", "defensive"]
  }),
  record({
    id: "amd-ai-developer-program",
    provider: "AMD",
    name: "AMD AI Developer Program",
    kind: "developer_credits",
    regions: ["GLOBAL"],
    officialUrl: "https://developer.amd.com/ai-developer-program/",
    lastVerifiedOn: "2026-08-21",
    expiresOn: null,
    status: "OWNER_REVIEW_REQUIRED",
    evidenceClass: "VERIFIED_FACT",
    valueText: "AMD advertises a free AI Developer Program with member benefits including a Developer Cloud credit path and other partner benefits. Exact credit amount, expiry, and member eligibility are subject to current terms.",
    eligibility: ["Developer account and current program availability", "Acceptance of AMD and partner terms", "Credit redemption conditions"],
    ownerOnlySteps: ["Join or confirm the AMD developer account yourself.", "Review current Developer Cloud credit amount, expiry, and allowed use.", "Activate any partner benefit only after checking privacy and billing terms."],
    safePreparation: ["Add AMD GPU and partner-credit routes to the infrastructure router.", "Model workloads before spending any credits.", "Keep GPU experiments synthetic and bounded."],
    dataRisk: "GPU cloud credentials and uploaded datasets require owner approval.",
    stackability: "AMD partner benefits are separate and may have independent terms.",
    onePerPerson: false,
    tags: ["amd", "gpu", "developer", "credits"]
  }),
  record({
    id: "ona-open-source",
    provider: "Ona",
    name: "Ona for Open Source",
    kind: "open_source_compute_credits",
    regions: ["GLOBAL"],
    officialUrl: "https://ona.com/open-source",
    lastVerifiedOn: "2026-08-21",
    expiresOn: null,
    status: "APPLICATION_REQUIRED",
    evidenceClass: "VERIFIED_FACT",
    valueText: "Ona publishes an open-source program offering up to $200 per month in AI credits for maintainers and contributors of active established open-source projects, subject to application and program criteria.",
    eligibility: ["Active established open-source project", "Genuine maintainer or contributor status", "Application and provider review"],
    ownerOnlySteps: ["Verify the exact project, license, and contribution history.", "Apply only with truthful open-source evidence.", "Keep private/proprietary repository data out of any public application."],
    safePreparation: ["Separate any qualifying open-source component from UberBond's private commercial core.", "Do not create artificial activity or split repositories to qualify.", "Record the credit as interface-only until granted."],
    dataRisk: "Hosted coding-agent access can expose repository contents; use least privilege.",
    stackability: "Program-specific and not assumed to stack with other credits.",
    onePerPerson: false,
    tags: ["open-source", "ona", "coding-agent", "credits"]
  }),
  record({
    id: "arcee-trinity-builders",
    provider: "Arcee AI",
    name: "Trinity Builders Program",
    kind: "model_builder_grant",
    regions: ["GLOBAL"],
    officialUrl: "https://www.arcee.ai/blog/introducing-the-trinity-builders-program",
    lastVerifiedOn: "2026-08-21",
    expiresOn: null,
    status: "APPLICATION_REQUIRED",
    evidenceClass: "VERIFIED_FACT",
    valueText: "Arcee AI describes a Trinity Builders community program with access or credits for developers, researchers, and open-source builders using Trinity models; selection and current terms apply.",
    eligibility: ["Builder or research project fit", "Program application or community acceptance", "Model and usage terms"],
    ownerOnlySteps: ["Review current program instructions and model license.", "Apply only with accurate project information.", "Check whether free access has rate limits, retention, or attribution requirements."],
    safePreparation: ["Add Trinity to the optional open-model benchmark matrix.", "Use redacted fixtures and no production credentials.", "Measure quality, cost, and license fit before routing work."],
    dataRisk: "Model inputs and outputs may have provider-specific retention and licensing rules.",
    stackability: "No stacking assumed.",
    onePerPerson: false,
    tags: ["arcee", "trinity", "open-model", "application"]
  }),
  record({
    id: "aws-kiro-singapore-ihl",
    provider: "AWS/Kiro",
    name: "Kiro Singapore IHL pilot",
    kind: "regional_education_program",
    regions: ["SG_INSTITUTIONS"],
    officialUrl: "https://press.aboutamazon.com/aws/2026/5/aws-brings-professional-grade-ai-developer-tool-kiro-to-singapore-ihls-to-build-workforce-ready-software-skills",
    lastVerifiedOn: "2026-08-21",
    expiresOn: null,
    status: "OWNER_REVIEW_REQUIRED",
    evidenceClass: "VERIFIED_FACT",
    valueText: "AWS announced a Singapore higher-education pilot providing eligible learners at participating institutions with Kiro credits. It is a regional institutional program, not a route for an Egypt-based individual without genuine qualifying affiliation.",
    eligibility: ["Genuine eligible Singapore institution or program affiliation", "Institution-controlled access", "Current pilot terms"],
    ownerOnlySteps: ["Check whether you genuinely belong to a participating institution or program.", "Do not use a proxy, purchased account, or false affiliation.", "Let the institution determine access where access is institution-managed."],
    safePreparation: ["Keep as a regional opportunity record for future evidence.", "Do not route UberBond work through it without valid access and data approval."],
    dataRisk: "Institutional accounts may have school-controlled data policies.",
    stackability: "Institutional route is separate from general Kiro routes.",
    onePerPerson: true,
    tags: ["kiro", "aws", "singapore", "education"]
  }),
  record({
    id: "digitalocean-hatch",
    provider: "DigitalOcean",
    name: "DigitalOcean Hatch startup program",
    kind: "startup_cloud_credits",
    regions: ["GLOBAL"],
    officialUrl: "https://www.digitalocean.com/hatch",
    lastVerifiedOn: "2026-08-21",
    expiresOn: null,
    status: "APPLICATION_REQUIRED",
    evidenceClass: "VERIFIED_FACT",
    valueText: "DigitalOcean publishes Hatch startup benefits, including up to $100,000 in compute credits for qualified participants plus support and ecosystem benefits; GPU coverage and exact terms vary.",
    eligibility: ["Qualified startup status", "Application and provider approval", "Current credit/service exclusions"],
    ownerOnlySteps: ["Verify startup facts and program criteria.", "Apply truthfully through the official route.", "Review which services are covered and set spending caps before deploying."],
    safePreparation: ["Build a DigitalOcean cost and migration adapter without provisioning resources.", "Model expiry and excluded GPU usage.", "Keep deployment behind V9 and owner-approved credentials."],
    dataRisk: "Cloud account and billing data are sensitive.",
    stackability: "Do not double-count Hatch with other cloud credits.",
    onePerPerson: false,
    tags: ["digitalocean", "hatch", "startup", "cloud"]
  }),
  record({
    id: "ibm-bob-global-student",
    provider: "IBM",
    name: "IBM Bob and AI Builders Challenge for students",
    kind: "student_developer_tool",
    regions: ["GLOBAL_INSTITUTIONS"],
    officialUrl: "https://newsroom.ibm.com/2026-06-03-IBM-Launches-Global-AI-Builders-Challenge-with-IBM-Bob-for-University-Students,-Expanding-Availability-of-IBM-Bob-to-20,000-Post-Secondary-Institutions-Worldwide",
    lastVerifiedOn: "2026-08-21",
    expiresOn: null,
    status: "OWNER_REVIEW_REQUIRED",
    evidenceClass: "VERIFIED_FACT",
    valueText: "IBM announced expanded IBM Bob availability for post-secondary institutions worldwide and a student AI Builders Challenge. Access depends on participating institution and current challenge terms.",
    eligibility: ["Genuine eligible post-secondary institution or challenge participation", "Current IBM SkillsBuild/IBM Bob access rules"],
    ownerOnlySteps: ["Check whether your institution participates and whether the challenge is open.", "Use your own verified student account.", "Review repository/data handling before connecting code."],
    safePreparation: ["Add IBM Bob to the optional coding-worker registry.", "Use only synthetic or public fixtures for evaluation.", "Do not treat challenge access as an ongoing production entitlement."],
    dataRisk: "Hosted coding tools may process code and prompts; review institutional terms.",
    stackability: "Institutional and challenge benefits are separate from IBM cloud credits.",
    onePerPerson: true,
    tags: ["ibm", "bob", "student", "coding-agent"]
  }),
  record({
    id: "together-ai-startup-accelerator",
    provider: "Together AI",
    name: "Together AI Startup Accelerator",
    kind: "startup_inference_credits",
    regions: ["GLOBAL"],
    officialUrl: "https://www.together.ai/startup-accelerator",
    lastVerifiedOn: "2026-08-21",
    expiresOn: null,
    status: "APPLICATION_REQUIRED",
    evidenceClass: "VERIFIED_FACT",
    valueText: "Together AI publishes a selection-based startup accelerator with free platform credits, engineering time, and GTM/community support. Published tiers range from up to $15,000 to $50,000 depending on funding stage, with exclusions.",
    eligibility: ["AI-native startup and funding tier fit", "Application and selection", "Credit exclusions such as reserved GPU clusters"],
    ownerOnlySteps: ["Verify funding and company facts honestly.", "Apply through the official accelerator page if eligible.", "Review credit exclusions, expiry, and any billing after credits."],
    safePreparation: ["Add Together to the model-router benchmark plan.", "Create a redacted inference benchmark and hard budget.", "Do not claim selection or credits before a provider receipt."],
    dataRisk: "Model inputs, fine-tuning data, and dedicated endpoints require governance.",
    stackability: "Selection-based and not assumed to stack with other startup accelerators.",
    onePerPerson: false,
    tags: ["together", "startup", "inference", "credits"]
  }),
  record({
    id: "modal-startups",
    provider: "Modal",
    name: "Modal for Startups",
    kind: "startup_gpu_credits",
    regions: ["GLOBAL"],
    officialUrl: "https://modal.com/startups",
    lastVerifiedOn: "2026-08-21",
    expiresOn: null,
    status: "APPLICATION_REQUIRED",
    evidenceClass: "VERIFIED_FACT",
    valueText: "Modal publishes a startup route with free credits for qualifying new customers, with eligibility based on funding stage and partner-network criteria.",
    eligibility: ["New Modal customer", "Seed/Series A or other published funding criteria", "Application and approval"],
    ownerOnlySteps: ["Confirm current funding criteria.", "Apply using accurate company facts.", "Review payment-method and post-credit terms before activation."],
    safePreparation: ["Add Modal as an optional GPU/evaluation backend.", "Prepare a short benchmark workload with strict timeout and budget.", "Keep deployment and credentials owner-authorized."],
    dataRisk: "GPU workloads and uploaded data require explicit handling.",
    stackability: "One-time grant; no reapplication assumption.",
    onePerPerson: false,
    tags: ["modal", "startup", "gpu", "credits"]
  }),
  record({
    id: "modal-academics",
    provider: "Modal",
    name: "Modal for Academics",
    kind: "academic_gpu_credits",
    regions: ["GLOBAL_INSTITUTIONS"],
    officialUrl: "https://modal.com/academics",
    lastVerifiedOn: "2026-08-21",
    expiresOn: null,
    status: "APPLICATION_REQUIRED",
    evidenceClass: "VERIFIED_FACT",
    valueText: "Modal publishes an academic route offering up to $10,000 in credits for graduate students, labs, and researchers, subject to program review.",
    eligibility: ["Genuine graduate/research affiliation", "Research project fit", "Application and approval"],
    ownerOnlySteps: ["Confirm actual academic/research status.", "Apply with a real research proposal and institution approvals.", "Keep commercial UberBond work separate unless the award explicitly permits it."],
    safePreparation: ["Track as a research-only compute route.", "Prepare synthetic benchmarks and reproducible experiments.", "Do not imply student status equals research eligibility."],
    dataRisk: "Research data and GPU workloads require institution-approved governance.",
    stackability: "Academic and startup routes are separate.",
    onePerPerson: false,
    tags: ["modal", "academic", "gpu", "research"]
  }),
  record({
    id: "fireworks-startups",
    provider: "Fireworks AI",
    name: "Fireworks for Startups",
    kind: "startup_inference_credits",
    regions: ["GLOBAL"],
    officialUrl: "https://fireworks.ai/startups",
    lastVerifiedOn: "2026-08-21",
    expiresOn: null,
    status: "APPLICATION_REQUIRED",
    evidenceClass: "VERIFIED_FACT",
    valueText: "Fireworks publishes a startup program offering credits, higher rate-limit options, technical support, community, and GTM benefits for qualifying private, for-profit, venture-backed startups within its criteria.",
    eligibility: ["Registered private for-profit company", "Functional website", "Published age/funding criteria", "Application and approval"],
    ownerOnlySteps: ["Confirm UberBond actually satisfies company, website, age, and funding criteria.", "Apply truthfully if eligible.", "Review credit expiry and pay-as-you-go behavior after credits."],
    safePreparation: ["Add Fireworks as an open-model inference adapter.", "Use provider-neutral evaluation fixtures.", "Do not claim credits from AMD or event promotions as startup-program approval."],
    dataRisk: "Fine-tuning and inference data require permission and retention review.",
    stackability: "Fireworks startup credits, AMD benefits, and event credits are separate routes.",
    onePerPerson: false,
    tags: ["fireworks", "startup", "inference", "credits"]
  }),
  record({
    id: "anthropic-external-researcher-access",
    provider: "Anthropic",
    name: "Anthropic External Researcher Access Program",
    kind: "research_api_credits",
    regions: ["ELIGIBLE_RESEARCHERS"],
    officialUrl: "https://support.anthropic.com/en/articles/9125743-what-is-the-external-researcher-access-program",
    lastVerifiedOn: "2026-08-21",
    expiresOn: null,
    status: "APPLICATION_REQUIRED",
    evidenceClass: "VERIFIED_FACT",
    valueText: "Anthropic documents free API credits for qualifying researchers working on high-priority AI safety and alignment topics; this is not general startup access.",
    eligibility: ["Genuine AI safety/alignment research", "High-priority topic fit", "Application and provider review"],
    ownerOnlySteps: ["Confirm genuine research alignment and institutional context.", "Apply with accurate project details.", "Use any credits only for the approved research purpose."],
    safePreparation: ["Keep safety research routing separate from commercial tasks.", "Prepare an evidence packet without inventing lab affiliation.", "Do not use a research grant as a general Claude Code subscription."],
    dataRisk: "Research prompts and datasets need approved handling.",
    stackability: "Program-specific.",
    onePerPerson: false,
    tags: ["anthropic", "research", "safety", "api"]
  }),
  record({
    id: "anthropic-vc-partner-program",
    provider: "Anthropic",
    name: "Anthropic VC partner program",
    kind: "startup_partner_credits",
    regions: ["GLOBAL"],
    officialUrl: "https://www.anthropic.com/contact-sales/vc-partner",
    lastVerifiedOn: "2026-08-21",
    expiresOn: null,
    status: "APPLICATION_REQUIRED",
    evidenceClass: "VERIFIED_FACT",
    valueText: "Anthropic publishes a VC partner route that can provide portfolio companies with benefits such as API credits and product access; the route is for venture funds/portfolio relationships, not direct account farming.",
    eligibility: ["Genuine VC fund or accelerator partner", "Portfolio-company relationship", "Anthropic approval"],
    ownerOnlySteps: ["Do not represent UberBond as a VC portfolio company without proof.", "Use this only through a genuine fund or accelerator relationship.", "Review partner terms and any portfolio-company restrictions."],
    safePreparation: ["Record the route as a partner-distribution dependency.", "Build a neutral startup packet that does not invent funding.", "Do not contact or apply automatically."],
    dataRisk: "Company and investor information may be shared with Anthropic.",
    stackability: "Partner route is separate from startup or research programs.",
    onePerPerson: false,
    tags: ["anthropic", "startup", "vc", "partner"]
  }),
  record({
    id: "anthropic-ai-for-science-program",
    provider: "Anthropic",
    name: "Anthropic AI for Science Program",
    kind: "science_grant",
    regions: ["ELIGIBLE_RESEARCHERS"],
    officialUrl: "https://www.anthropic.com/ai-for-science-program-rules",
    lastVerifiedOn: "2026-08-21",
    expiresOn: null,
    status: "APPLICATION_REQUIRED",
    evidenceClass: "VERIFIED_FACT",
    valueText: "Anthropic publishes rules for an AI for Science program with selected researcher awards and credits; awards are discretionary and research-specific.",
    eligibility: ["Genuine scientific research and applicant status", "Program rules and deadlines", "Provider selection"],
    ownerOnlySteps: ["Verify the research project and institutional permissions.", "Apply only with accurate scientific claims.", "Use awards only within the rules and approved scope."],
    safePreparation: ["Keep a research-grant lane separate from UberBond commercial access.", "Prepare reproducible, non-sensitive research artifacts.", "Do not use a medical-student identity to imply faculty status."],
    dataRisk: "Scientific and health data may require ethics review.",
    stackability: "Program-specific.",
    onePerPerson: false,
    tags: ["anthropic", "science", "research", "grant"]
  }),
  record({
    id: "oracle-startup-growth-engine-latam",
    provider: "Oracle",
    name: "Oracle Startup Growth Engine",
    kind: "startup_cloud_credits",
    regions: ["LATAM_INITIAL_MARKETS"],
    officialUrl: "https://www.oracle.com/latam/news/announcement/oracle-expands-oracle-partner-network-with-startup-growth-engine-2026-06-23/",
    lastVerifiedOn: "2026-08-21",
    expiresOn: null,
    status: "APPLICATION_REQUIRED",
    evidenceClass: "VERIFIED_FACT",
    valueText: "Oracle announces a Latin America Startup Growth Engine through its partner network with up to $60,000 in OCI credits or evaluation funding for qualified startups, initially in Brazil, Argentina, and Colombia, with stated expansion plans.",
    eligibility: ["Qualified high-growth startup", "Eligible partner-network tier", "Current country availability", "Application and Oracle approval"],
    ownerOnlySteps: ["Confirm country, company, partner-network, and stage eligibility.", "Apply with accurate company and product facts.", "Review OCI credit terms and any commercial commitments."],
    safePreparation: ["Add OCI as a provider-neutral cloud option.", "Do not represent Egypt as an initial-market country without current proof.", "Model portability and exit costs before any adoption."],
    dataRisk: "OCI credentials and customer data need owner-approved governance.",
    stackability: "Partner-network credits are separate from Oracle free tier and other programs.",
    onePerPerson: false,
    tags: ["oracle", "oci", "startup", "latam", "credits"]
  }),
  record({
    id: "mongodb-for-startups",
    provider: "MongoDB",
    name: "MongoDB for Startups",
    kind: "startup_database_credits",
    regions: ["GLOBAL"],
    officialUrl: "https://www.mongodb.com/startups",
    lastVerifiedOn: "2026-08-21",
    expiresOn: null,
    status: "APPLICATION_REQUIRED",
    evidenceClass: "VERIFIED_FACT",
    valueText: "MongoDB publishes a startup route with Atlas credits and partner benefits; Google Cloud's startup partner page also describes up to $5,000 Atlas credits, with additional terms for AI companies.",
    eligibility: ["Genuine startup qualification", "Current MongoDB and/or partner program criteria", "Application and approval"],
    ownerOnlySteps: ["Verify current startup eligibility and whether the route is direct or partner-mediated.", "Review data-region, retention, and expiry terms.", "Do not migrate production data before owner-approved backup and exit plan."],
    safePreparation: ["Add MongoDB as a storage option only after canonical data-model review.", "Use local or synthetic fixtures for evaluation.", "Do not create a second database registry."],
    dataRisk: "Customer data, backups, and vector data require strict governance.",
    stackability: "Direct and partner benefits must be checked for duplicate or overlapping credits.",
    onePerPerson: false,
    tags: ["mongodb", "atlas", "startup", "database"]
  }),
  record({
    id: "google-cloud-startup-perks",
    provider: "Google for Startups",
    name: "Google Cloud Startup Perks partner benefits",
    kind: "startup_partner_benefits",
    regions: ["GLOBAL"],
    officialUrl: "https://cloud.google.com/startup/perks",
    lastVerifiedOn: "2026-08-21",
    expiresOn: null,
    status: "OWNER_REVIEW_REQUIRED",
    evidenceClass: "VERIFIED_FACT",
    valueText: "Google Cloud publishes a partner-perks catalog for startup members, including time-limited benefits such as Datadog, ElevenLabs, GitLab, training, and other provider offers; individual redemption is provider-controlled.",
    eligibility: ["Eligible Google for Startups membership or tier", "Partner-specific eligibility and terms", "Current perk availability"],
    ownerOnlySteps: ["Confirm membership and inspect each current perk.", "Review provider-specific expiry, privacy, renewal, and usage limits.", "Activate only the benefits with a measured UberBond use case."],
    safePreparation: ["Import the perk catalog as a source family, not as guaranteed access.", "Deduplicate partner routes against direct records.", "Keep activation owner-only and receipts explicit."],
    dataRisk: "Each external partner has independent data and billing terms.",
    stackability: "Perks may overlap with direct provider routes; deduplication required.",
    onePerPerson: false,
    tags: ["google-cloud", "startup", "perks", "partner"]
  }),
  record({
    id: "google-cloud-ai-startup-program",
    provider: "Google Cloud",
    name: "Google Cloud AI startup program",
    kind: "ai_startup_cloud_credits",
    regions: ["GLOBAL"],
    officialUrl: "https://cloud.google.com/startup/ai",
    lastVerifiedOn: "2026-08-21",
    expiresOn: null,
    status: "APPLICATION_REQUIRED",
    evidenceClass: "VERIFIED_FACT",
    valueText: "Google Cloud publishes a dedicated AI startup route with up to $350,000 in credits over two years for qualifying AI startups under its funding, age, prior-credit, and product criteria.",
    eligibility: ["AI as primary product/solution foundation", "Published pre-seed/seed/Series A and age criteria", "Prior-credit limits", "Application and Google discretion"],
    ownerOnlySteps: ["Verify UberBond's actual company, funding, age, and prior-credit facts.", "Apply only if the business meets the published criteria.", "Review how credits cover Google versus third-party models and set burn limits."],
    safePreparation: ["Prepare a Google AI infrastructure plan and tier comparison.", "Do not claim qualification because UberBond is AI-assisted.", "Keep third-party model costs out of the Google-credit forecast unless explicitly covered."],
    dataRisk: "Cloud AI workloads and customer data require a full V9-approved deployment plan.",
    stackability: "Do not stack or double-count with pre-funded/early-stage Google routes.",
    onePerPerson: false,
    tags: ["google-cloud", "ai", "startup", "credits", "high-value"]
  })
];

export const AI_ACCESS_OPPORTUNITIES = Object.freeze(RAW_OPPORTUNITIES.map(deepFreeze));
export const AI_ACCESS_OPPORTUNITY_COUNT = AI_ACCESS_OPPORTUNITIES.length;
export const AI_ACCESS_EXTERNAL_EFFECTS = ZERO_EXTERNAL_EFFECTS;
export const AI_ACCESS_CANONICAL_REGISTRY_LINK = CANONICAL_OPPORTUNITY_REGISTRY_SCHEMA_VERSION;


export function getAIAccessUniverseCoverage() {
  const existing = new Set(AI_ACCESS_OPPORTUNITIES.map((item) => item.id));
  const families = AI_ACCESS_UNIVERSE_FAMILIES.map((family) => {
    const routeIds = AI_ACCESS_FAMILY_ROUTE_IDS[family] || [];
    const presentRouteIds = routeIds.filter((id) => existing.has(id));
    return {
      family,
      routeIds: [...routeIds],
      presentRouteIds,
      missingRouteIds: routeIds.filter((id) => !existing.has(id)),
      covered: routeIds.length > 0 && presentRouteIds.length === routeIds.length
    };
  });
  return {
    policyVersion: AI_ACCESS_UNIVERSE_POLICY_VERSION,
    catalogCount: AI_ACCESS_OPPORTUNITY_COUNT,
    familyCount: families.length,
    coveredFamilyCount: families.filter((family) => family.covered).length,
    uncoveredFamilies: families.filter((family) => !family.covered).map((family) => family.family),
    families
  };
}

export function validateAIAccessUniverseCoverage() {
  const coverage = getAIAccessUniverseCoverage();
  const failures = [];
  for (const family of coverage.families) {
    if (!family.covered) failures.push({ family: family.family, missingRouteIds: family.missingRouteIds });
  }
  return {
    ok: failures.length === 0,
    policyVersion: AI_ACCESS_UNIVERSE_POLICY_VERSION,
    catalogCount: coverage.catalogCount,
    familyCount: coverage.familyCount,
    coveredFamilyCount: coverage.coveredFamilyCount,
    failures
  };
}

export function listAIAccessOpportunities({ includeClosed = true } = {}) {
  return clone(includeClosed
    ? AI_ACCESS_OPPORTUNITIES
    : AI_ACCESS_OPPORTUNITIES.filter((item) => !['EXPIRED', 'PROGRAM_CLOSED'].includes(item.status)));
}

export function getAIAccessOpportunity(opportunityId) {
  const found = AI_ACCESS_OPPORTUNITIES.find((item) => item.id === opportunityId);
  return found ? clone(found) : null;
}

function accountFarmingRequested(context = {}) {
  return context.useMultipleAccounts === true
    || context.requestedAccountCount > 1
    || context.accountCount > 1
    || context.identityCount > 1
    || context.wantsToFarm === true;
}

function contextRegionMatches(item, context) {
  const country = String(context.country || '').toUpperCase();
  if (item.regions.includes('US') && country && country !== 'US') return false;
  if (item.regions.includes('EG') && country && country !== 'EG') return false;
  return true;
}

function ownerReviewResult(item, reasonCodes, timestamp, extra = {}) {
  return {
    ok: true,
    policyVersion: AI_ACCESS_OPPORTUNITY_POLICY_VERSION,
    status: 'OWNER_REVIEW_REQUIRED',
    opportunityId: item.id,
    provider: item.provider,
    timestamp,
    reasonCodes: [...new Set(reasonCodes)],
    ownerOnlySteps: clone(item.ownerOnlySteps),
    safePreparation: clone(item.safePreparation),
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS },
    ...extra
  };
}

export function evaluateAIAccessOpportunity({
  opportunityId,
  context = {},
  date = new Date()
} = {}) {
  const at = validDate(date);
  const timestamp = at.toISOString();
  const item = getAIAccessOpportunity(opportunityId);

  if (!item) {
    return {
      ok: false,
      policyVersion: AI_ACCESS_OPPORTUNITY_POLICY_VERSION,
      status: 'UNKNOWN_OPPORTUNITY',
      opportunityId: opportunityId || null,
      timestamp,
      reasonCodes: ['opportunity-not-in-catalog'],
      externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
    };
  }

  if (accountFarmingRequested(context)) {
    return {
      ok: false,
      policyVersion: AI_ACCESS_OPPORTUNITY_POLICY_VERSION,
      status: 'DENIED_ACCOUNT_FARMING',
      opportunityId: item.id,
      timestamp,
      reasonCodes: ['multiple-accounts-or-identities-not-permitted'],
      ownerOnlySteps: clone(item.ownerOnlySteps),
      externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
    };
  }

  if (item.status === 'EXPIRED' || item.status === 'PROGRAM_CLOSED') {
    return {
      ok: true,
      policyVersion: AI_ACCESS_OPPORTUNITY_POLICY_VERSION,
      status: item.status,
      opportunityId: item.id,
      timestamp,
      reasonCodes: ['catalog-route-not-current'],
      safePreparation: clone(item.safePreparation),
      externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
    };
  }

  if (item.expiresOn && timestamp.slice(0, 10) > item.expiresOn) {
    return {
      ok: true,
      policyVersion: AI_ACCESS_OPPORTUNITY_POLICY_VERSION,
      status: 'EXPIRED',
      opportunityId: item.id,
      timestamp,
      reasonCodes: ['published-expiry-passed'],
      externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
    };
  }

  if (!contextRegionMatches(item, context)) {
    return ownerReviewResult(item, ['region-or-country-does-not-match-published-route'], timestamp, {
      status: 'NOT_ELIGIBLE_GIVEN_CONTEXT'
    });
  }

  if (item.id === 'kiro-student-university-list' && context.institution) {
    const normalized = String(context.institution).toLowerCase();
    const matches = item.publishedInstitutionList.some((institution) =>
      normalized.includes(String(institution).toLowerCase())
    );
    if (!matches) {
      return ownerReviewResult(item, ['institution-not-in-published-list'], timestamp, {
        status: 'NOT_MATCHED_TO_PUBLISHED_LIST'
      });
    }
  }

  const reasons = [];
  if (context.alreadyUsed === true && item.onePerPerson) reasons.push('previous-use-needs-owner-confirmation');
  if (item.eligibility?.length) reasons.push('eligibility-proof-owner-required');
  if (item.status === 'FREE_TIER_AVAILABLE') reasons.push('account-and-key-owner-required');
  if (item.status === 'APPLICATION_REQUIRED') reasons.push('application-and-provider-approval-owner-required');
  if (item.kind === 'paid_bundle' || item.kind === 'regional_subscription') reasons.push('payment-or-plan-selection-owner-required');

  return ownerReviewResult(item, reasons.length ? reasons : ['current-eligibility-not-proven'], timestamp, {
    status: item.status === 'FREE_TIER_AVAILABLE' ? 'FREE_TIER_AVAILABLE' : item.status
  });
}

export function buildAIAccessOwnerActionQueue({
  context = {},
  date = new Date(),
  includeClosed = false
} = {}) {
  const at = validDate(date);
  return listAIAccessOpportunities({ includeClosed })
    .map((item) => evaluateAIAccessOpportunity({ opportunityId: item.id, context, date: at }))
    .filter((decision) => !['EXPIRED', 'PROGRAM_CLOSED', 'NOT_ELIGIBLE_GIVEN_CONTEXT', 'NOT_MATCHED_TO_PUBLISHED_LIST', 'DENIED_ACCOUNT_FARMING'].includes(decision.status))
    .map((decision, index) => ({
      queueId: digest({ policyVersion: AI_ACCESS_OPPORTUNITY_POLICY_VERSION, opportunityId: decision.opportunityId }),
      order: index + 1,
      opportunityId: decision.opportunityId,
      provider: decision.provider,
      status: decision.status,
      ownerOnlySteps: decision.ownerOnlySteps,
      reasonCodes: decision.reasonCodes,
      consequenceClass: 'OWNER_REQUIRED',
      automaticActions: [],
      externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
    }));
}

const MODEL_ROUTING_PLAN = Object.freeze([
  {
    taskClass: 'deterministic_math_and_policy',
    preferred: 'deterministic-code',
    fallbacks: [],
    reason: 'Do not spend model credits on deterministic work.'
  },
  {
    taskClass: 'fast_classification_or_triage',
    preferred: 'groq-free-plan',
    fallbacks: ['cerebras-free-trial', 'gemini-api-free-tier', 'openrouter-free-models'],
    reason: 'Use low-cost providers only for redacted, reversible classifications.'
  },
  {
    taskClass: 'general_research_draft',
    preferred: 'gemini-api-free-tier',
    fallbacks: ['mistral-le-chat-free', 'deepseek-free-app', 'openrouter-free-models'],
    reason: 'Free routes are exploratory only; official sources remain required.'
  },
  {
    taskClass: 'long_context_or_tool_use_evaluation',
    preferred: 'cohere-command-a-plus-trial',
    fallbacks: ['gemini-api-free-tier', 'openrouter-free-models'],
    reason: 'Benchmark quality and context handling before routing real work.'
  },
  {
    taskClass: 'audio_or_voice_asset_preparation',
    preferred: 'elevenlabs-api-credits',
    fallbacks: [],
    reason: 'Only owned or licensed content; voice/likeness checks remain mandatory.'
  },
  {
    taskClass: 'coding_agent',
    preferred: 'owner-approved-coding-provider',
    fallbacks: ['kiro-startups', 'lovable-student', 'jetbrains-student'],
    reason: 'No coding agent receives credentials or production authority by default.'
  },
  {
    taskClass: 'customer_secret_or_production_action',
    preferred: 'blocked-until-v9-authorized-provider',
    fallbacks: [],
    reason: 'Free-tier data terms and external-effect policy prohibit unattended use.'
  }
]);

export function getAIAccessModelRoutingPlan() {
  return clone(MODEL_ROUTING_PLAN);
}

export function buildAIAccessReceipt({
  context = {},
  date = new Date(),
  selectedOpportunityIds = null
} = {}) {
  const at = validDate(date);
  const ids = Array.isArray(selectedOpportunityIds) && selectedOpportunityIds.length
    ? selectedOpportunityIds
    : AI_ACCESS_OPPORTUNITIES.map((item) => item.id);
  const decisions = ids.map((opportunityId) =>
    evaluateAIAccessOpportunity({ opportunityId, context, date: at })
  );
  const ownerQueue = buildAIAccessOwnerActionQueue({ context, date: at });
  const receipt = {
    receiptType: 'ai_access_opportunity_catalog',
    policyVersion: AI_ACCESS_OPPORTUNITY_POLICY_VERSION,
    referenceDate: at.toISOString(),
    catalogCount: AI_ACCESS_OPPORTUNITY_COUNT,
    selectedCount: ids.length,
    decisions,
    ownerActionCount: ownerQueue.length,
    ownerActionQueueIds: ownerQueue.map((item) => item.queueId),
    modelRoutingPlan: getAIAccessModelRoutingPlan(),
    truthClassification: 'INTERFACE_ONLY',
    commercialState: {
      verifiedRevenue: 0,
      verifiedCustomers: 0,
      verifiedPayments: 0,
      note: 'Access eligibility, credits, and subscriptions are not revenue proof.'
    },
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS },
    receiptDigest: digest({
      policyVersion: AI_ACCESS_OPPORTUNITY_POLICY_VERSION,
      referenceDate: at.toISOString(),
      ids
    })
  };
  return receipt;
}

export async function logAIAccessReceipt(store, receipt) {
  if (!store || typeof store.log !== 'function' || !receipt?.receiptDigest) return null;
  return store.log('ai_access_opportunity_catalog', {
    receiptDigest: receipt.receiptDigest,
    policyVersion: receipt.policyVersion,
    catalogCount: receipt.catalogCount,
    selectedCount: receipt.selectedCount,
    ownerActionCount: receipt.ownerActionCount,
    truthClassification: receipt.truthClassification,
    externalEffectLedger: receipt.externalEffectLedger,
    timestamp: receipt.referenceDate
  });
}

export function validateAIAccessCatalog(records = AI_ACCESS_OPPORTUNITIES) {
  const list = Array.isArray(records) ? records : [];
  const failures = [];
  const ids = new Set();
  for (const [index, item] of list.entries()) {
    if (!item || typeof item !== 'object') {
      failures.push({ index, reason: 'record-object-required' });
      continue;
    }
    if (!item.id) failures.push({ index, reason: 'id-required' });
    if (item.id && ids.has(item.id)) failures.push({ index, reason: 'duplicate-id', id: item.id });
    if (item.id) ids.add(item.id);
    if (!/^https:\/\//.test(String(item.officialUrl || ''))) failures.push({ index, reason: 'official-https-url-required' });
    if (item.evidenceClass !== 'VERIFIED_FACT') failures.push({ index, reason: 'official-catalog-record-must-be-verified-fact', id: item.id });
    if (!AI_ACCESS_STATUSES.includes(item.status)) failures.push({ index, reason: 'unknown-status', id: item.id });
    if (!item.lastVerifiedOn) failures.push({ index, reason: 'last-verified-date-required', id: item.id });
    if (!item.policy || item.policy.automaticApplication !== false) failures.push({ index, reason: 'automatic-application-must-be-disabled', id: item.id });
    if (!item.externalEffectLedger || item.externalEffectLedger.spendCents !== 0) failures.push({ index, reason: 'zero-effect-ledger-required', id: item.id });
  }
  return {
    ok: failures.length === 0,
    policyVersion: AI_ACCESS_OPPORTUNITY_POLICY_VERSION,
    count: list.length,
    uniqueIdCount: ids.size,
    failures
  };
}

export function assertNoAccountFarming(context = {}) {
  if (accountFarmingRequested(context)) {
    return { ok: false, reason: 'multiple-accounts-or-identities-not-permitted' };
  }
  return { ok: true, reason: null };
}
