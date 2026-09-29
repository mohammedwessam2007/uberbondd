import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { sealedAnswerDigest, sealedManifestCommitmentDigest, sealedCorpusDigestFromManifest } from '../src/apex-sealed-tournament.mjs';
import { prepareFreshApexCampaign } from '../src/apex-fresh-campaign.mjs';
import {
  buildApexFqcCustodianRequest,
  compileApexFqcExternalEvidencePacket
} from '../src/apex-fqc-external-evidence-packet.mjs';

const campaign = JSON.parse(fs.readFileSync('./config/apex-frontier-quality-compression-campaign.json', 'utf8'));
const COMMITTED_AT = '2026-09-29T00:27:00.000Z';
const OBSERVED_AT = '2026-09-29T00:29:00.000Z';

function manifest(count = 40) {
  return Array.from({ length: count }, (_, index) => {
    const taskId = `fresh-custodian-${String(index + 1).padStart(3, '0')}`;
    return {
      taskId,
      family: index % 2 ? 'DEBUGGING' : 'CAUSAL_REASONING',
      tier: 'SEALED_HOLDOUT',
      difficulty: 0.8,
      answerDigest: sealedAnswerDigest({
        suiteVersion: campaign.suiteVersion,
        taskId,
        answer: `private-answer-${index + 1}`
      })
    };
  });
}

function receipt(plan, rows, overrides = {}) {
  return {
    campaignId: plan.campaignId,
    campaignDigest: plan.campaignDigest,
    suiteVersion: plan.suiteVersion,
    manifestDigest: sealedManifestCommitmentDigest(rows),
    corpusDigest: sealedCorpusDigestFromManifest(rows),
    taskCount: rows.length,
    commitmentRef: 'custodian://wave1/fresh',
    committedAt: COMMITTED_AT,
    sourceFreezeRef: 'source-freeze://main-192795267',
    evaluatorRef: 'evaluator://independent-v1',
    custodianRef: 'custodian://independent-v1',
    rawHoldoutsStoredInRepository: false,
    optimizerAccessBeforeEvaluation: false,
    candidateAccessBeforeEvaluation: false,
    plaintextAnswersExposedBeforeEvaluation: false,
    evaluatorIndependent: true,
    custodianIndependent: true,
    freshlyGeneratedForCampaign: true,
    tasksPreviouslyEvaluated: false,
    tasksDerivedFromPreviouslyEvaluatedItems: false,
    legacyEvidenceReuse: false,
    secretFreeReceipt: true,
    ...overrides
  };
}

function evidence(plan) {
  const runtimeMap = new Map();
  const pricingKeys = new Set();
  for (const architecture of plan.architectureRoster) {
    for (const requirement of architecture.modelRequirements) {
      const runtimeKey = `${requirement.candidateId}::${requirement.reasoningSettingRef}`;
      if (!runtimeMap.has(runtimeKey)) {
        runtimeMap.set(runtimeKey, {
          candidateId: requirement.candidateId,
          reasoningSettingRef: requirement.reasoningSettingRef,
          transportClass: 'DIRECT',
          observedAt: OBSERVED_AT,
          evidenceRef: `runtime://${requirement.candidateId}/exact`,
          callableNow: true,
          exactModelIdentityMatched: true,
          exactReasoningSettingMatched: true,
          transportVerified: true,
          providerCallObserved: true
        });
      }
      pricingKeys.add(`${requirement.candidateId}::${requirement.pricingModeRef}`);
    }
  }
  const pricingReceipts = [...pricingKeys].map(key => {
    const [candidateId, pricingMode] = key.split('::');
    return {
      candidateId,
      pricingMode,
      observedAt: OBSERVED_AT,
      evidenceRef: `pricing://${candidateId}/${pricingMode}`,
      inputUsdPerMillion: 1,
      outputUsdPerMillion: 1,
      cacheReadUsdPerMillion: 0.1,
      officialOrMeteredEvidence: true
    };
  });
  return { runtimeReceipts: [...runtimeMap.values()], pricingReceipts };
}

test('custodian request exposes only the sealed external contract and zero authority', () => {
  const out = buildApexFqcCustodianRequest({ campaignConfig: campaign });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.status, 'APEX_FQC_CUSTODIAN_REQUEST_READY');
  assert.equal(out.request.minimumTaskCount, 40);
  assert.equal(out.request.totalCampaignSpendCeilingUsd, 10);
  assert.equal(out.request.custodianInstructions.previouslyEvaluatedItemsAllowed, false);
  assert.equal(out.request.custodianInstructions.rawHoldoutsStoredInRepository, false);
  assert.equal(out.executionAuthority, 'NONE');
  assert.equal(out.providerCallAuthority, 'NONE');
  assert.equal(out.spendAuthority, 'NONE');
  const serialized = JSON.stringify(out);
  assert.equal(serialized.includes('private-answer'), false);
  assert.match(out.requestDigest, /^[a-f0-9]{64}$/);
});

test('external evidence packet reports the custodian gate before runtime when evidence is absent', () => {
  const out = compileApexFqcExternalEvidencePacket({ campaignConfig: campaign });
  assert.equal(out.ok, true);
  assert.equal(out.status, 'APEX_FQC_EXTERNAL_EVIDENCE_INCOMPLETE');
  assert.equal(out.custodianAdmitted, false);
  assert.equal(out.runtimeReady, false);
  assert.ok(out.missingOrInvalidEvidence.length > 0);
  assert.equal(out.providerCallsPerformed, 0);
  assert.equal(out.spendUsd, 0);
});

test('fresh custodian evidence can be admitted while exact runtime/pricing remains independently blocked', () => {
  const plan = prepareFreshApexCampaign(campaign);
  const rows = manifest();
  const out = compileApexFqcExternalEvidencePacket({
    campaignConfig: campaign,
    sealedManifest: rows,
    custodianReceipt: receipt(plan, rows)
  });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.status, 'APEX_FQC_EXTERNAL_EVIDENCE_INCOMPLETE');
  assert.equal(out.custodianAdmitted, true);
  assert.equal(out.runtimeReady, false);
  assert.ok(out.packetSummary.unresolvedEvidence.some(code => code.startsWith('missing-runtime-proof:')));
  assert.ok(out.packetSummary.unresolvedEvidence.some(code => code.startsWith('missing-pricing-proof:')));
});

test('complete secret-free exact evidence packet reaches readiness without granting execution authority', () => {
  const plan = prepareFreshApexCampaign(campaign);
  const rows = manifest();
  const { runtimeReceipts, pricingReceipts } = evidence(plan);
  const out = compileApexFqcExternalEvidencePacket({
    campaignConfig: campaign,
    sealedManifest: rows,
    custodianReceipt: receipt(plan, rows),
    runtimeReceipts,
    pricingReceipts
  });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.status, 'APEX_FQC_EXTERNAL_EVIDENCE_READY_FOR_SEPARATELY_AUTHORIZED_EXECUTION');
  assert.equal(out.custodianAdmitted, true);
  assert.equal(out.runtimeReady, true);
  assert.equal(out.executionAuthority, 'NONE');
  assert.equal(out.providerCallAuthority, 'NONE');
  assert.equal(out.spendAuthority, 'NONE');
  assert.equal(out.providerCallsPerformed, 0);
  assert.equal(out.spendUsd, 0);
  assert.match(out.evidencePacketDigest, /^[a-f0-9]{64}$/);
});

test('secret or raw holdout material is refused before packet compilation', () => {
  const out = compileApexFqcExternalEvidencePacket({
    campaignConfig: campaign,
    custodianReceipt: { apiKey: 'should-never-appear' }
  });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('secret-or-raw-holdout-material-prohibited'));
});
