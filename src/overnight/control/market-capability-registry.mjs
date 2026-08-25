// Bounded, machine-readable inventory of useful market capability primitives.
//
// This is a control-plane catalogue, not a second product implementation. Each
// primitive points at the UberBond modules that should be reused or composed
// before anyone proposes new code. It contains no provider adapter, network
// boundary, repository writer, spend authority, or sovereignty authority.

import crypto from 'node:crypto';

export const MARKET_CAPABILITY_REGISTRY_POLICY_VERSION = 'overnight-market-capability-registry-1.0.0';
export const CAPABILITY_REGISTRY_SCHEMA_VERSION = 'market-capability-primitive-1.0.0';

export const CAPABILITY_REUSE_STATES = Object.freeze([
  'REUSE_READY',
  'COMPOSE_REQUIRED',
  'ADAPTER_GATED',
  'MISSING'
]);

export const CAPABILITY_EVIDENCE_STATES = Object.freeze([
  'IMPLEMENTED_TEST_VERIFIED',
  'PARTIAL',
  'RESEARCH_ONLY',
  'UNKNOWN'
]);

export const CAPABILITY_PRIORITIES = Object.freeze(['P0', 'P1', 'P2', 'P3']);

export const CAPABILITY_REGISTRY_REQUIRED_FIELDS = Object.freeze([
  'id',
  'family',
  'primitive',
  'marketAnalogues',
  'existingModules',
  'reuseState',
  'priority',
  'evidenceState'
]);

const ECONOMIC_KEYS = Object.freeze([
  'expectedRevenueCents',
  'deliveryCostCents',
  'conversionProbability',
  'recurringProbability',
  'founderMinutes',
  'buildMinutes',
  'runCostCents',
  'riskPenaltyCents',
  'evidenceConfidence'
]);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function text(value, max = 240) {
  return String(value ?? '').trim().slice(0, max);
}

function slug(value, max = 120) {
  return text(value, max)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function uniqueStrings(values, max = 20) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(value => text(value, 200)).filter(Boolean))].slice(0, max);
}

function emptyEconomics() {
  return Object.fromEntries(ECONOMIC_KEYS.map(key => [key, null]));
}

function normalizeEconomics(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return Object.fromEntries(ECONOMIC_KEYS.map(key => [key, Object.hasOwn(source, key) ? source[key] : null]));
}

function normalizeModule(value) {
  if (typeof value === 'string') {
    const path = text(value, 240);
    return path ? { path, role: 'existing UberBond module', coverage: 'PARTIAL' } : null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const path = text(value.path || value.module, 240);
  if (!path || (!path.startsWith('src/') && !path.startsWith('src/omnia-v9/'))) return null;
  if (path.includes('lite/')) return null;
  return {
    path,
    role: text(value.role, 240) || 'existing UberBond module',
    coverage: ['DIRECT', 'COMPOSED', 'PARTIAL', 'ADAPTER_GATED', 'NONE'].includes(value.coverage)
      ? value.coverage
      : 'PARTIAL'
  };
}

function normalizeModules(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const modules = [];
  for (const item of value) {
    const normalized = normalizeModule(item);
    if (!normalized || seen.has(normalized.path)) continue;
    seen.add(normalized.path);
    modules.push(normalized);
  }
  return modules.slice(0, 12);
}

function invalid(reasonCodes, extra = {}) {
  return {
    ok: false,
    policyVersion: MARKET_CAPABILITY_REGISTRY_POLICY_VERSION,
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    ...extra
  };
}

export function normalizeCapabilityPrimitive(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return invalid(['capability-object-required']);
  }

  const id = slug(input.id);
  const family = slug(input.family);
  const primitive = slug(input.primitive || input.id);
  const reuseState = text(input.reuseState, 40).toUpperCase();
  const priority = text(input.priority, 4).toUpperCase();
  const evidenceState = text(input.evidenceState, 40).toUpperCase();
  const reasonCodes = [];

  if (!id) reasonCodes.push('capability-id-required');
  if (!family) reasonCodes.push('capability-family-required');
  if (!primitive) reasonCodes.push('capability-primitive-required');
  if (!CAPABILITY_REUSE_STATES.includes(reuseState)) reasonCodes.push('invalid-reuse-state');
  if (!CAPABILITY_PRIORITIES.includes(priority)) reasonCodes.push('invalid-priority');
  if (!CAPABILITY_EVIDENCE_STATES.includes(evidenceState)) reasonCodes.push('invalid-evidence-state');

  const marketAnalogues = uniqueStrings(input.marketAnalogues || input.marketFeatures);
  if (marketAnalogues.length === 0) reasonCodes.push('market-analogue-required');

  const existingModules = normalizeModules(input.existingModules || input.uberBondModules);
  if (reuseState !== 'MISSING' && existingModules.length === 0) reasonCodes.push('existing-module-map-required');
  if (reuseState === 'MISSING' && existingModules.length > 0) reasonCodes.push('missing-state-cannot-map-coverage');

  const normalized = {
    schemaVersion: CAPABILITY_REGISTRY_SCHEMA_VERSION,
    id,
    dedupeKey: `${family}:${primitive}`,
    family,
    primitive,
    label: text(input.label, 180) || id,
    description: text(input.description, 500),
    marketAnalogues,
    existingModules,
    existingModulePaths: existingModules.map(module => module.path),
    reuseState,
    priority,
    evidenceState,
    evidenceRefs: uniqueStrings(input.evidenceRefs, 12),
    constraints: uniqueStrings(input.constraints, 12),
    economics: normalizeEconomics(input.economics || emptyEconomics()),
    killSwitches: uniqueStrings(input.killSwitches, 12),
    expiresAt: input.expiresAt == null ? null : text(input.expiresAt, 80)
  };

  if (reasonCodes.length) return invalid(reasonCodes, { candidate: normalized });
  return { ok: true, policyVersion: MARKET_CAPABILITY_REGISTRY_POLICY_VERSION, capability: normalized };
}

function comparableCapability(capability) {
  return {
    schemaVersion: capability.schemaVersion,
    id: capability.id,
    dedupeKey: capability.dedupeKey,
    family: capability.family,
    primitive: capability.primitive,
    label: capability.label,
    description: capability.description,
    marketAnalogues: capability.marketAnalogues,
    existingModules: capability.existingModules,
    existingModulePaths: capability.existingModulePaths,
    reuseState: capability.reuseState,
    priority: capability.priority,
    evidenceState: capability.evidenceState,
    evidenceRefs: capability.evidenceRefs,
    constraints: capability.constraints,
    economics: capability.economics,
    killSwitches: capability.killSwitches,
    expiresAt: capability.expiresAt
  };
}

export function dedupeCapabilityPrimitives(entries = []) {
  if (!Array.isArray(entries)) return invalid(['capability-registry-array-required']);

  const kept = [];
  const byDedupeKey = new Map();
  const duplicates = [];
  const conflicts = [];
  const errors = [];

  entries.forEach((entry, index) => {
    const normalized = normalizeCapabilityPrimitive(entry);
    if (!normalized.ok) {
      errors.push({ index, reasonCodes: normalized.reasonCodes, id: normalized.candidate?.id || null });
      return;
    }
    const capability = normalized.capability;
    const previous = byDedupeKey.get(capability.dedupeKey);
    if (!previous) {
      byDedupeKey.set(capability.dedupeKey, capability);
      kept.push(capability);
      return;
    }

    if (JSON.stringify(comparableCapability(previous)) === JSON.stringify(comparableCapability(capability))) {
      duplicates.push({ dedupeKey: capability.dedupeKey, keptId: previous.id, droppedId: capability.id, index });
    } else {
      conflicts.push({ dedupeKey: capability.dedupeKey, keptId: previous.id, conflictingId: capability.id, index });
    }
  });

  return {
    ok: errors.length === 0 && conflicts.length === 0,
    policyVersion: MARKET_CAPABILITY_REGISTRY_POLICY_VERSION,
    entries: kept,
    registryCount: kept.length,
    duplicates,
    conflicts,
    errors,
    reasonCodes: [
      ...(errors.length ? ['invalid-capability-entry'] : []),
      ...(conflicts.length ? ['conflicting-capability-duplicate'] : [])
    ]
  };
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function buildMarketCapabilityRegistry({ entries = MARKET_CAPABILITY_REGISTRY } = {}) {
  const deduped = dedupeCapabilityPrimitives(entries);
  if (!deduped.ok) return { ...deduped, status: 'REVIEW_REQUIRED', registryDigest: null };
  return {
    ...deduped,
    ok: true,
    status: 'REGISTRY_READY',
    registryDigest: digest(deduped.entries)
  };
}

const RAW_MARKET_CAPABILITY_REGISTRY = [
  {
    id: 'account-intent-detection', family: 'account-intelligence', primitive: 'account-intent-detection',
    label: 'Account intent detection and buying-moment prioritization',
    description: 'Turn observed market, website, community, and first-party signals into a ranked account queue.',
    marketAnalogues: ['6sense intent', 'Common Room signals', 'ZoomInfo intent'],
    existingModules: [
      { path: 'src/market-signal.mjs', role: 'normalizes caller-supplied market signals', coverage: 'DIRECT' },
      { path: 'src/market-signal-registry.mjs', role: 'bounded signal ingestion and freshness', coverage: 'DIRECT' },
      { path: 'src/opportunity-registry.mjs', role: 'evidence-aware scoring', coverage: 'COMPOSED' }
    ],
    reuseState: 'COMPOSE_REQUIRED', priority: 'P0', evidenceState: 'IMPLEMENTED_TEST_VERIFIED',
    evidenceRefs: ['src/market-signal.mjs', 'src/market-signal-registry.mjs'],
    constraints: ['caller-supplied evidence only', 'signal is not proof of revenue']
  },
  {
    id: 'identity-resolution', family: 'account-intelligence', primitive: 'identity-resolution',
    label: 'Evidence-bound person and organization identity resolution',
    description: 'Join observations to organizations and people without inferring private contact data.',
    marketAnalogues: ['Apollo identity', 'Clay enrichment', 'Common Room identity resolution'],
    existingModules: [
      { path: 'src/profile-discovery-provenance.mjs', role: 'preserves profile provenance', coverage: 'DIRECT' },
      { path: 'src/prospect-evidence-reconciliation.mjs', role: 'reconciles evidence classes and conflicts', coverage: 'COMPOSED' },
      { path: 'src/prospect-qualification.mjs', role: 'qualification gate', coverage: 'COMPOSED' }
    ],
    reuseState: 'COMPOSE_REQUIRED', priority: 'P0', evidenceState: 'IMPLEMENTED_TEST_VERIFIED',
    evidenceRefs: ['src/profile-discovery-provenance.mjs', 'src/prospect-evidence-reconciliation.mjs'],
    constraints: ['no guessed personal email', 'suppression dominates later observations']
  },
  {
    id: 'multi-provider-enrichment-waterfall', family: 'account-intelligence', primitive: 'multi-provider-enrichment-waterfall',
    label: 'Provider-neutral enrichment waterfall with budget governance',
    description: 'Try approved data sources in sequence, stop on sufficient evidence, and account for cost and uncertainty.',
    marketAnalogues: ['Clay waterfalls', 'Apollo enrichment', 'Hunter verification'],
    existingModules: [
      { path: 'src/prospect-enrichment-planner.mjs', role: 'plans provider-neutral enrichment steps', coverage: 'DIRECT' },
      { path: 'src/prospect-enrichment-budget-gate.mjs', role: 'caps enrichment budget', coverage: 'DIRECT' },
      { path: 'src/prospect-evidence-reconciliation.mjs', role: 'keeps evidence status honest', coverage: 'COMPOSED' }
    ],
    reuseState: 'REUSE_READY', priority: 'P0', evidenceState: 'IMPLEMENTED_TEST_VERIFIED',
    evidenceRefs: ['src/prospect-enrichment-planner.mjs', 'src/prospect-enrichment-budget-gate.mjs'],
    constraints: ['provider access and terms are external gates', 'unknown remains unknown']
  },
  {
    id: 'lookalike-account-discovery', family: 'account-intelligence', primitive: 'lookalike-account-discovery',
    label: 'Lookalike account and capability-fit discovery',
    description: 'Find organizations similar to evidence-backed targets using declared attributes rather than fabricated similarity.',
    marketAnalogues: ['Ocean.io lookalikes', 'Apollo similar companies', 'ZoomInfo company search'],
    existingModules: [
      { path: 'src/lead-intelligence-v3.mjs', role: 'lead intelligence observations', coverage: 'PARTIAL' },
      { path: 'src/prospect-qualification.mjs', role: 'fit qualification', coverage: 'COMPOSED' },
      { path: 'src/opportunity-registry.mjs', role: 'economic prioritization', coverage: 'COMPOSED' }
    ],
    reuseState: 'COMPOSE_REQUIRED', priority: 'P1', evidenceState: 'PARTIAL',
    evidenceRefs: ['src/lead-intelligence-v3.mjs'],
    constraints: ['similarity is a hypothesis until buyer evidence exists']
  },
  {
    id: 'lead-scoring-and-routing', family: 'revenue-orchestration', primitive: 'lead-scoring-and-routing',
    label: 'Evidence-aware lead scoring and next-best routing',
    description: 'Score fit, urgency, evidence quality, and economic value, then route to an allowed next action.',
    marketAnalogues: ['HubSpot lead scoring', 'Salesforce scoring', '6sense account prioritization'],
    existingModules: [
      { path: 'src/prospect-qualification-pipeline.mjs', role: 'qualification pipeline', coverage: 'DIRECT' },
      { path: 'src/prospect-qualification-gate.mjs', role: 'qualification admission', coverage: 'DIRECT' },
      { path: 'src/distribution-channel.mjs', role: 'channel gating', coverage: 'COMPOSED' }
    ],
    reuseState: 'REUSE_READY', priority: 'P0', evidenceState: 'IMPLEMENTED_TEST_VERIFIED',
    evidenceRefs: ['src/prospect-qualification-pipeline.mjs', 'src/distribution-channel.mjs'],
    constraints: ['no route may grant send or spend authority']
  },
  {
    id: 'outbound-sequencing', family: 'distribution', primitive: 'outbound-sequencing',
    label: 'Evidence-bound outbound sequencing and follow-up orchestration',
    description: 'Prepare bounded, personalized sequences with idempotency, suppression, pacing, and stop conditions.',
    marketAnalogues: ['Instantly sequences', 'Smartlead campaigns', 'Salesloft cadences'],
    existingModules: [
      { path: 'src/outreach-automation.mjs', role: 'sequence and follow-up planning', coverage: 'DIRECT' },
      { path: 'src/outreach-workbench.mjs', role: 'draft and campaign workbench', coverage: 'COMPOSED' },
      { path: 'src/send-safety.mjs', role: 'send safety boundary', coverage: 'DIRECT' }
    ],
    reuseState: 'REUSE_READY', priority: 'P0', evidenceState: 'IMPLEMENTED_TEST_VERIFIED',
    evidenceRefs: ['src/outreach-automation.mjs', 'src/send-safety.mjs'],
    constraints: ['live sending remains externally gated', 'uncertain sends are not blind retried']
  },
  {
    id: 'deliverability-and-inbox-placement', family: 'distribution', primitive: 'deliverability-and-inbox-placement',
    label: 'Sender health, authentication, warm-up, and inbox-placement controls',
    description: 'Protect sender reputation using measured readiness, caps, suppression, and recovery states.',
    marketAnalogues: ['Instantly deliverability', 'Smartlead mailbox rotation', 'Outreach sender health'],
    existingModules: [
      { path: 'src/deliverability-guard.mjs', role: 'outbound admission', coverage: 'DIRECT' },
      { path: 'src/sending-domain-registry.mjs', role: 'domain readiness registry', coverage: 'DIRECT' },
      { path: 'src/warmup-orchestrator.mjs', role: 'warm-up planning', coverage: 'COMPOSED' },
      { path: 'src/reservation-recovery.mjs', role: 'uncertain-send recovery', coverage: 'DIRECT' }
    ],
    reuseState: 'REUSE_READY', priority: 'P0', evidenceState: 'IMPLEMENTED_TEST_VERIFIED',
    evidenceRefs: ['src/deliverability-guard.mjs', 'src/sending-domain-registry.mjs'],
    constraints: ['no volume claim without measured capacity', 'DNS and mailbox activation are external']
  },
  {
    id: 'multichannel-conversation-orchestration', family: 'distribution', primitive: 'multichannel-conversation-orchestration',
    label: 'Multichannel conversation orchestration with channel-specific consent',
    description: 'Coordinate permitted email, inbound, partner, and future channels without collapsing their policies.',
    marketAnalogues: ['HighLevel multichannel', 'Salesloft orchestration', 'HubSpot journeys'],
    existingModules: [
      { path: 'src/distribution-channel.mjs', role: 'channel registry and gate', coverage: 'DIRECT' },
      { path: 'src/inbound-feedback-kernel.mjs', role: 'inbound feedback consequences', coverage: 'COMPOSED' },
      { path: 'src/outreach-governance.mjs', role: 'outreach governance', coverage: 'COMPOSED' }
    ],
    reuseState: 'COMPOSE_REQUIRED', priority: 'P1', evidenceState: 'PARTIAL',
    evidenceRefs: ['src/distribution-channel.mjs', 'src/inbound-feedback-kernel.mjs'],
    constraints: ['channel policy must be checked independently', 'read-only sensing never gains send authority']
  },
  {
    id: 'conversation-and-reply-intelligence', family: 'revenue-orchestration', primitive: 'conversation-and-reply-intelligence',
    label: 'Reply, conversation, and buying-signal intelligence',
    description: 'Classify replies and interactions, preserve provenance, and propose bounded local next steps.',
    marketAnalogues: ['Gong conversation intelligence', 'Outreach Kaia', 'Instantly AI Inbox'],
    existingModules: [
      { path: 'src/inbound-classify.mjs', role: 'inbound classification', coverage: 'DIRECT' },
      { path: 'src/inbound-feedback-kernel.mjs', role: 'local feedback consequences', coverage: 'DIRECT' },
      { path: 'src/outreach-provider-events.mjs', role: 'provider event normalization', coverage: 'COMPOSED' }
    ],
    reuseState: 'REUSE_READY', priority: 'P1', evidenceState: 'IMPLEMENTED_TEST_VERIFIED',
    evidenceRefs: ['src/inbound-classify.mjs', 'src/inbound-feedback-kernel.mjs'],
    constraints: ['classification is not customer consent or payment proof']
  },
  {
    id: 'inbound-chat-qualification', family: 'inbound-conversion', primitive: 'inbound-chat-qualification',
    label: 'Inbound chat qualification and human-safe escalation',
    description: 'Qualify inbound demand, collect declared requirements, and hand off when authority or confidence is insufficient.',
    marketAnalogues: ['Intercom Fin', 'HighLevel conversation AI', 'Salesloft chat agents'],
    existingModules: [
      { path: 'src/inbound-classify.mjs', role: 'inbound signal classification', coverage: 'PARTIAL' },
      { path: 'src/lead-operations.mjs', role: 'lead lifecycle operations', coverage: 'PARTIAL' },
      { path: 'src/operator-escalation.mjs', role: 'owner escalation', coverage: 'COMPOSED' }
    ],
    reuseState: 'ADAPTER_GATED', priority: 'P1', evidenceState: 'PARTIAL',
    evidenceRefs: ['src/inbound-classify.mjs', 'src/operator-escalation.mjs'],
    constraints: ['no autonomous negotiation or regulated advice', 'transport proof is separate from intent']
  },
  {
    id: 'calendar-routing-and-booking', family: 'inbound-conversion', primitive: 'calendar-routing-and-booking',
    label: 'Qualification-aware calendar routing and booking preparation',
    description: 'Match qualified demand to a permitted scheduling path without treating a form submission as a booking.',
    marketAnalogues: ['Calendly routing', 'Chili Piper inbound', 'HubSpot meetings'],
    existingModules: [
      { path: 'src/task-universe.mjs', role: 'bounded lifecycle tasks', coverage: 'COMPOSED' },
      { path: 'src/service-sku.mjs', role: 'offer and delivery requirement context', coverage: 'PARTIAL' },
      { path: 'src/adapter-contracts.mjs', role: 'future provider adapter boundary', coverage: 'ADAPTER_GATED' }
    ],
    reuseState: 'ADAPTER_GATED', priority: 'P1', evidenceState: 'RESEARCH_ONLY',
    evidenceRefs: ['src/adapter-contracts.mjs'],
    constraints: ['provider booking receipt required', 'no calendar credentials in this lane']
  },
  {
    id: 'revenue-journey-monitoring', family: 'revenue-assurance', primitive: 'revenue-journey-monitoring',
    label: 'Synthetic revenue-journey monitoring and breakage evidence',
    description: 'Test a buyer journey end to end and preserve evidence of where a lead, booking, or payment path breaks.',
    marketAnalogues: ['Microsoft Clarity journey evidence', 'Datadog synthetic monitoring', 'QA diagnostics'],
    existingModules: [
      { path: 'src/browser-crawler.mjs', role: 'browser journey evidence', coverage: 'DIRECT' },
      { path: 'src/audit-rules.mjs', role: 'deterministic audit checks', coverage: 'DIRECT' },
      { path: 'src/causal-attribution-spine.mjs', role: 'lineage without causal laundering', coverage: 'COMPOSED' }
    ],
    reuseState: 'REUSE_READY', priority: 'P0', evidenceState: 'IMPLEMENTED_TEST_VERIFIED',
    evidenceRefs: ['src/browser-crawler.mjs', 'src/audit-rules.mjs'],
    constraints: ['synthetic evidence is not a customer acceptance receipt', 'customer systems require authorization']
  },
  {
    id: 'crm-pipeline-and-next-best-action', family: 'revenue-orchestration', primitive: 'crm-pipeline-and-next-best-action',
    label: 'Evidence-linked CRM lifecycle and next-best action queue',
    description: 'Maintain a durable opportunity-to-customer lifecycle and generate bounded next steps.',
    marketAnalogues: ['HubSpot CRM', 'Attio AI CRM', 'Close CRM'],
    existingModules: [
      { path: 'src/store.mjs', role: 'durable state and idempotency', coverage: 'DIRECT' },
      { path: 'src/lead-operations.mjs', role: 'lead lifecycle operations', coverage: 'DIRECT' },
      { path: 'src/task-universe.mjs', role: 'bounded next-task generation', coverage: 'COMPOSED' },
      { path: 'src/dossier.mjs', role: 'evidence-linked dossier', coverage: 'COMPOSED' }
    ],
    reuseState: 'COMPOSE_REQUIRED', priority: 'P0', evidenceState: 'IMPLEMENTED_TEST_VERIFIED',
    evidenceRefs: ['src/store.mjs', 'src/task-universe.mjs'],
    constraints: ['next action is not authorization for an external effect']
  },
  {
    id: 'content-repurposing-owned-distribution', family: 'owned-distribution', primitive: 'content-repurposing-owned-distribution',
    label: 'Rights-aware content repurposing and owned-channel distribution',
    description: 'Turn owned or licensed source material into channel-specific assets while preserving rights and evidence.',
    marketAnalogues: ['Buffer publishing', 'Repurpose.io', 'Hootsuite social OS'],
    existingModules: [],
    reuseState: 'MISSING', priority: 'P2', evidenceState: 'RESEARCH_ONLY',
    evidenceRefs: [],
    constraints: ['rights and platform authorization required', 'no scraping or copied content']
  },
  {
    id: 'seo-and-ai-search-visibility', family: 'owned-distribution', primitive: 'seo-and-ai-search-visibility',
    label: 'SEO, structured-data, and AI-search visibility measurement',
    description: 'Audit owned assets and measure search visibility without promising rankings or citations.',
    marketAnalogues: ['Semrush SEO', 'Ahrefs AI visibility', 'Google Search Console'],
    existingModules: [
      { path: 'src/browser-crawler.mjs', role: 'owned-site evidence capture', coverage: 'PARTIAL' },
      { path: 'src/audit-rules.mjs', role: 'technical audit checks', coverage: 'COMPOSED' },
      { path: 'src/market-signal.mjs', role: 'market observation envelope', coverage: 'PARTIAL' }
    ],
    reuseState: 'COMPOSE_REQUIRED', priority: 'P2', evidenceState: 'PARTIAL',
    evidenceRefs: ['src/browser-crawler.mjs', 'src/audit-rules.mjs'],
    constraints: ['visibility is an observation, not a guarantee', 'search APIs and terms are external']
  },
  {
    id: 'paid-conversion-feedback', family: 'acquisition-measurement', primitive: 'paid-conversion-feedback',
    label: 'Paid-acquisition conversion feedback and offline outcome measurement',
    description: 'Connect verified downstream outcomes back to acquisition systems without manufacturing attribution.',
    marketAnalogues: ['Google Ads offline conversions', 'Meta lead quality feedback', 'HubSpot campaign reporting'],
    existingModules: [
      { path: 'src/commercial-outcome.mjs', role: 'payment-proof outcome lineage', coverage: 'DIRECT' },
      { path: 'src/causal-attribution-spine.mjs', role: 'direct/attributed/inferred distinctions', coverage: 'DIRECT' },
      { path: 'src/adapter-contracts.mjs', role: 'future paid-platform boundary', coverage: 'ADAPTER_GATED' }
    ],
    reuseState: 'ADAPTER_GATED', priority: 'P2', evidenceState: 'PARTIAL',
    evidenceRefs: ['src/commercial-outcome.mjs', 'src/causal-attribution-spine.mjs'],
    constraints: ['cleared payment is the economic anchor', 'ad credentials and platform consent are external']
  },
  {
    id: 'partner-and-referral-ecosystem', family: 'ecosystem-distribution', primitive: 'partner-and-referral-ecosystem',
    label: 'Partner discovery, account mapping, referral, and commission evidence',
    description: 'Find lawful partner routes and measure introductions through verified commercial outcomes.',
    marketAnalogues: ['PartnerStack', 'Crossbeam account mapping', 'Rewardful referrals'],
    existingModules: [
      { path: 'src/distribution-channel.mjs', role: 'channel evidence gate', coverage: 'DIRECT' },
      { path: 'src/commercial-outcome.mjs', role: 'outcome and payment lineage', coverage: 'COMPOSED' },
      { path: 'src/commercial-learning.mjs', role: 'measured learning', coverage: 'COMPOSED' }
    ],
    reuseState: 'COMPOSE_REQUIRED', priority: 'P0', evidenceState: 'PARTIAL',
    evidenceRefs: ['src/distribution-channel.mjs', 'src/commercial-outcome.mjs'],
    constraints: ['partner consent and contract required', 'no unsolicited platform abuse']
  },
  {
    id: 'marketplace-and-rfp-distribution', family: 'ecosystem-distribution', primitive: 'marketplace-and-rfp-distribution',
    label: 'Marketplace, procurement, and RFP opportunity intake',
    description: 'Normalize public buyer demand and procurement signals into evidence-bound opportunities.',
    marketAnalogues: ['Upwork Project Catalog', 'G2 buyer intent', 'Clutch listings'],
    existingModules: [
      { path: 'src/market-signal-registry.mjs', role: 'bounded signal ingestion', coverage: 'DIRECT' },
      { path: 'src/opportunity-factory.mjs', role: 'opportunity normalization', coverage: 'COMPOSED' },
      { path: 'src/offer-compiler.mjs', role: 'offer preparation', coverage: 'COMPOSED' }
    ],
    reuseState: 'COMPOSE_REQUIRED', priority: 'P1', evidenceState: 'PARTIAL',
    evidenceRefs: ['src/market-signal-registry.mjs', 'src/opportunity-factory.mjs'],
    constraints: ['listing/account authority required', 'no automated submissions in this lane']
  },
  {
    id: 'workflow-and-agent-orchestration', family: 'autonomy-control', primitive: 'workflow-and-agent-orchestration',
    label: 'Bounded workflow and multi-agent orchestration',
    description: 'Route bounded research and engineering tasks through budgets, lineage, review, recovery, and terminal receipts.',
    marketAnalogues: ['n8n agents', 'Make AI workflows', 'Zapier Agents', 'Workato agentic orchestration'],
    existingModules: [
      { path: 'src/task-universe.mjs', role: 'task and dependency contracts', coverage: 'DIRECT' },
      { path: 'src/agent-mesh-control-plane.mjs', role: 'cycle control and recovery', coverage: 'DIRECT' },
      { path: 'src/agent-relay.mjs', role: 'bounded model relay', coverage: 'DIRECT' },
      { path: 'src/ai-compute-budget.mjs', role: 'compute budget enforcement', coverage: 'DIRECT' }
    ],
    reuseState: 'REUSE_READY', priority: 'P0', evidenceState: 'IMPLEMENTED_TEST_VERIFIED',
    evidenceRefs: ['src/task-universe.mjs', 'src/agent-mesh-control-plane.mjs'],
    constraints: ['model output cannot grant authority', 'bounded rounds and budgets only']
  },
  {
    id: 'billing-and-revenue-recovery', family: 'money-and-retention', primitive: 'billing-and-revenue-recovery',
    label: 'Recurring billing, payment truth, refunds, disputes, and recovery',
    description: 'Distinguish observed provider events from cleared money and preserve lifecycle deltas.',
    marketAnalogues: ['Stripe Billing', 'Paddle merchant of record', 'Gainsight renewal workflows'],
    existingModules: [
      { path: 'src/payments.mjs', role: 'provider event classification', coverage: 'DIRECT' },
      { path: 'src/payment-renewal-truth.mjs', role: 'renewal state', coverage: 'COMPOSED' },
      { path: 'src/revenue.mjs', role: 'revenue boundary', coverage: 'ADAPTER_GATED' }
    ],
    reuseState: 'ADAPTER_GATED', priority: 'P0', evidenceState: 'IMPLEMENTED_TEST_VERIFIED',
    evidenceRefs: ['src/payments.mjs', 'src/payment-renewal-truth.mjs'],
    constraints: ['provider eligibility and KYC are external', 'no revenue claim without provider proof']
  },
  {
    id: 'fulfillment-acceptance-and-support', family: 'money-and-retention', primitive: 'fulfillment-acceptance-and-support',
    label: 'Fulfillment, QA, delivery evidence, customer acceptance, and support timing',
    description: 'Deliver work with contractual timing and separate internal delivery from customer acceptance.',
    marketAnalogues: ['HighLevel fulfillment', 'Zendesk ticketing', 'agency delivery operations'],
    existingModules: [
      { path: 'src/service-fulfillment.mjs', role: 'QA, delivery, acceptance boundary', coverage: 'DIRECT' },
      { path: 'src/service-sku.mjs', role: 'service requirements and SKU contracts', coverage: 'DIRECT' },
      { path: 'src/causal-attribution-spine.mjs', role: 'delivery lineage', coverage: 'COMPOSED' }
    ],
    reuseState: 'REUSE_READY', priority: 'P0', evidenceState: 'IMPLEMENTED_TEST_VERIFIED',
    evidenceRefs: ['src/service-fulfillment.mjs', 'src/service-sku.mjs'],
    constraints: ['silence is not acceptance', 'credentials must not enter customer fields']
  },
  {
    id: 'retention-health-and-expansion', family: 'money-and-retention', primitive: 'retention-health-and-expansion',
    label: 'Customer health, renewal readiness, churn risk, and expansion signals',
    description: 'Use accepted delivery, support, usage, and payment evidence to prioritize retention work.',
    marketAnalogues: ['Gainsight health scores', 'Intercom customer support', 'HubSpot lifecycle automation'],
    existingModules: [
      { path: 'src/payment-renewal-truth.mjs', role: 'renewal truth', coverage: 'DIRECT' },
      { path: 'src/commercial-learning.mjs', role: 'outcome learning', coverage: 'COMPOSED' },
      { path: 'src/service-fulfillment.mjs', role: 'delivery and support state', coverage: 'COMPOSED' }
    ],
    reuseState: 'COMPOSE_REQUIRED', priority: 'P0', evidenceState: 'PARTIAL',
    evidenceRefs: ['src/payment-renewal-truth.mjs', 'src/commercial-learning.mjs'],
    constraints: ['retention is proven by repeat payment, not predicted health']
  },
  {
    id: 'forecasting-and-capital-allocation', family: 'economic-control', primitive: 'forecasting-and-capital-allocation',
    label: 'Evidence-ladder forecasting and capital allocation tournament',
    description: 'Allocate scarce compute and future capital toward measured contribution rather than vanity metrics.',
    marketAnalogues: ['Salesloft forecasting', 'Gong revenue intelligence', 'business-model fitness systems'],
    existingModules: [
      { path: 'src/business-model-fitness.mjs', role: 'death-detector and fitness review', coverage: 'DIRECT' },
      { path: 'src/capital-allocator.mjs', role: 'proof-gated allocation planning', coverage: 'DIRECT' },
      { path: 'src/commercial-learning.mjs', role: 'economic memory', coverage: 'COMPOSED' }
    ],
    reuseState: 'REUSE_READY', priority: 'P1', evidenceState: 'IMPLEMENTED_TEST_VERIFIED',
    evidenceRefs: ['src/business-model-fitness.mjs', 'src/capital-allocator.mjs'],
    constraints: ['no forecast is revenue', 'owner approval remains required for spend']
  },
  {
    id: 'app-ecosystem-connectors', family: 'integration-control', primitive: 'app-ecosystem-connectors',
    label: 'Provider-neutral app ecosystem adapters and extension contracts',
    description: 'Represent future integrations with explicit access, terms, scope, cost, and rollback gates.',
    marketAnalogues: ['Zapier app ecosystem', 'Make integrations', 'Workato recipes'],
    existingModules: [
      { path: 'src/adapter-contracts.mjs', role: 'lawful provider/source manifests', coverage: 'DIRECT' },
      { path: 'src/provider-adapter-contract.mjs', role: 'provider contract boundary', coverage: 'DIRECT' },
      { path: 'src/task-universe.mjs', role: 'bounded integration tasks', coverage: 'COMPOSED' }
    ],
    reuseState: 'REUSE_READY', priority: 'P1', evidenceState: 'IMPLEMENTED_TEST_VERIFIED',
    evidenceRefs: ['src/adapter-contracts.mjs', 'src/provider-adapter-contract.mjs'],
    constraints: ['credentials and terms remain external gates', 'adapter presence is not live access']
  }
];

const normalizedBuiltIns = RAW_MARKET_CAPABILITY_REGISTRY.map(entry => {
  const result = normalizeCapabilityPrimitive(entry);
  if (!result.ok) throw new Error(`invalid-built-in-capability:${entry.id}:${result.reasonCodes.join(',')}`);
  return result.capability;
});

export const MARKET_CAPABILITY_REGISTRY = deepFreeze(normalizedBuiltIns);

export function listMarketCapabilities() {
  return MARKET_CAPABILITY_REGISTRY.map(capability => structuredClone(capability));
}

