import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ABSOLUTE_FRONTIER_QUALITY_DELTA,
  ABSOLUTE_FRONTIER_QUALITY_POLICY_DIGEST
} from '../src/absolute-frontier-quality-invariant.mjs';

const SOURCE_CONTRACTS = [
  {
    path: './src/apex-reasoning-hypercompiler.mjs',
    required: [
      "qualityFloorDelta = ABSOLUTE_FRONTIER_QUALITY_DELTA",
      "validateAbsoluteFrontierQualityPolicy({ qualityDelta })",
      "absoluteQualityInvariant: qualityInvariantAttestation()"
    ],
    forbidden: ["qualityFloorDelta = 0.01", "qualityFloorDelta = 0.05"]
  },
  {
    path: './src/frontier-cognitive-fabric.mjs',
    required: [
      "const DEFAULT_FRONTIER_QUALITY_DELTA = ABSOLUTE_FRONTIER_QUALITY_DELTA;",
      "validateAbsoluteFrontierQualityPolicy({ qualityDelta, minimumEvidenceConfidence: confidence, allowDegradedCouncil })",
      "absoluteQualityInvariant: qualityInvariantAttestation()"
    ],
    forbidden: ["DEFAULT_FRONTIER_QUALITY_DELTA = 0.05", "DEFAULT_FRONTIER_QUALITY_DELTA = 0.01"]
  },
  {
    path: './src/frontier-reasoning-runtime.mjs',
    required: [
      "validateQualityInvariantAttestation(member?.absoluteQualityInvariant)",
      "absoluteQualityInvariant: member.absoluteQualityInvariant"
    ],
    forbidden: []
  },
  {
    path: './src/apex-sealed-tournament.mjs',
    required: [
      "qualityFloorDelta = ABSOLUTE_FRONTIER_QUALITY_DELTA",
      "certifyPairedZeroLoss({ baselineTrial: incumbent, candidateTrial: leader })",
      "absoluteQualityInvariant: qualityInvariantAttestation()"
    ],
    forbidden: ["qualityFloorDelta = 0.01", "qualityFloorDelta = 0.05"]
  },
  {
    path: './src/reasoning-architecture-lab.mjs',
    required: [
      "qualityFloorDelta = ABSOLUTE_FRONTIER_QUALITY_DELTA",
      "validateQualityInvariantAttestation(candidate?.semanticQualityFloor?.absoluteQualityInvariant)"
    ],
    forbidden: ["qualityFloorDelta = 0.01", "qualityFloorDelta = 0.05"]
  },
  {
    path: './src/ubermind-cognitive-exchange.mjs',
    required: [
      "let reasoningTier='FRONTIER_MAX'",
      "reasoningTier='COUNCIL_MAX'",
      "absoluteQualityInvariant:qualityInvariantAttestation()"
    ],
    forbidden: ["reasoningTier='FAST'", "reasoningTier='STANDARD'", "reasoningTier='DEEP'"]
  }
];

test('absolute frontier quality constants are zero-loss and stable', () => {
  assert.equal(ABSOLUTE_FRONTIER_QUALITY_DELTA, 0);
  assert.match(ABSOLUTE_FRONTIER_QUALITY_POLICY_DIGEST, /^[a-f0-9]{64}$/);
});

test('authority-bearing cognition source retains mandatory zero-loss guards', () => {
  for (const contract of SOURCE_CONTRACTS) {
    const source = fs.readFileSync(contract.path, 'utf8');
    for (const needle of contract.required) {
      assert.equal(source.includes(needle), true, `${contract.path} missing guard: ${needle}`);
    }
    for (const needle of contract.forbidden) {
      assert.equal(source.includes(needle), false, `${contract.path} reopened forbidden bypass: ${needle}`);
    }
  }
});

test('Wave 1 campaign is cryptographically pinned to the exact quality law', () => {
  const campaign = JSON.parse(fs.readFileSync('./config/apex-frontier-quality-compression-campaign.json', 'utf8'));
  assert.equal(campaign.qualityFloorPolicy.maxQualityDelta, 0);
  assert.equal(campaign.qualityFloorPolicy.absoluteQualityPolicyDigest, ABSOLUTE_FRONTIER_QUALITY_POLICY_DIGEST);
});
