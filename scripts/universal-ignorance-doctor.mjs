#!/usr/bin/env node
import {
  buildIgnoranceMap,
  mineUnknownUnknownProbes,
  prioritizeIgnoranceProbes
} from '../src/universal-ignorance-map.mjs';

// Synthetic/public-safe fixture only. This doctor demonstrates callability of
// the blindspot machinery without loading founder-private data or searching any
// external system.
const map = buildIgnoranceMap({
  question: 'What could make the synthetic launch decision wrong?',
  assumptions: [
    { id: 'fixture-assumption', claim: 'synthetic buyers care about the problem', tested: false }
  ],
  knownUnknowns: ['synthetic willingness to pay'],
  representedDomains: ['buyer'],
  expectedDomains: ['buyer', 'operations', 'failure-modes'],
  optionFamilies: ['FULL_COMMITMENT'],
  expectedOptionFamilies: ['FULL_COMMITMENT', 'REVERSIBLE_EXPERIMENT'],
  evidence: [
    { id: 'fixture-e1', lineage: 'fixture-shared', direction: 'SUPPORTS' },
    { id: 'fixture-e2', lineage: 'fixture-shared', direction: 'SUPPORTS' }
  ]
});
const mined = mineUnknownUnknownProbes({ ignoranceMap: map, maxProbes: 10 });
const leverage = Object.fromEntries(mined.probes.map((probe, index) => [probe.id, {
  opensOptions: index === 0,
  couldRevealRuin: index === 1,
  couldFlipRecommendation: index < 2,
  cheapToTest: index === 0
}]));
const prioritized = prioritizeIgnoranceProbes({ probes: mined.probes, leverage });
const ok = map.ok && mined.ok && prioritized.ok
  && mined.claimAboutUnknownUnknownsFound === false
  && mined.probes.every(row => row.authority === 'QUESTION_ONLY')
  && prioritized.businessEffectAuthority === 'NONE';

process.stdout.write(`${JSON.stringify({
  ok,
  status: ok ? 'UNIVERSAL_IGNORANCE_DOCTOR_GREEN' : 'UNIVERSAL_IGNORANCE_DOCTOR_FAILED',
  visibleGapCount: map.visibleGapCount,
  probeCount: mined.probes.length,
  claimAboutUnknownUnknownsFound: mined.claimAboutUnknownUnknownsFound,
  topTierLeverageDimensions: prioritized.tiers?.[0]?.leverageDimensions ?? null,
  privateFounderDataLoaded: false,
  businessEffectAuthority: 'NONE'
}, null, 2)}\n`);
if (!ok) process.exitCode = 2;
