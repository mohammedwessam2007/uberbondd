#!/usr/bin/env node
// Re-read the pinned skill bodies and normalize them into capability records.
//
// Reproducible on purpose. The pins come from the measured body corpus already
// in the repository, so this reads exactly the commits and blobs that were
// observed before -- not whatever those paths hold today. A body that has since
// changed fails the identity check instead of quietly normalizing something
// else under the same name.
//
// The bodies are never written here. Only the derived records are, and those
// carry hashes, matched phrases from the repository's own evidence table, and
// offsets -- no copied prose.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { executePinnedRawSkillBodyReads } from '../src/capability-genome-body-fetch.mjs';
import {
  normalizeSkillBodyIntoCapability,
  buildNormalizedCapabilityCorpus,
  CAPABILITY_GENOME_BODY_NORMALIZE_VERSION
} from '../src/capability-genome-body-normalize.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const args = new Set(process.argv.slice(2));

const PILOT = 'artifacts/capability-genome/pilot/world-skill-bodies-2026-08-31.json';
const OUT = 'artifacts/capability-genome/pilot/normalized-capability-records-2026-09-01.json';

const pilot = read(PILOT);
const atoms = read('artifacts/capability-genome/capability-atoms.json').atoms;
const evidenceTerms = read('artifacts/capability-genome/atom-evidence-terms.json');
const reviewedNeeds = read('artifacts/capability-genome/reviewed-unmapped-needs.json');

if (!args.has('--execute')) {
  console.log(JSON.stringify({
    ok: true,
    status: 'CAPABILITY_NORMALIZATION_PLAN_ONLY',
    normalizeVersion: CAPABILITY_GENOME_BODY_NORMALIZE_VERSION,
    networkReadsExecuted: false,
    pinnedBodiesAvailable: pilot.bodies.length,
    atomTaxonomySize: atoms.length,
    next: 'RUN_WITH_--execute_AND_UBERBOND_CAPABILITY_GENOME_NETWORK_READS=1',
    businessEffectAuthority: 'NONE'
  }, null, 2));
  process.exit(0);
}
if (process.env.UBERBOND_CAPABILITY_GENOME_NETWORK_READS !== '1') {
  console.log(JSON.stringify({
    ok: false,
    status: 'SKILL_BODY_NETWORK_READS_NOT_AUTHORIZED_ON_HOST',
    reasonCodes: ['set-UBERBOND_CAPABILITY_GENOME_NETWORK_READS=1-for-public-read-only-execution'],
    businessEffectAuthority: 'NONE'
  }, null, 2));
  process.exit(2);
}

const execution = await executePinnedRawSkillBodyReads({
  requests: pilot.bodies.map(body => ({
    repositoryFullName: body.repositoryFullName,
    sourceCommit: body.sourceCommit,
    skillPath: body.skillPath,
    expectedGitBlobSha: body.gitBlobSha,
    expectedContentSha256: body.contentSha256,
    declaredLicenseHint: body.declaredLicenseHint,
    observedAt: new Date()
  })),
  maxProviderCalls: Math.max(4, pilot.bodies.length * 2)
});

if (!execution.ok || execution.status !== 'PINNED_PUBLIC_SKILL_BODY_READS_COMPLETE') {
  console.log(JSON.stringify({
    ok: false,
    status: execution.status,
    reasonCodes: execution.reasonCodes || [],
    operatorAction: execution.operatorAction || null,
    providerCalls: execution.providerCalls,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: execution.externalEffectLedger
  }, null, 2));
  process.exit(1);
}

const normalizations = [];
for (const imported of execution.imports) {
  const result = normalizeSkillBodyIntoCapability({
    bodyEvidence: imported.bodyEvidence,
    content: imported.body,
    atoms,
    evidenceTerms,
    declaredUnmappedNeeds: reviewedNeeds.needs[imported.bodyEvidence.artifactIdentity] || []
  });
  if (!result.ok) {
    console.log(JSON.stringify({ ok: false, status: result.status, reasonCodes: result.reasonCodes, artifactIdentity: imported.bodyEvidence.artifactIdentity }, null, 2));
    process.exit(1);
  }
  normalizations.push(result);
}

const corpus = buildNormalizedCapabilityCorpus({ normalizations });
if (!corpus.ok) {
  console.log(JSON.stringify({ ok: false, status: corpus.status, reasonCodes: corpus.reasonCodes }, null, 2));
  process.exit(1);
}

const receipt = {
  schemaVersion: 'uberbond.capability-genome.normalized-records.v1',
  normalizeVersion: CAPABILITY_GENOME_BODY_NORMALIZE_VERSION,
  producedBy: 'scripts/capability-genome-normalize-bodies.mjs',
  sourcePins: PILOT,
  atomTaxonomyVersion: read('artifacts/capability-genome/capability-atoms.json').schemaVersion,
  evidenceTermsVersion: evidenceTerms.schemaVersion,
  observedAt: corpus.observedAt,
  providerCalls: execution.providerCalls,
  transport: execution.transport,
  readReceipts: execution.receipts,
  capabilityRecordsNormalized: corpus.capabilityRecordsNormalized,
  recordsWithNoTaxonomyAtomMatch: corpus.recordsWithNoTaxonomyAtomMatch,
  distinctClaimedAtomIds: corpus.distinctClaimedAtomIds,
  unmappedCapabilityNeeds: corpus.unmappedCapabilityNeeds,
  securityQuarantinedRecords: corpus.securityQuarantinedRecords,
  securityReviewRecords: corpus.securityReviewRecords,
  securityStaticClearRecords: corpus.securityStaticClearRecords,
  licenseUnknownRecords: corpus.licenseUnknownRecords,
  dedupedCapabilities: corpus.dedupedCapabilities,
  securityReviewedCapabilities: corpus.securityReviewedCapabilities,
  eligibleCapabilities: corpus.eligibleCapabilities,
  approvedCapabilities: corpus.approvedCapabilities,
  activeCapabilities: corpus.activeCapabilities,
  atomClaimEvidence: normalizations.map(item => ({
    capabilityId: item.capability.id,
    sourceHash: item.capability.sourceHash,
    taxonomyCoverage: item.taxonomyCoverage,
    securityScreeningDecision: item.securityScreeningDecision,
    claims: item.atomClaims.map(claim => ({ atomId: claim.atom.id, sideEffectClass: claim.atom.sideEffectClass, claimClass: claim.claimClass, evidence: claim.evidence }))
  })),
  capabilities: corpus.capabilities,
  corpusDigest: corpus.corpusDigest,
  truthBoundary: corpus.truthBoundary,
  businessEffectAuthority: 'NONE',
  externalEffectLedger: execution.externalEffectLedger
};

fs.writeFileSync(path.join(root, OUT), `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({
  ok: true,
  status: 'NORMALIZED_CAPABILITY_RECORDS_WRITTEN',
  out: OUT,
  capabilityRecordsNormalized: receipt.capabilityRecordsNormalized,
  approvedCapabilities: receipt.approvedCapabilities,
  activeCapabilities: receipt.activeCapabilities,
  providerCalls: receipt.providerCalls,
  businessEffectAuthority: 'NONE'
}, null, 2));
