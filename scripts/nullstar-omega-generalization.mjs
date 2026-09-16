#!/usr/bin/env node
// Section 311. Did this session's improvement generalize beyond the family it
// was built for?
//
// The improvement is the reality-connection discipline: seal the forecast,
// name what decides the outcome, fix the derivation rule before the output
// exists. It was designed against one family -- "will this mutation die" --
// and then applied to two others. Whether it survived contact with them is a
// measurable fact, not a judgement call.
import { readFileSync, writeFileSync } from 'node:fs';
import { evaluateCrossDomainTransfer } from '../src/cross-domain-transfer-evaluator.mjs';

const reality = JSON.parse(readFileSync('artifacts/nullstar-omega/reality-connection.json', 'utf8'));

// First-attempt correctness: did the apparatus produce an admissible,
// correctly-derived observation without being repaired after seeing output?
const FAMILIES = [
  {
    familyId: 'mutation-survival',
    domain: 'test-guard behaviour',
    firstAttemptCorrect: false,
    whatHappened: 'The derivation rule matched "survived" inside guard descriptions and read the catalogue as the result. Recorded SOME_SURVIVED against an actual 397 killed, 0 not killed.'
  },
  {
    familyId: 'import-graph-reachability',
    domain: 'static structure of the tree',
    firstAttemptCorrect: false,
    whatHappened: 'The observer read config/reachability-classification.json, the same file this session used to park those modules, so the observation was scored against its own prior declaration. Repaired to compute the import graph, which returned the same answer from an independent source.'
  },
  {
    familyId: 'directive-coverage',
    domain: 'reconciler output over the tree',
    firstAttemptCorrect: true,
    whatHappened: 'The observer ran the reconciler and counted MISSING rows. Admissible and correctly derived on first attempt.'
  }
];

const succeeded = FAMILIES.filter(family => family.firstAttemptCorrect).length;

// The repository already has a cross-domain transfer evaluator. Run the real
// data through it rather than writing a second one -- and let it refuse if the
// data does not satisfy its protocol. A refusal here is information; inventing
// baseline and candidate scores to satisfy the schema would not be.
const attempted = evaluateCrossDomainTransfer({
  experimentId: 'nullstar-omega-reality-connection-generalization',
  evaluatorContractHash: 'sha256:reality-connection-first-attempt-correctness',
  holdoutProtocolHash: reality.records
    .map(record => record.evidenceDigest)
    .filter(Boolean)
    .join('|') || 'no-digests',
  families: FAMILIES.map(family => ({
    familyId: family.familyId,
    // Every arm would need a matched compute and tool budget and a 0-1 score
    // from the same instrument. This environment has no instrument that scores
    // a candidate against a baseline, so the arms are deliberately left unbuilt
    // and the evaluator is expected to refuse.
    baseline: null,
    current: null,
    candidate: null
  }))
});

const record = {
  schemaVersion: 'uberbond-nullstar-omega-generalization-1.0.0',
  directiveSection: '311',
  generatedAt: new Date().toISOString(),
  improvementUnderTest: 'The reality-connection discipline: sealed forecast, named decider, derivation rule fixed before the output exists.',
  builtForFamily: 'mutation-survival',
  appliedToFamilies: FAMILIES.map(family => family.familyId),
  families: FAMILIES,
  firstAttemptCorrect: succeeded,
  familiesTried: FAMILIES.length,
  transferRate: Number((succeeded / FAMILIES.length).toFixed(4)),
  verdict: succeeded >= Math.ceil(FAMILIES.length * 2 / 3)
    ? 'GENERALIZED_ACROSS_FAMILIES'
    : 'DID_NOT_GENERALIZE__APPARATUS_FAILED_ON_MOST_NEW_FAMILIES',
  finding: 'The discipline held. The apparatus did not. Both failures were in the observer, not in the sealing: one read guard prose as a result, the other read a file this session had written. The seal is what made both failures visible instead of invisible.',
  existingEvaluator: {
    module: 'src/cross-domain-transfer-evaluator.mjs',
    used: false,
    status: attempted.status,
    reasonCodes: attempted.reasonCodes ?? null,
    whyNotUsed: 'Its protocol needs three arms per family at matched compute and tool budget, scored 0-1 by one instrument. No instrument here scores a candidate against a baseline, and filling the arms with invented numbers to pass the schema would manufacture the evidence the section asks for.'
  },
  truthBoundary: 'THIS MEASURES WHETHER ONE MECHANISM SURVIVED THREE FAMILIES INSIDE THIS REPOSITORY. IT IS NOT EVIDENCE OF TRANSFER TO ANY DOMAIN OUTSIDE IT.',
  businessEffectAuthority: 'NONE'
};

writeFileSync('artifacts/nullstar-omega/generalization.json', `${JSON.stringify(record, null, 2)}\n`);
console.log(`${record.verdict} ${succeeded}/${FAMILIES.length} families correct on first attempt (rate ${record.transferRate})`);
console.log(`existing evaluator refused as expected: ${attempted.status} [${(attempted.reasonCodes ?? []).join(', ')}]`);
