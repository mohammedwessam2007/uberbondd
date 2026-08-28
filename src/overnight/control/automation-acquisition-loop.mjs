import crypto from 'node:crypto';

export const AUTOMATION_ACQUISITION_POLICY_VERSION = 'automation-acquisition-loop-1.0.0';

export const CAPABILITY_COVERAGE_STATES = Object.freeze([
  'MISSING',
  'ADAPTER_GATED',
  'COMPOSE_REQUIRED',
  'REUSE_READY'
]);

export const ACQUISITION_DECISIONS = Object.freeze([
  'BUILD_ADAPTER',
  'REFERENCE_ONLY',
  'DEFER',
  'REJECT'
]);

export const SOURCE_MODES = Object.freeze([
  'API_ADAPTER',
  'PROVIDER_NEUTRAL_PATTERN',
  'PROCESS_ISOLATED',
  'REFERENCE_ONLY'
]);

const PERMISSIVE_LICENSES = new Set([
  'MIT',
  'APACHE-2.0',
  'BSD-2-CLAUSE',
  'BSD-3-CLAUSE',
  'ISC'
]);

const ZERO_EFFECTS = Object.freeze({
  providerCalls: 0,
  messages: 0,
  purchases: 0,
  deployments: 0,
  credentialChanges: 0,
  dnsChanges: 0,
  productionMutations: 0,
  spendCents: 0
});

const GAP_WEIGHTS = Object.freeze({
  MISSING: 40,
  ADAPTER_GATED: 30,
  COMPOSE_REQUIRED: 18,
  REUSE_READY: 4
});

const COVERAGE_ORDER = Object.freeze({
  MISSING: 0,
  ADAPTER_GATED: 1,
  COMPOSE_REQUIRED: 2,
  REUSE_READY: 3
});

const CAPABILITY_ACCEPTANCE = Object.freeze({
  'voice-reception-and-call-lifecycle': [
    'provider-neutral call event envelope with restart-stable occurrence identity',
    'raw phone/audio/transcript payloads are not durable by default',
    'answer, call, SMS, booking, and transfer consequences are disabled by default',
    'all external actions remain behind the canonical consequence/provider-adapter boundary',
    'provider delivery/call receipts remain external proof and cannot be synthesized'
  ],
  'browser-action-automation': [
    'browser actions are separated from evidence-only crawling',
    'state-changing browser steps require explicit consequence authority',
    'duplicate/retry execution is idempotent or fails closed when outcome is uncertain',
    'credentials and secrets never enter durable task/result payloads'
  ],
  'omnichannel-conversation-transport': [
    'channel-neutral conversation event contract with suppression and consent precedence',
    'send/call/publish authority remains disabled until a canonical activation gate opens',
    'provider delivery truth is distinct from generated content or internal intent'
  ],
  'calendar-and-booking-execution': [
    'provider booking receipt is required before BOOKED truth',
    'retries cannot create duplicate appointments',
    'calendar credentials stay outside durable business payloads'
  ],
  'external-crm-sync': [
    'CRM sync uses stable external object identities and conflict-safe idempotency',
    'external CRM writes are disabled by default and require scoped authority',
    'internal opportunity/payment truth cannot be overwritten by lower-grade CRM observations'
  ],
  'web-context-extraction-at-scale': [
    'robots/terms/source policy remains an explicit adapter constraint',
    'web extraction is evidence ingestion, not buyer/payment truth',
    'AGPL or license-uncertain code is not copied into the UberBond core'
  ],
  'marketing-lifecycle-automation': [
    'suppression, consent, frequency, and deliverability gates dominate campaign triggers',
    'marketing events never manufacture payment/retention truth'
  ],
  'product-analytics-and-experimentation': [
    'experiment observations remain measurements rather than commercial truth',
    'analytics ingestion cannot grant spend, deploy, or customer-contact authority'
  ],
  'connector-ecosystem': [
    'reuse the canonical task/queue/provider boundaries instead of creating a second workflow engine',
    'connector manifests declare effect class, auth requirements, idempotency, and receipt semantics',
    'unknown-license connector code is reference-only unless separately reviewed'
  ]
});

function clone(value) {
  return structuredClone(value);
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

function finiteScore(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(10, number));
}

function validIso(value) {
  const string = text(value, 80);
  if (!string) return null;
  const date = new Date(string);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString();
}

function normalizeLicense(value) {
  const normalized = text(value, 80).toUpperCase();
  return normalized || 'UNKNOWN';
}

function sourceFreshnessDays(observedAt, pushedAt) {
  return Math.max(0, (new Date(observedAt).getTime() - new Date(pushedAt).getTime()) / 86_400_000);
}

function maturityScore(stars) {
  if (stars <= 0) return 0;
  return Math.max(0, Math.min(10, Math.log10(stars + 1) * 2));
}

function stableDigest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function invalid(reasonCodes, extra = {}) {
  return {
    ok: false,
    policyVersion: AUTOMATION_ACQUISITION_POLICY_VERSION,
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    ...extra
  };
}

export function normalizeAutomationCandidate(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return invalid(['candidate-object-required']);
  }

  const repo = text(input.repo, 200);
  const capabilityKey = slug(input.capabilityKey);
  const coverage = text(input.coverage, 40).toUpperCase();
  const sourceMode = text(input.sourceMode, 40).toUpperCase();
  const observedAt = validIso(input.observedAt);
  const pushedAt = validIso(input.pushedAt);
  const licenseSpdx = normalizeLicense(input.licenseSpdx);
  const stars = Number(input.stars);
  const priorities = {
    economicLeverage: finiteScore(input.priorities?.economicLeverage),
    founderMinuteReduction: finiteScore(input.priorities?.founderMinuteReduction),
    reuseAcrossOffers: finiteScore(input.priorities?.reuseAcrossOffers),
    maintenanceBurden: finiteScore(input.priorities?.maintenanceBurden),
    externalEffectRisk: finiteScore(input.priorities?.externalEffectRisk)
  };

  const reasonCodes = [];
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) reasonCodes.push('invalid-repository');
  if (!capabilityKey) reasonCodes.push('capability-key-required');
  if (!CAPABILITY_COVERAGE_STATES.includes(coverage)) reasonCodes.push('invalid-capability-coverage');
  if (!SOURCE_MODES.includes(sourceMode)) reasonCodes.push('invalid-source-mode');
  if (!observedAt) reasonCodes.push('observed-at-required');
  if (!pushedAt) reasonCodes.push('pushed-at-required');
  if (!Number.isInteger(stars) || stars < 0) reasonCodes.push('invalid-star-count');
  for (const [key, value] of Object.entries(priorities)) {
    if (value == null) reasonCodes.push(`invalid-priority-${key}`);
  }

  if (observedAt && pushedAt) {
    const observedMs = new Date(observedAt).getTime();
    const pushedMs = new Date(pushedAt).getTime();
    if (pushedMs > observedMs + 300_000) reasonCodes.push('future-dated-source-evidence');
  }

  const normalized = {
    repo,
    capabilityKey,
    capabilityLabel: text(input.capabilityLabel, 180) || capabilityKey,
    coverage,
    sourceMode,
    licenseSpdx,
    stars: Number.isInteger(stars) && stars >= 0 ? stars : null,
    observedAt,
    pushedAt,
    sourceUrl: `https://github.com/${repo}`,
    patterns: Array.isArray(input.patterns)
      ? [...new Set(input.patterns.map(item => text(item, 200)).filter(Boolean))].slice(0, 12)
      : [],
    existingUberBondModules: Array.isArray(input.existingUberBondModules)
      ? [...new Set(input.existingUberBondModules.map(item => text(item, 240)).filter(Boolean))].slice(0, 12)
      : [],
    priorities,
    evidenceClassification: 'PUBLIC_REPOSITORY_METADATA_AND_UBERBOND_PLANNING_ESTIMATE'
  };

  if (reasonCodes.length) return invalid(reasonCodes, { candidate: normalized });
  return {
    ok: true,
    policyVersion: AUTOMATION_ACQUISITION_POLICY_VERSION,
    candidate: normalized
  };
}

function chooseDecision(candidate, freshnessDays) {
  if (freshnessDays > 180) return { decision: 'DEFER', reason: 'stale-source-evidence' };
  if (candidate.coverage === 'REUSE_READY') {
    return { decision: 'REFERENCE_ONLY', reason: 'canonical-capability-already-reuse-ready' };
  }
  if (candidate.coverage === 'COMPOSE_REQUIRED' && candidate.sourceMode === 'REFERENCE_ONLY') {
    return { decision: 'REFERENCE_ONLY', reason: 'composition-needed-not-second-platform' };
  }
  if (candidate.sourceMode === 'REFERENCE_ONLY') {
    return { decision: 'REFERENCE_ONLY', reason: 'source-declared-reference-only' };
  }
  return { decision: 'BUILD_ADAPTER', reason: 'bounded-capability-gap' };
}

export function scoreAutomationCandidate(input) {
  const normalized = normalizeAutomationCandidate(input);
  if (!normalized.ok) return normalized;
  const candidate = normalized.candidate;
  const freshnessDays = sourceFreshnessDays(candidate.observedAt, candidate.pushedAt);
  const permissiveLicense = PERMISSIVE_LICENSES.has(candidate.licenseSpdx);
  const licenseCopyPolicy = permissiveLicense ? 'REVIEW_REQUIRED_BEFORE_CODE_REUSE' : 'NO_CORE_CODE_COPY';
  const maturity = maturityScore(candidate.stars);
  const overlapPenalty = candidate.coverage === 'REUSE_READY' ? 38 : candidate.coverage === 'COMPOSE_REQUIRED' ? 10 : 0;
  const stalePenalty = freshnessDays > 180 ? 40 : freshnessDays > 90 ? 12 : 0;
  const licensePenalty = candidate.licenseSpdx === 'AGPL-3.0' || candidate.licenseSpdx === 'AGPL-3.0-ONLY'
    ? 8
    : permissiveLicense ? 0 : 4;

  const rawScore =
    GAP_WEIGHTS[candidate.coverage]
    + candidate.priorities.economicLeverage * 4
    + candidate.priorities.founderMinuteReduction * 4
    + candidate.priorities.reuseAcrossOffers * 3
    + maturity
    - candidate.priorities.maintenanceBurden * 2
    - candidate.priorities.externalEffectRisk * 2
    - overlapPenalty
    - stalePenalty
    - licensePenalty;

  const selectedDecision = chooseDecision(candidate, freshnessDays);
  const reasonCodes = [selectedDecision.reason];
  if (!permissiveLicense) reasonCodes.push('license-prohibits-automatic-core-copy');
  if (freshnessDays > 90) reasonCodes.push('source-evidence-aging');
  if (candidate.coverage === 'MISSING') reasonCodes.push('genuine-capability-gap');
  if (candidate.coverage === 'ADAPTER_GATED') reasonCodes.push('live-provider-boundary-missing');

  return {
    ok: true,
    policyVersion: AUTOMATION_ACQUISITION_POLICY_VERSION,
    candidate,
    score: Math.round(rawScore * 1000) / 1000,
    maturityScore: Math.round(maturity * 1000) / 1000,
    freshnessDays: Math.round(freshnessDays * 1000) / 1000,
    decision: selectedDecision.decision,
    reasonCodes: [...new Set(reasonCodes)],
    licenseCopyPolicy,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EFFECTS)
  };
}

function comparableCandidate(candidate) {
  return JSON.stringify(candidate);
}

export function runAutomationAcquisitionLoop({ candidates = CURATED_AUTOMATION_CANDIDATES } = {}) {
  if (!Array.isArray(candidates)) return invalid(['candidate-array-required']);

  const scored = [];
  const errors = [];
  const duplicates = [];
  const conflicts = [];
  const byRepo = new Map();

  candidates.forEach((input, index) => {
    const normalized = normalizeAutomationCandidate(input);
    if (!normalized.ok) {
      errors.push({ index, repo: normalized.candidate?.repo || null, reasonCodes: normalized.reasonCodes });
      return;
    }
    const prior = byRepo.get(normalized.candidate.repo.toLowerCase());
    if (prior) {
      if (comparableCandidate(prior.candidate) === comparableCandidate(normalized.candidate)) {
        duplicates.push({ repo: normalized.candidate.repo, index });
      } else {
        conflicts.push({ repo: normalized.candidate.repo, index });
      }
      return;
    }
    const result = scoreAutomationCandidate(normalized.candidate);
    byRepo.set(normalized.candidate.repo.toLowerCase(), result);
    scored.push(result);
  });

  if (errors.length || conflicts.length) {
    return invalid([
      ...(errors.length ? ['invalid-candidate'] : []),
      ...(conflicts.length ? ['conflicting-repository-evidence'] : [])
    ], {
      status: 'REVIEW_REQUIRED',
      errors,
      conflicts,
      duplicates,
      ranked: [],
      selected: null,
      businessEffectAuthority: 'NONE',
      externalEffectLedger: clone(ZERO_EFFECTS)
    });
  }

  const ranked = scored.sort((a, b) =>
    b.score - a.score
    || COVERAGE_ORDER[a.candidate.coverage] - COVERAGE_ORDER[b.candidate.coverage]
    || a.candidate.repo.localeCompare(b.candidate.repo)
  );

  const actionable = ranked.filter(item => item.decision === 'BUILD_ADAPTER');
  const selected = actionable[0] || null;
  const digestInput = ranked
    .map(item => ({
      repo: item.candidate.repo,
      capabilityKey: item.candidate.capabilityKey,
      coverage: item.candidate.coverage,
      decision: item.decision,
      score: item.score,
      observedAt: item.candidate.observedAt,
      pushedAt: item.candidate.pushedAt,
      licenseSpdx: item.candidate.licenseSpdx
    }))
    .sort((a, b) => a.repo.localeCompare(b.repo));

  return {
    ok: true,
    policyVersion: AUTOMATION_ACQUISITION_POLICY_VERSION,
    status: selected ? 'GAP_SELECTED' : 'NO_ACTIONABLE_GAP',
    candidateCount: ranked.length,
    duplicateCount: duplicates.length,
    duplicates,
    ranked,
    selected,
    acquisitionDigest: stableDigest(digestInput),
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EFFECTS)
  };
}

export function compileAcquisitionEngineeringPacket({ candidates = CURATED_AUTOMATION_CANDIDATES } = {}) {
  const loop = runAutomationAcquisitionLoop({ candidates });
  if (!loop.ok) return loop;
  if (!loop.selected) {
    return {
      ...loop,
      packet: null,
      status: 'NO_ACTIONABLE_GAP'
    };
  }

  const selected = loop.selected;
  const capabilityPeers = loop.ranked
    .filter(item => item.candidate.capabilityKey === selected.candidate.capabilityKey)
    .map(item => ({
      repo: item.candidate.repo,
      licenseSpdx: item.candidate.licenseSpdx,
      decision: item.decision,
      sourceMode: item.candidate.sourceMode,
      patterns: item.candidate.patterns
    }));

  const packet = {
    packetVersion: 'automation-acquisition-engineering-packet-1.0.0',
    capabilityKey: selected.candidate.capabilityKey,
    capabilityLabel: selected.candidate.capabilityLabel,
    currentCoverage: selected.candidate.coverage,
    decision: 'BUILD_ADAPTER',
    sourceRepositories: capabilityPeers,
    acceptance: CAPABILITY_ACCEPTANCE[selected.candidate.capabilityKey] || [
      'reuse canonical UberBond authority, idempotency, audit, and receipt boundaries',
      'external effects remain disabled by default',
      'provider/customer/payment truth is never synthesized from local execution'
    ],
    implementationLaw: [
      'minimal canonical diff; do not vendor an external platform wholesale',
      'no source code copied from AGPL or license-uncertain repositories into UberBond core',
      'permissive-source code reuse still requires explicit review and attribution before any copy',
      'hostile regression tests precede merge',
      'lite/ remains untouched unless separately justified'
    ],
    externalActivation: 'EXTERNAL_PROOF_REQUIRED',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EFFECTS),
    acquisitionDigest: loop.acquisitionDigest
  };

  return {
    ok: true,
    policyVersion: AUTOMATION_ACQUISITION_POLICY_VERSION,
    status: 'ENGINEERING_PACKET_READY',
    packet,
    loop
  };
}

const OBSERVED_AT = '2026-08-28T15:10:00.000Z';

// Repository metadata below is a dated observation, not a claim that importing
// the software is appropriate. Priorities are UberBond planning estimates on a
// 0-10 scale; they are not market-size, revenue, or conversion evidence.
export const CURATED_AUTOMATION_CANDIDATES = Object.freeze([
  {
    repo: 'livekit/agents',
    capabilityKey: 'voice-reception-and-call-lifecycle',
    capabilityLabel: 'Real-time voice reception and call lifecycle automation',
    coverage: 'MISSING',
    sourceMode: 'PROVIDER_NEUTRAL_PATTERN',
    licenseSpdx: 'Apache-2.0',
    stars: 13247,
    pushedAt: '2026-08-28T14:40:25.000Z',
    observedAt: OBSERVED_AT,
    patterns: ['realtime voice agent lifecycle', 'provider/plugin boundaries', 'call-session orchestration'],
    existingUberBondModules: ['src/provider-adapter-contract.mjs', 'src/live-activation-gate.mjs', 'src/task-universe.mjs'],
    priorities: { economicLeverage: 10, founderMinuteReduction: 10, reuseAcrossOffers: 9, maintenanceBurden: 6, externalEffectRisk: 8 }
  },
  {
    repo: 'pipecat-ai/pipecat',
    capabilityKey: 'voice-reception-and-call-lifecycle',
    capabilityLabel: 'Real-time voice reception and call lifecycle automation',
    coverage: 'MISSING',
    sourceMode: 'PROVIDER_NEUTRAL_PATTERN',
    licenseSpdx: 'BSD-2-Clause',
    stars: 14895,
    pushedAt: '2026-08-28T14:42:40.000Z',
    observedAt: OBSERVED_AT,
    patterns: ['voice pipeline composition', 'transport-neutral realtime events', 'multimodal pipeline boundaries'],
    existingUberBondModules: ['src/provider-adapter-contract.mjs', 'src/live-activation-gate.mjs', 'src/task-universe.mjs'],
    priorities: { economicLeverage: 10, founderMinuteReduction: 10, reuseAcrossOffers: 9, maintenanceBurden: 6, externalEffectRisk: 8 }
  },
  {
    repo: 'browser-use/browser-use',
    capabilityKey: 'browser-action-automation',
    capabilityLabel: 'Consequence-gated browser action automation',
    coverage: 'MISSING',
    sourceMode: 'PROCESS_ISOLATED',
    licenseSpdx: 'MIT',
    stars: 111551,
    pushedAt: '2026-08-28T03:42:29.000Z',
    observedAt: OBSERVED_AT,
    patterns: ['agent browser action loop', 'browser state extraction', 'task-oriented web execution'],
    existingUberBondModules: ['src/browser-crawler.mjs', 'src/live-activation-gate.mjs', 'src/task-universe.mjs'],
    priorities: { economicLeverage: 7, founderMinuteReduction: 9, reuseAcrossOffers: 10, maintenanceBurden: 7, externalEffectRisk: 9 }
  },
  {
    repo: 'chatwoot/chatwoot',
    capabilityKey: 'omnichannel-conversation-transport',
    capabilityLabel: 'Omnichannel inbox and support transport',
    coverage: 'ADAPTER_GATED',
    sourceMode: 'API_ADAPTER',
    licenseSpdx: 'NOASSERTION',
    stars: 36277,
    pushedAt: '2026-08-28T13:57:38.000Z',
    observedAt: OBSERVED_AT,
    patterns: ['omnichannel inbox', 'conversation assignment', 'support lifecycle'],
    existingUberBondModules: ['src/inbound-classify.mjs', 'src/operator-escalation.mjs', 'src/service-fulfillment.mjs'],
    priorities: { economicLeverage: 8, founderMinuteReduction: 9, reuseAcrossOffers: 8, maintenanceBurden: 5, externalEffectRisk: 7 }
  },
  {
    repo: 'novuhq/novu',
    capabilityKey: 'omnichannel-conversation-transport',
    capabilityLabel: 'Omnichannel notification and lifecycle transport',
    coverage: 'ADAPTER_GATED',
    sourceMode: 'API_ADAPTER',
    licenseSpdx: 'NOASSERTION',
    stars: 39681,
    pushedAt: '2026-08-28T14:36:45.000Z',
    observedAt: OBSERVED_AT,
    patterns: ['multi-channel notification routing', 'email/SMS/inbox delivery abstraction', 'subscriber preferences'],
    existingUberBondModules: ['src/outreach-automation.mjs', 'src/send-safety.mjs', 'src/operator-escalation.mjs'],
    priorities: { economicLeverage: 8, founderMinuteReduction: 9, reuseAcrossOffers: 9, maintenanceBurden: 5, externalEffectRisk: 7 }
  },
  {
    repo: 'twentyhq/twenty',
    capabilityKey: 'external-crm-sync',
    capabilityLabel: 'External CRM synchronization and customer lifecycle bridge',
    coverage: 'ADAPTER_GATED',
    sourceMode: 'API_ADAPTER',
    licenseSpdx: 'NOASSERTION',
    stars: 55779,
    pushedAt: '2026-08-28T14:58:14.000Z',
    observedAt: OBSERVED_AT,
    patterns: ['AI-oriented CRM object model', 'sales lifecycle sync', 'GraphQL/API integration'],
    existingUberBondModules: ['src/lead-operations.mjs', 'src/store.mjs', 'src/task-universe.mjs'],
    priorities: { economicLeverage: 7, founderMinuteReduction: 8, reuseAcrossOffers: 8, maintenanceBurden: 5, externalEffectRisk: 6 }
  },
  {
    repo: 'firecrawl/firecrawl',
    capabilityKey: 'web-context-extraction-at-scale',
    capabilityLabel: 'Scalable web search and context extraction',
    coverage: 'COMPOSE_REQUIRED',
    sourceMode: 'API_ADAPTER',
    licenseSpdx: 'AGPL-3.0',
    stars: 173484,
    pushedAt: '2026-08-28T14:13:42.000Z',
    observedAt: OBSERVED_AT,
    patterns: ['web search/crawl API boundary', 'structured web extraction', 'agent-oriented context ingestion'],
    existingUberBondModules: ['src/browser-crawler.mjs', 'src/market-signal.mjs', 'src/market-signal-registry.mjs'],
    priorities: { economicLeverage: 7, founderMinuteReduction: 8, reuseAcrossOffers: 9, maintenanceBurden: 5, externalEffectRisk: 5 }
  },
  {
    repo: 'n8n-io/n8n',
    capabilityKey: 'connector-ecosystem',
    capabilityLabel: 'Broad workflow connector ecosystem',
    coverage: 'REUSE_READY',
    sourceMode: 'REFERENCE_ONLY',
    licenseSpdx: 'NOASSERTION',
    stars: 202685,
    pushedAt: '2026-08-28T14:54:20.000Z',
    observedAt: OBSERVED_AT,
    patterns: ['large connector catalogue', 'visual workflow composition', 'webhook/event integrations'],
    existingUberBondModules: ['src/task-universe.mjs', 'src/agent-mesh-control-plane.mjs', 'src/provider-adapter-contract.mjs'],
    priorities: { economicLeverage: 9, founderMinuteReduction: 10, reuseAcrossOffers: 10, maintenanceBurden: 7, externalEffectRisk: 4 }
  },
  {
    repo: 'activepieces/activepieces',
    capabilityKey: 'connector-ecosystem',
    capabilityLabel: 'Broad AI/MCP connector ecosystem',
    coverage: 'REUSE_READY',
    sourceMode: 'REFERENCE_ONLY',
    licenseSpdx: 'NOASSERTION',
    stars: 24075,
    pushedAt: '2026-08-28T01:11:53.000Z',
    observedAt: OBSERVED_AT,
    patterns: ['AI workflow connectors', 'MCP tool surfaces', 'piece/plugin packaging'],
    existingUberBondModules: ['src/task-universe.mjs', 'src/agent-mesh-control-plane.mjs', 'src/provider-adapter-contract.mjs'],
    priorities: { economicLeverage: 9, founderMinuteReduction: 10, reuseAcrossOffers: 10, maintenanceBurden: 7, externalEffectRisk: 4 }
  },
  {
    repo: 'windmill-labs/windmill',
    capabilityKey: 'connector-ecosystem',
    capabilityLabel: 'Developer workflow and webhook runtime',
    coverage: 'REUSE_READY',
    sourceMode: 'REFERENCE_ONLY',
    licenseSpdx: 'NOASSERTION',
    stars: 17708,
    pushedAt: '2026-08-28T15:01:36.000Z',
    observedAt: OBSERVED_AT,
    patterns: ['script-to-workflow runtime', 'webhooks and scheduled flows', 'operator UI generation'],
    existingUberBondModules: ['src/task-universe.mjs', 'src/queue.mjs', 'src/agent-mesh-control-plane.mjs'],
    priorities: { economicLeverage: 8, founderMinuteReduction: 9, reuseAcrossOffers: 9, maintenanceBurden: 7, externalEffectRisk: 4 }
  },
  {
    repo: 'mautic/mautic',
    capabilityKey: 'marketing-lifecycle-automation',
    capabilityLabel: 'Marketing lifecycle segmentation and nurture automation',
    coverage: 'COMPOSE_REQUIRED',
    sourceMode: 'REFERENCE_ONLY',
    licenseSpdx: 'NOASSERTION',
    stars: 10406,
    pushedAt: '2026-08-28T14:37:48.000Z',
    observedAt: OBSERVED_AT,
    patterns: ['campaign trigger graph', 'contact segmentation', 'lifecycle nurture'],
    existingUberBondModules: ['src/outreach-automation.mjs', 'src/lead-operations.mjs', 'src/task-universe.mjs'],
    priorities: { economicLeverage: 7, founderMinuteReduction: 8, reuseAcrossOffers: 7, maintenanceBurden: 6, externalEffectRisk: 7 }
  },
  {
    repo: 'PostHog/posthog',
    capabilityKey: 'product-analytics-and-experimentation',
    capabilityLabel: 'Product analytics, experiments, replay, and observability',
    coverage: 'COMPOSE_REQUIRED',
    sourceMode: 'REFERENCE_ONLY',
    licenseSpdx: 'NOASSERTION',
    stars: 39399,
    pushedAt: '2026-08-28T15:08:39.000Z',
    observedAt: OBSERVED_AT,
    patterns: ['event analytics', 'experimentation', 'session replay', 'error/log observability'],
    existingUberBondModules: ['src/commercial-learning.mjs', 'src/prometheus-control-tower.mjs', 'src/browser-crawler.mjs'],
    priorities: { economicLeverage: 6, founderMinuteReduction: 7, reuseAcrossOffers: 8, maintenanceBurden: 7, externalEffectRisk: 3 }
  }
].map(item => Object.freeze(item)));
