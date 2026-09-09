#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assessVolitionalIntegrity, detectPreferenceFeedbackLoop, presentWillBoundary } from '../src/volitional-integrity.mjs';
import { preferenceProvenance } from '../src/living-self-model.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const token = process.argv[i];
  if (!token.startsWith('--')) continue;
  const value = process.argv[i + 1];
  args.set(token, value && !value.startsWith('--') ? process.argv[++i] : true);
}

const inputPath = args.get('--input') ? resolve(root, String(args.get('--input'))) : null;

try {
  if (!inputPath) throw new Error('local-volitional-review-input-required');
  const input = JSON.parse(await readFile(inputPath, 'utf8'));
  const provenance = preferenceProvenance({
    preference: input.preference,
    origins: input.origins,
    persistsAcrossContexts: input.persistsAcrossContexts,
    currentlyEndorsed: input.currentlyEndorsed
  });
  if (!provenance.ok) throw new Error(`preference-provenance-refused:${(provenance.reasonCodes || []).join(',')}`);

  const assessment = assessVolitionalIntegrity({
    provenance,
    recommendationRef: input.recommendationRef,
    highStakes: input.highStakes,
    practicallyIrreversible: input.practicallyIrreversible,
    declaredInfluences: input.declaredInfluences,
    endorsement: input.endorsement,
    evaluatedAt: input.evaluatedAt
  });
  if (!assessment.ok) {
    console.error(JSON.stringify(assessment, null, 2));
    process.exitCode = 2;
  } else {
    const feedback = detectPreferenceFeedbackLoop({
      provenance,
      recommendationRefs: input.recommendationRefs || [input.recommendationRef].filter(Boolean),
      behaviorEvidenceRefs: input.behaviorEvidenceRefs || [],
      declaredInfluences: input.declaredInfluences || []
    });
    const presentChoice = input.presentChoice
      ? presentWillBoundary({ presentChoice: input.presentChoice, modelRecommendation: input.recommendationRef, evaluatedAt: input.evaluatedAt })
      : null;
    console.log(JSON.stringify({
      ok: true,
      status: 'LOCAL_VOLITIONAL_INTEGRITY_REVIEW_COMPLETE',
      assessment,
      feedback,
      presentChoice,
      privateVaultAccess: false,
      networkCalls: 0,
      providerCalls: 0,
      recommendationAuthority: 'NONE',
      choiceAuthority: 'FOUNDER_ONLY',
      businessEffectAuthority: 'NONE'
    }, null, 2));
  }
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    status: 'LOCAL_VOLITIONAL_INTEGRITY_REVIEW_REFUSED',
    reasonCodes: [String(error?.message || error).slice(0, 300)],
    privateVaultAccess: false,
    networkCalls: 0,
    providerCalls: 0,
    recommendationAuthority: 'NONE',
    choiceAuthority: 'FOUNDER_ONLY',
    businessEffectAuthority: 'NONE'
  }, null, 2));
  process.exitCode = 2;
}
