import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FRONTIER_SOURCE_REGISTRY,
  FRONTIER_FEATURE_COVERAGE,
  buildFrontierSourceCoverageReceipt
} from '../src/frontier-source-coverage.mjs';

const REQUIRED_IDS = [
  'operator.plan-mode',
  'operator.goal-engine',
  'operator.persistent-loop',
  'operator.task-dashboard',
  'operator.context-meter',
  'operator.worker-spec-compiler',
  'operator.research-swarm',
  'operator.business-operations-worker',
  'operator.reference-driven-product-work',
  'operator.compounding-knowledge',
  'automation.project-memory',
  'automation.landing-page-generator',
  'automation.seo-content-pipeline',
  'automation.social-content-pipeline',
  'automation.mini-app-generator',
  'automation.connector-fabric',
  'automation.twitter-workflow',
  'automation.livestream-repurposing',
  'automation.note-system',
  'automation.gamified-productivity-app',
  'automation.youtube-packaging',
  'automation.browser-computer-use',
  'automation.browser-email-ops',
  'automation.browser-commerce-ops',
  'automation.hands-free-blog-pipeline',
  'automation.code-agent-bridge',
  'automation.alternate-code-surface-bridge',
  'automation.skill-runtime',
  'automation.artifact-builder',
  'automation.data-analysis',
  'automation.spreadsheet-reconstruction',
  'automation.gmail-adapter',
  'automation.calendar-adapter',
  'automation.drive-adapter',
  'automation.payment-adapter',
  'automation.workflow-adapter',
  'automation.recurring-task-engine',
  'model.open-model-foundry',
  'model.hardware-fit',
  'model.hosted-open-weight-routing',
  'model.local-runtime-routing',
  'model.task-specific-tournament',
  'model.specialization-path',
  'model.specialist-worker-distillation',
  'model.frontier-feature-extraction',
  'model.future-provider-socket'
];

test('source registry preserves owner source and public mirror provenance', () => {
  assert.ok(FRONTIER_SOURCE_REGISTRY.some(source => source.locator.includes('x.com/1006_amit7481/status/2095014617412165952')));
  assert.ok(FRONTIER_SOURCE_REGISTRY.some(source => source.locator.includes('youtube.com/watch?v=KrKhfm2Xuho')));
});

test('frontier source coverage preserves every explicitly harvested mechanism', () => {
  const ids = new Set(FRONTIER_FEATURE_COVERAGE.map(item => item.id));
  for (const id of REQUIRED_IDS) assert.equal(ids.has(id), true, `missing harvested capability ${id}`);
});

test('coverage receipt has unique IDs and zero authority', () => {
  const receipt = buildFrontierSourceCoverageReceipt();
  assert.equal(receipt.ok, true);
  assert.equal(receipt.duplicateIds.length, 0);
  assert.ok(receipt.counts.frontierOperator > 0);
  assert.ok(receipt.counts.automationCourse > 0);
  assert.ok(receipt.counts.openModel > 0);
  assert.ok(receipt.capabilities.every(item => item.executionAuthority === 'NONE'));
  assert.ok(receipt.capabilities.every(item => item.commercialTruthAuthority === 'NONE'));
  assert.equal(receipt.businessEffectAuthority, 'NONE');
});

test('commerce and publishing features remain explicitly authority-separated', () => {
  const receipt = buildFrontierSourceCoverageReceipt();
  assert.ok(receipt.invariants.includes('browser-commerce-capability-never-implies-purchase-authority'));
  assert.ok(receipt.invariants.includes('publishing-capability-never-implies-message-or-publication-authority'));
});
