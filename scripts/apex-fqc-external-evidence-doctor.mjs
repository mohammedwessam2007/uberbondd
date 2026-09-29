import fs from 'node:fs/promises';
import {
  buildApexFqcCustodianRequest,
  compileApexFqcExternalEvidencePacket
} from '../src/apex-fqc-external-evidence-packet.mjs';

const args = process.argv.slice(2);
function arg(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}
async function maybeJson(path) {
  if (!path) return null;
  return JSON.parse(await fs.readFile(path, 'utf8'));
}

const campaignPath = arg('--campaign') || './config/apex-frontier-quality-compression-campaign.json';
const campaignConfig = await maybeJson(campaignPath);
const request = buildApexFqcCustodianRequest({ campaignConfig });

if (args.includes('--custodian-request-only')) {
  console.log(JSON.stringify(request, null, 2));
  if (!request.ok) process.exitCode = 1;
} else {
  const manifestPath = arg('--manifest');
  const custodianPath = arg('--custodian');
  const runtimePath = arg('--runtime');
  const pricingPath = arg('--pricing');
  const prerequisitesPath = arg('--prerequisites');

  if (!manifestPath || !custodianPath) {
    console.log(JSON.stringify({
      ...request,
      status: request.ok ? 'APEX_FQC_EXTERNAL_EVIDENCE_FILES_REQUIRED' : request.status,
      requiredExternalFiles: {
        sealedManifest: manifestPath || '<provide --manifest path>',
        custodianReceipt: custodianPath || '<provide --custodian path>'
      },
      optionalUntilRuntimeGate: {
        runtimeReceipts: runtimePath || '<provide --runtime path>',
        pricingReceipts: pricingPath || '<provide --pricing path>',
        prerequisiteReceipts: prerequisitesPath || '<optional --prerequisites path>'
      },
      providerCallsPerformed: 0,
      spendUsd: 0,
      executionAuthority: 'NONE'
    }, null, 2));
  } else {
    const packet = compileApexFqcExternalEvidencePacket({
      campaignConfig,
      sealedManifest: await maybeJson(manifestPath),
      custodianReceipt: await maybeJson(custodianPath),
      runtimeReceipts: (await maybeJson(runtimePath)) || [],
      pricingReceipts: (await maybeJson(pricingPath)) || [],
      prerequisiteReceipts: (await maybeJson(prerequisitesPath)) || []
    });
    console.log(JSON.stringify(packet, null, 2));
    if (!packet.ok) process.exitCode = 1;
  }
}
