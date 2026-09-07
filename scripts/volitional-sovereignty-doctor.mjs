#!/usr/bin/env node
import { recordPreference, tracePreferenceLineage } from '../src/preference-provenance.mjs';
import { compileMetaVolition } from '../src/meta-volition-engine.mjs';
import { assessVolitionalIntegrity, presentWillVeto } from '../src/volitional-integrity-engine.mjs';

const influenced = recordPreference({
  preferenceId: 'fixture-influenced',
  statement: 'synthetic preference',
  origin: 'AI_SUGGESTION',
  influencedBy: ['ai:fixture-recommendation']
});
const lineage = tracePreferenceLineage([influenced]);
const meta = compileMetaVolition({
  object: 'synthetic preference',
  firstOrder: 'WANT',
  secondOrder: 'ENDORSE_NOT_WANTING'
});
const integrity = assessVolitionalIntegrity({
  preference: influenced,
  lineage,
  recommendationRef: 'fixture:consequential-recommendation',
  irreversible: true,
  aiGeneratedRecommendation: true
});
const veto = presentWillVeto({
  presentChoice: 'DO_NOT_CHOOSE',
  modelRecommendation: 'fixture model recommends choosing'
});

const ok = influenced.ok && lineage.ok && meta.ok && integrity.ok && veto.ok
  && meta.status === 'META_VOLITION_CONFLICT_VISIBLE'
  && integrity.status === 'VOLITIONAL_REVIEW_REQUIRED'
  && veto.modelMayOverride === false
  && integrity.businessEffectAuthority === 'NONE';

process.stdout.write(`${JSON.stringify({
  ok,
  status: ok ? 'VOLITIONAL_SOVEREIGNTY_DOCTOR_GREEN' : 'VOLITIONAL_SOVEREIGNTY_DOCTOR_FAILED',
  preferenceOrigin: influenced.origin,
  metaVolition: meta.status,
  integrity: integrity.status,
  presentWill: veto.status,
  authenticityClaimed: false,
  privateFounderDataLoaded: false,
  businessEffectAuthority: 'NONE'
}, null, 2)}\n`);
if (!ok) process.exitCode = 2;
