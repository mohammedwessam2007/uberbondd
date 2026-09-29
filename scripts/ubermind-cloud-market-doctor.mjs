import fs from 'node:fs/promises';
import { describeProviderReadiness } from '../src/agent-model-executor-factory.mjs';
import { observeOpenRouterCatalog } from '../src/openrouter-market-catalog.mjs';

const config = JSON.parse(await fs.readFile(new URL('../config/ubermind-cloud-cognition-resources.json', import.meta.url), 'utf8'));
const live = process.argv.includes('--live-catalog');
const readiness = describeProviderReadiness({ env: process.env });
const openrouter = readiness.find(row => row.provider === 'openrouter') || null;
const budget = Number(process.env.UBERMIND_MONTHLY_COGNITION_BUDGET_USD || config.requiredResources.find(r => r.id === 'cognition-budget')?.default || 20);
const blockers = [];

if (!openrouter?.credentialPresent) blockers.push('OPENROUTER_API_KEY_REQUIRED');
if (!openrouter || openrouter.blockers?.includes('explicitly-disabled')) blockers.push('OPENROUTER_AGENT_ENABLED_TRUE_REQUIRED');
if (!Number.isFinite(budget) || budget <= 0) blockers.push('VALID_MONTHLY_COGNITION_BUDGET_REQUIRED');

let catalog = null;
if (live) {
  catalog = await observeOpenRouterCatalog({ apiKey: process.env.OPENROUTER_API_KEY || '' });
  if (!catalog.ok) blockers.push(...(catalog.reasonCodes || ['OPENROUTER_CATALOG_UNAVAILABLE']));
}

const out = {
  status: blockers.length ? 'UBERMIND_CLOUD_PLUG_BLOCKED' : 'UBERMIND_CLOUD_PLUG_READY',
  cloudOnly: true,
  localModelRequired: false,
  localGpuRequired: false,
  monthlyBudgetUsd: Number.isFinite(budget) ? budget : null,
  openrouter: openrouter ? {
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
  requiredOwnerActions: blockers.filter(code => code === 'OPENROUTER_API_KEY_REQUIRED').length
    ? ['Create one OpenRouter API key and place it in the protected runtime as OPENROUTER_API_KEY. Do not commit or paste it into source.']
    : [],
  requiredRuntimeSettings: {
    OPENROUTER_AGENT_ENABLED: 'true',
    UBERMIND_MONTHLY_COGNITION_BUDGET_USD: String(Number.isFinite(budget) ? budget : 20),
    OPENROUTER_PROVIDER_SORT: process.env.OPENROUTER_PROVIDER_SORT || 'price',
    OPENROUTER_REQUIRE_ZDR: process.env.OPENROUTER_REQUIRE_ZDR || 'true',
    OPENROUTER_ALLOW_PROVIDER_FALLBACKS: process.env.OPENROUTER_ALLOW_PROVIDER_FALLBACKS || 'true'
  },
  optionalDirectProviderCredentials: config.optionalDonors.map(row => row.env).filter(Boolean),
  blockers: [...new Set(blockers)],
  executionAuthority: 'NONE',
  providerCallsPerformedByDefault: 0,
  liveCatalogReadOnly: live,
  truthBoundary: 'READY means the cloud market transport can be configured. It does not prove any model is frontier-crown quality, callable with an exact reasoning setting, or zero-loss equivalent. Those require current evidence and sealed trials.'
};

console.log(JSON.stringify(out, null, 2));
if (blockers.length) process.exitCode = 1;
