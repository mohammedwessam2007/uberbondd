#!/usr/bin/env node
// PHASE 0: recover live truth.
//
// The V7 contract opens with "REFRESH LIVE MAIN, OPEN PRS, BRANCHES, TESTS,
// MUTATIONS, CANON, RUNTIME, MODEL/PROVIDER AVAILABILITY, DEPLOYMENT EVIDENCE,
// AND EXTERNAL REALITY" and marks its own embedded snapshot STALE BY DEFAULT.
//
// So this measures rather than recites. Every field is read from git, from a
// doctor, or from a generated artifact at the moment it runs, and anything it
// cannot observe is recorded as UNOBSERVED rather than omitted -- an absent
// field reads as "fine" to the next reader, which is the failure this artifact
// exists to prevent.
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = 'artifacts/v7/live-truth.json';
const UNOBSERVED = 'UNOBSERVED';

function sh(cmd, args) {
  try { return execFileSync(cmd, args, { cwd: root, encoding: 'utf8' }).trim(); }
  catch { return null; }
}
// The V9 materializer exits non-zero by design on an incomplete carrier, and its
// report is on stdout. Discarding stdout on a non-zero exit threw that report
// away and left the field reading UNOBSERVED, which is the opposite of what the
// script had just taken the trouble to say.
function shCapture(cmd, args) {
  try { return execFileSync(cmd, args, { cwd: root, encoding: 'utf8' }).trim(); }
  catch (error) { return (error.stdout || '').trim() || null; }
}
function readJson(path) {
  try { return JSON.parse(readFileSync(resolve(root, path), 'utf8')); } catch { return null; }
}

function gitTruth() {
  const head = sh('git', ['rev-parse', 'HEAD']);
  const mainSha = sh('git', ['rev-parse', 'origin/main']);
  const branch = sh('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
  const porcelain = sh('git', ['status', '--porcelain']);
  return {
    head: head ?? UNOBSERVED,
    originMain: mainSha ?? UNOBSERVED,
    branch: branch ?? UNOBSERVED,
    // A dirty tree makes every other measurement below describe a tree that is
    // not committed anywhere, so it is reported rather than tidied away.
    workingTreeClean: porcelain === '' ,
    uncommittedPaths: porcelain ? porcelain.split('\n').length : 0,
    commitsAheadOfMain: head && mainSha ? Number(sh('git', ['rev-list', '--count', `${mainSha}..${head}`]) ?? 0) : UNOBSERVED,
    commitsBehindMain: head && mainSha ? Number(sh('git', ['rev-list', '--count', `${head}..${mainSha}`]) ?? 0) : UNOBSERVED,
    remoteBranches: Number(sh('git', ['for-each-ref', '--format=x', 'refs/remotes/origin'])?.split('\n').length ?? 0)
  };
}

function canonTruth() {
  const readiness = readJson('artifacts/system-readiness.json');
  const directives = readJson('artifacts/constitution/directives.json');
  return {
    readinessPresent: Boolean(readiness),
    readinessDescribesSha: readiness?.sourceSha ?? readiness?.headSha ?? UNOBSERVED,
    constitution: directives ? {
      directives: directives.counts?.directives ?? UNOBSERVED,
      withMutationGuard: directives.counts?.withMutationGuard ?? UNOBSERVED,
      externalEffect: directives.counts?.externalEffect ?? UNOBSERVED,
      externalEffectWithMutationGuard: directives.counts?.externalEffectWithMutationGuard ?? UNOBSERVED,
      mutationAnchorsAvailable: directives.counts?.mutationAnchorsAvailable ?? UNOBSERVED,
      operativeSourcesUnranked: directives.precedence?.operativeSourcesUnranked?.length ?? UNOBSERVED,
      conflictCandidates: directives.conflictGraph?.length ?? UNOBSERVED,
      conflictsResolvableByPrecedence: (directives.conflictGraph ?? []).filter(row => row.precedenceResolvable).length
    } : UNOBSERVED
  };
}

function deploymentTruth() {
  const out = sh('node', [resolve(root, 'scripts/ubercel-doctor.mjs')]);
  if (!out) return { state: UNOBSERVED, note: 'ubercel doctor did not run' };
  const state = (out.match(/state:\s*(\S+)/) || [])[1] ?? UNOBSERVED;
  const authoritative = Number((out.match(/authoritative signals:\s*(\d+)/) || [])[1] ?? 0);
  return {
    state,
    contractBoundAuthoritativeSignals: authoritative,
    // Stated explicitly because the absence of this line is what let a provider
    // badge stand in for deployment truth once already.
    providerBadgesEstablish: 'NOTHING_ABOUT_UBERBOND_DEPLOYMENT_STATE'
  };
}

function canonicalV9Truth() {
  const out = shCapture('python3', [resolve(root, 'scripts/materialize-inevitability-v9.py')]);
  let report = null;
  try { report = JSON.parse(out ?? ''); } catch { /* the script exits non-zero on an incomplete carrier */ }
  if (!report) return { status: UNOBSERVED, executedFrom: 'UNKNOWN__MATERIALIZER_PRODUCED_NO_READABLE_REPORT' };
  return {
    status: report.status,
    partsVerified: report.partsVerified ?? UNOBSERVED,
    partsUnrecoverable: report.partsUnrecoverable ?? UNOBSERVED,
    missingEncodedBytes: report.missingEncodedBytes ?? 0,
    executedFrom: report.status === 'LOSSLESS_VERIFIED'
      ? 'CANONICAL_V9'
      : 'PARTIAL_V7_ANCESTOR__EXPLICITLY_NOT_CANONICAL_V9'
  };
}

function main() {
  const git = gitTruth();
  const artifact = {
    schemaVersion: 'uberbond.v7-live-truth.v1',
    generatedAt: new Date().toISOString(),
    sourceSha: git.head,
    generator: 'scripts/v7-live-truth.mjs',
    freshnessPolicy: 'Every field is measured at run time. This artifact is stale the moment main moves, and says so rather than being trusted.',
    staleByDefault: true,
    git,
    canon: canonTruth(),
    deployment: deploymentTruth(),
    canonicalV9: canonicalV9Truth(),
    notMeasuredHere: [
      'open pull requests (requires a GitHub call, which this generator does not make)',
      'model/provider availability (no provider is configured on this host)',
      'external reality: customers, payments, deliveries'
    ],
    uncertainty: 'A field reading UNOBSERVED was not measurable by this generator. It is not a zero and not a pass.',
    externalEffects: [],
    businessEffectAuthority: 'NONE'
  };

  mkdirSync(resolve(root, dirname(OUT)), { recursive: true });
  writeFileSync(resolve(root, OUT), `${JSON.stringify(artifact, null, 2)}\n`);

  console.log(`v7 live truth @ ${String(git.head).slice(0, 8)}`);
  console.log(`  branch ${git.branch}, ${git.commitsAheadOfMain} ahead / ${git.commitsBehindMain} behind main, tree ${git.workingTreeClean ? 'clean' : 'DIRTY'}`);
  console.log(`  canonical V9: ${artifact.canonicalV9.status} — executing from ${artifact.canonicalV9.executedFrom}`);
  console.log(`  deployment: ${artifact.deployment.state}`);
  console.log(`  constitution: ${artifact.canon.constitution.directives} directives, ${artifact.canon.constitution.withMutationGuard} guard-backed, ${artifact.canon.constitution.conflictsResolvableByPrecedence}/${artifact.canon.constitution.conflictCandidates} conflicts resolvable`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
export { main };
