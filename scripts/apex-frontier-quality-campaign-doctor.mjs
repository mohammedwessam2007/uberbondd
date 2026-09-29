import fs from 'node:fs/promises';
import { prepareFreshApexCampaign } from '../src/apex-fresh-campaign.mjs';

const [campaignRaw, registryRaw] = await Promise.all([
  fs.readFile(new URL('../config/apex-frontier-quality-compression-campaign.json', import.meta.url), 'utf8'),
  fs.readFile(new URL('../config/frontier-model-candidates.json', import.meta.url), 'utf8')
]);

const campaign = JSON.parse(campaignRaw);
const registry = JSON.parse(registryRaw);
const candidateById = new Map((registry.candidates || []).map(row => [row.id, row]));

const requiredCandidateIds = [...new Set(
  (campaign.architectures || []).flatMap(row => (row.modelRequirements || []).map(model => model.candidateId))
)].sort();

const missingCandidateIds = requiredCandidateIds.filter(id => !candidateById.has(id));
if (missingCandidateIds.length) {
  console.log(JSON.stringify({
    ok: false,
    status: 'APEX_FQC_CAMPAIGN_CONFIG_INVALID',
    reasonCodes: missingCandidateIds.map(id => `candidate-not-in-frontier-registry:${id}`),
    providerCalls: 0,
    spendUsd: 0
  }, null, 2));
  process.exitCode = 1;
} else {
  const plan = prepareFreshApexCampaign(campaign);
  const discoveryOnlyCandidateIds = requiredCandidateIds.filter(id => {
    const row = candidateById.get(id);
    return !row?.gatewayTransport && !row?.directTransportCandidate;
  });
  console.log(JSON.stringify({
    ...plan,
    configStatus: campaign.status,
    requiredCandidateIds,
    discoveryOnlyCandidateIds,
    registryCandidateCount: registry.candidates.length,
    providerCallsPerformed: 0,
    spendUsd: 0,
    operatorNextGate: plan.ok
      ? 'REFRESH_EXACT_TRANSPORT_CALLABILITY_REASONING_SETTING_AND_PRICING_RECEIPTS__THEN_EXTERNAL_CUSTODIAN_COMMITMENT'
      : 'REPAIR_CAMPAIGN_CONFIG',
    truthBoundary: plan.ok
      ? 'CAMPAIGN CONTRACT IS INTERNALLY VALID. DISCOVERY-ONLY CANDIDATES ARE NOT CALLABLE. THIS DOCTOR DOES NOT CALL PROVIDERS, CREATE HOLDOUTS, SPEND MONEY OR AUTHORIZE EXECUTION.'
      : plan.truthBoundary
  }, null, 2));
  if (!plan.ok) process.exitCode = 1;
}
