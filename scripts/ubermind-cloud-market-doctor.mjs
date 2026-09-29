import fs from 'node:fs/promises';
import { describeProviderReadiness } from '../src/agent-model-executor-factory.mjs';
import { observeOpenRouterCatalog } from '../src/openrouter-market-catalog.mjs';

const config = JSON.parse(await fs.readFile(new URL('../config/ubermind-cloud-cognition-resources.json', import.meta.url), 'utf8'));
const live = process.argv.includes('--live-catalog');
const readiness = describeProviderReadiness({ env: process.env });
const openrouter = readiness.find(row => row.provider === 'openrouter') || null;
const budget = Number(process.env.UBERMIND_MONTHLY_COGNITION_BUDGET_USD || config.requiredResources.find(r => r.id === 'cognition-budget')?.default || 20);
const platformFeeRate = Number(process.env.OPENROUTER_PLATFORM_FEE_RATE || config.recommendedPolicies.find(r => r.env === 'OPENROUTER_PLATFORM_FEE_RATE')?.default || 0);
const blockers = [];

if (!Number.isFinite(budget) || budget <= 0) blockers.push('VALID_MONTHLY_COGNITION_BUDGET_REQUIRED');
if (!Number.isFinite(platformFeeRate) || platformFeeRate < 0 || platformFeeRate > 1) blockers.push('VALID_OPENROUTER_PLATFORM_FEE_RATE_REQUIRED');

let catalog = null;
if (live) {
  catalog = await observeOpenRouterCatalog({ apiKey: process.env.OPENROUTER_API_KEY || '' });
  if (!catalog.ok) blockers.push(...(catalog.reasonCodes || ['OPENROUTER_CATALOG_UNAVAILABLE']));
}

const out = {
  status: blockers.length ? 'UBERMIND_CLOUD_POLICY_BLOCKED' : 'UBERMIND_TYPINGMIND_COCKPIT_POLICY_READY',
  cloudOnly: true,
  localModelRequired: false,
  localGpuRequired: false,
  monthlyBudgetUsd: Number.isFinite(budget) ? budget : null,
  platformFeeRate: Number.isFinite(platformFeeRate) ? platformFeeRate : null,
  interactiveCockpit: {
    product: 'TypingMind',
    device: 'iPad',
    cognitionAuthority: 'NONE',
    providerKeysManagedInTypingMind: true,
    backendCredentialRequiredForInteractiveUse: false
  },
  openrouterOptionalBackendAdapter: openrouter ? {
    ready: openrouter.ready,
    blockers: openrouter.blockers,
    credentialPresent: openrouter.credentialPresent,
    pricingEvidenceMode: openrouter.pricingEvidenceMode || null
  } : null,
  catalog: catalog?.ok ? {
    observedAt: catalog.observedAt,
    modelCount: catalog.modelCount,
    snapshotDigest: catalog.snapshotDigest
  } : live ? { ok: false, reasonCodes: catalog?.reasonCodes || ['catalog-unavailable'] } : { status: 'NOT_OBSERVED_USE_--live-catalog' },
  requiredOwnerActions: [],
  requiredRuntimeSettings: {
    UBERMIND_MONTHLY_COGNITION_BUDGET_USD: String(Number.isFinite(budget) ? budget : 20)
  },
  optionalOpenRouterBackendSettings: {
    OPENROUTER_AGENT_ENABLED: process.env.OPENROUTER_AGENT_ENABLED || 'false',
    OPENROUTER_PROVIDER_SORT: process.env.OPENROUTER_PROVIDER_SORT || 'price',
    OPENROUTER_REQUIRE_ZDR: process.env.OPENROUTER_REQUIRE_ZDR || 'true',
    OPENROUTER_ALLOW_PROVIDER_FALLBACKS: process.env.OPENROUTER_ALLOW_PROVIDER_FALLBACKS || 'true',
    OPENROUTER_PLATFORM_FEE_RATE: String(Number.isFinite(platformFeeRate) ? platformFeeRate : 0.055)
  },
  optionalDirectProviderCredentials: config.optionalDonors.map(row => row.env).filter(Boolean),
  blockers: [...new Set(blockers)],
  executionAuthority: 'NONE',
  providerCallsPerformedByDefault: 0,
  liveCatalogReadOnly: live,
  truthBoundary: 'READY means the TypingMind/iPad cockpit policy and budget contract are coherent. TypingMind and OpenRouter have no cognition authority. Direct provider keys may live in TypingMind for interactive use; backend adapters remain optional. Frontier-crown quality and zero-loss equivalence still require current evidence and sealed trials.'
};

console.log(JSON.stringify(out, null, 2));
if (blockers.length) process.exitCode = 1;
