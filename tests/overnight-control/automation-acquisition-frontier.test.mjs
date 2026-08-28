import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXTENDED_AUTOMATION_CANDIDATES,
  INTERNAL_AUTOMATION_CAPABILITY_REGISTRY,
  advanceAutomationAcquisitionFrontier,
  advanceCurrentAutomationAcquisitionFrontier,
  currentInternalSatisfiedCapabilityKeys,
  mergeAutomationCandidateSets
} from '../../src/overnight/control/automation-acquisition-frontier.mjs';

function ranked(capabilityKey, score, decision = 'BUILD_ADAPTER', repo = `${capabilityKey}/repo`) {
  return { candidate: { capabilityKey, repo }, score, decision, businessEffectAuthority: 'NONE' };
}
function loop(items) {
  return { ok: true, acquisitionDigest: 'digest_1', ranked: items };
}

test('extended candidate registry contains scheduling, forms, signatures, invoicing, social and mailing patterns', () => {
  const keys = new Set(EXTENDED_AUTOMATION_CANDIDATES.map(item => item.capabilityKey));
  for (const key of [
    'calendar-and-booking-execution', 'form-and-feedback-ingestion', 'commercial-document-signature',
    'invoice-and-receivables-automation', 'social-publishing-and-scheduling', 'marketing-lifecycle-automation'
  ]) assert.equal(keys.has(key), true, key);
});

test('AGPL and unknown-license observations remain immutable metadata rather than copied code', () => {
  const documenso = EXTENDED_AUTOMATION_CANDIDATES.find(item => item.repo === 'documenso/documenso');
  const postiz = EXTENDED_AUTOMATION_CANDIDATES.find(item => item.repo === 'gitroomhq/postiz-app');
  const invoice = EXTENDED_AUTOMATION_CANDIDATES.find(item => item.repo === 'invoiceninja/invoiceninja');
  assert.equal(documenso.licenseSpdx, 'AGPL-3.0');
  assert.equal(postiz.licenseSpdx, 'AGPL-3.0');
  assert.equal(invoice.licenseSpdx, 'NOASSERTION');
  assert.equal(postiz.coverage, 'MISSING');
  assert.equal(invoice.coverage, 'MISSING');
});

test('candidate set merge preserves unique repos and deduplicates exact repeats', () => {
  const one = { repo: 'example/tool', capabilityKey: 'one' };
  const result = mergeAutomationCandidateSets([one], [structuredClone(one)]);
  assert.equal(result.ok, true);
  assert.equal(result.candidateCount, 1);
  assert.equal(result.duplicates.length, 1);
});

test('conflicting evidence for one repository fails frontier merge closed', () => {
  const result = mergeAutomationCandidateSets(
    [{ repo: 'example/tool', capabilityKey: 'one' }],
    [{ repo: 'example/tool', capabilityKey: 'two' }]
  );
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('conflicting-repository-evidence'));
});

test('satisfied voice advances the same ranked tournament to browser action', () => {
  const result = advanceAutomationAcquisitionFrontier({
    loopResult: loop([
      ranked('voice-reception-and-call-lifecycle', 100, 'BUILD_ADAPTER', 'livekit/agents'),
      ranked('browser-action-automation', 90, 'BUILD_ADAPTER', 'browser-use/browser-use'),
      ranked('connector-ecosystem', 80, 'REFERENCE_ONLY', 'n8n-io/n8n')
    ]),
    satisfiedCapabilityKeys: ['voice-reception-and-call-lifecycle']
  });
  assert.equal(result.ok, true);
  assert.equal(result.selected.candidate.capabilityKey, 'browser-action-automation');
  assert.equal(result.ranked[0].frontierDisposition, 'INTERNAL_STEP_SATISFIED');
});

test('satisfied voice and browser advance to the next money primitive', () => {
  const result = advanceAutomationAcquisitionFrontier({
    loopResult: loop([
      ranked('voice-reception-and-call-lifecycle', 100),
      ranked('browser-action-automation', 90),
      ranked('invoice-and-receivables-automation', 85),
      ranked('calendar-and-booking-execution', 82)
    ]),
    satisfiedCapabilityKeys: ['browser-action-automation', 'voice-reception-and-call-lifecycle']
  });
  assert.equal(result.selected.candidate.capabilityKey, 'invoice-and-receivables-automation');
});

test('satisfied capability ordering does not alter frontier identity', () => {
  const input = loop([ranked('voice-reception-and-call-lifecycle', 100), ranked('browser-action-automation', 90)]);
  const a = advanceAutomationAcquisitionFrontier({ loopResult: input, satisfiedCapabilityKeys: ['voice-reception-and-call-lifecycle', 'browser-action-automation'] });
  const b = advanceAutomationAcquisitionFrontier({ loopResult: input, satisfiedCapabilityKeys: ['browser-action-automation', 'voice-reception-and-call-lifecycle'] });
  assert.equal(a.frontierDigest, b.frontierDigest);
});

test('branch registry covers every automation contract built on this PR including social composition', () => {
  const keys = currentInternalSatisfiedCapabilityKeys();
  for (const key of [
    'voice-reception-and-call-lifecycle', 'browser-action-automation', 'omnichannel-conversation-transport',
    'calendar-and-booking-execution', 'external-crm-sync', 'web-context-extraction-at-scale',
    'invoice-and-receivables-automation', 'form-and-feedback-ingestion', 'commercial-document-signature',
    'social-publishing-and-scheduling'
  ]) assert.equal(keys.includes(key), true, key);
  const social = INTERNAL_AUTOMATION_CAPABILITY_REGISTRY.find(item => item.capabilityKey === 'social-publishing-and-scheduling');
  assert.equal(social.satisfactionClass, 'COMPOSED_INTERNAL_CONTRACT');
  assert.ok(social.contractModules.includes('src/social-publication-schedule-contract.mjs'));
  assert.ok(social.contractModules.includes('src/omnichannel-communication-contract.mjs'));
  assert.ok(social.contractModules.includes('src/agent-autonomy-scheduled-run.mjs'));
});

test('current frontier skips all branch-built capabilities and selects the first genuinely unbuilt gap', () => {
  const built = currentInternalSatisfiedCapabilityKeys().map((key, index) => ranked(key, 1000 - index));
  const result = advanceCurrentAutomationAcquisitionFrontier({
    loopResult: loop([...built, ranked('accounting-ledger-export', 1)])
  });
  assert.equal(result.ok, true);
  assert.equal(result.selected.candidate.capabilityKey, 'accounting-ledger-export');
  assert.equal(result.status, 'NEXT_UNSATISFIED_INTERNAL_GAP_SELECTED');
});

test('current frontier closes when every actionable gap has an internal contract', () => {
  const built = currentInternalSatisfiedCapabilityKeys().map((key, index) => ranked(key, 1000 - index));
  const result = advanceCurrentAutomationAcquisitionFrontier({ loopResult: loop(built) });
  assert.equal(result.ok, true);
  assert.equal(result.selected, null);
  assert.equal(result.status, 'NO_REMAINING_INTERNAL_BUILD_GAP');
  assert.equal(result.satisfactionEvidence.length, built.length);
});

test('internal contract satisfaction never upgrades external activation truth or grants effects', () => {
  const result = advanceCurrentAutomationAcquisitionFrontier({
    loopResult: loop([ranked('social-publishing-and-scheduling', 90)])
  });
  assert.equal(result.ok, true);
  assert.equal(result.externalActivationStatus, 'UNPROVEN_PROVIDER_AND_CUSTOMER_EFFECTS');
  assert.equal(result.businessEffectAuthority, 'NONE');
  assert.equal(result.externalEffectLedger.messages, 0);
  assert.equal(result.externalEffectLedger.providerCalls, 0);
  assert.ok(result.satisfactionEvidence.every(item => item.externalActivation === 'EXTERNAL_PROOF_REQUIRED'));
});

test('caller extras can only mark internal steps and remain external-proof-gated', () => {
  const result = advanceCurrentAutomationAcquisitionFrontier({
    loopResult: loop([ranked('new-local-contract', 1)]),
    extraSatisfiedCapabilityKeys: ['new-local-contract']
  });
  assert.equal(result.selected, null);
  const evidence = result.satisfactionEvidence.find(item => item.capabilityKey === 'new-local-contract');
  assert.equal(evidence.satisfactionClass, 'CALLER_ASSERTED_INTERNAL_STEP');
  assert.equal(evidence.externalActivation, 'EXTERNAL_PROOF_REQUIRED');
});

test('frontier never grants execution authority or effects', () => {
  const result = advanceAutomationAcquisitionFrontier({ loopResult: loop([ranked('browser-action-automation', 90)]) });
  assert.equal(result.businessEffectAuthority, 'NONE');
  assert.equal(result.externalEffectLedger.messages, 0);
  assert.equal(result.externalEffectLedger.providerCalls, 0);
  assert.equal(result.externalEffectLedger.spendCents, 0);
});

test('malformed frontier input and satisfied keys fail closed', () => {
  const badLoop = advanceAutomationAcquisitionFrontier({ loopResult: { ok: true } });
  assert.equal(badLoop.ok, false);
  const badKeys = advanceAutomationAcquisitionFrontier({ loopResult: loop([]), satisfiedCapabilityKeys: 'voice' });
  assert.equal(badKeys.ok, false);
  assert.ok(badKeys.reasonCodes.includes('satisfied-capability-keys-array-required'));
  const badExtras = advanceCurrentAutomationAcquisitionFrontier({ loopResult: loop([]), extraSatisfiedCapabilityKeys: 'x' });
  assert.equal(badExtras.ok, false);
});
