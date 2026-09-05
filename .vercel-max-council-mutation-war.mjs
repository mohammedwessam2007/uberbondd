#!/usr/bin/env node
// TEMP execution-only gate. Root placement is intentional: canon freshness treats
// src/scripts/config/migrations as source; this file must never become product source.
// Every verdict below requires: green baseline, one exact mutation, parseable mutant,
// and the named intended test failing for that mutation.
import { readFileSync, writeFileSync, cpSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const repoRoot = process.cwd();
const verificationEnv = {
  ...process.env,
  AI_PROVIDER: 'rules',
  AI_GATEWAY_AGENT_ENABLED: 'false',
  OUTBOUND_ENABLED: 'false',
  OUTBOUND_DRY_RUN: 'true',
  AUTO_EMAIL_REPORTS: 'false',
  DISCOVERY_ENABLED: 'false',
  DISCOVERY_DRY_RUN: 'true',
  ALLOW_TEST_PAYMENT_UNLOCK: 'false',
  UBERBOND_POSTGRES_MODE: 'off'
};
for (const key of [
  'AI_GATEWAY_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_API_KEY',
  'PAYPAL_SANDBOX_CLIENT_ID', 'PAYPAL_SANDBOX_CLIENT_SECRET', 'PAYPAL_SANDBOX_WEBHOOK_ID',
  'HUNTER_API_KEY', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'OUTREACH_APPROVAL_SECRET',
  'OUTREACH_WEBHOOK_SECRET', 'LEMONSQUEEZY_WEBHOOK_SECRET', 'FULL_AUDIT_CHECKOUT_URL',
  'STRATEGY_AUDIT_CHECKOUT_URL', 'MONITORING_CHECKOUT_URL', 'BOOKING_URL', 'DATABASE_URL',
  'OMNIA_V9_TEST_DATABASE_URL'
]) delete verificationEnv[key];

const MUTATIONS = Object.freeze([
  {
    id: 'MAX-01',
    guard: 'Cloned or serialized live callability receipts lose producer authority',
    file: 'src/frontier-callability-provenance.mjs',
    find: "  if (!simulationOnly && liveReceipts.get(receipt) !== actualDigest) return failure(['canonical-probe-producer-origin-required']);",
    replace: "  if (!simulationOnly && false) return failure(['canonical-probe-producer-origin-required']);",
    suites: ['tests/frontier-producer-origin.test.mjs'],
    testName: 'producer-authoritative live receipt loses authority after clone or JSON round-trip'
  },
  {
    id: 'MAX-02',
    guard: 'Non-degraded COUNCIL_MAX uses a distinct adjudicator',
    file: 'src/frontier-cognitive-fabric.mjs',
    find: '  let adjudicator = rankedCouncil.find(item => !responderIds.has(item.profile.id)) ?? null;',
    replace: '  let adjudicator = responders[0] ?? null;',
    suites: ['tests/frontier-cognitive-fabric.test.mjs'],
    testName: 'COUNCIL_MAX uses independent first-pass responders and a distinct adjudicator'
  },
  {
    id: 'MAX-03',
    guard: 'Cross-critique waits for every sealed first pass',
    file: 'src/frontier-cognitive-fabric.mjs',
    find: '    dependencies: [...independentIds],',
    replace: '    dependencies: [],',
    suites: ['tests/frontier-council-topology.test.mjs'],
    testName: 'COUNCIL_MAX graph is sealed first passes -> one responder critique each -> distinct adjudicator'
  },
  {
    id: 'MAX-04',
    guard: 'Council receipts require independent verifier evidence',
    file: 'src/frontier-cognitive-fabric.mjs',
    find: "    if (!verifierRefs.length) return failure(['independent-verifier-evidence-required'], 'FRONTIER_RECEIPT_BLOCKED');",
    replace: "    if (false && !verifierRefs.length) return failure(['independent-verifier-evidence-required'], 'FRONTIER_RECEIPT_BLOCKED');",
    suites: ['tests/frontier-cognitive-fabric.test.mjs'],
    testName: 'council receipt requires independent verifier evidence and rejects majority-only adjudication'
  },
  {
    id: 'MAX-05',
    guard: 'Majority-only adjudication is never proof',
    file: 'src/frontier-cognitive-fabric.mjs',
    find: "    if (!adjudicationBasis || adjudicationBasis === 'MAJORITY_ONLY') return failure(['majority-only-adjudication-prohibited'], 'FRONTIER_RECEIPT_BLOCKED');",
    replace: "    if (!adjudicationBasis) return failure(['majority-only-adjudication-prohibited'], 'FRONTIER_RECEIPT_BLOCKED');",
    suites: ['tests/frontier-cognitive-fabric.test.mjs'],
    testName: 'council receipt requires independent verifier evidence and rejects majority-only adjudication'
  },
  {
    id: 'MAX-06',
    guard: 'Council process success grants no semantic truth authority',
    file: 'src/frontier-cognitive-fabric.mjs',
    find: "    semanticClaimAuthority: 'NONE',",
    replace: "    semanticClaimAuthority: 'VERIFIED',",
    suites: ['tests/avengers-frontier-execution-guard.test.mjs'],
    testName: 'COUNCIL_MAX executes sealed first passes, responder cross-critiques and distinct adjudication under one shared budget'
  },
  {
    id: 'MAX-07',
    guard: 'A frontier member cannot exceed its reserved cost ceiling',
    file: 'src/frontier-reasoning-runtime.mjs',
    find: "  if (reportedCost > costLimit) return failure(['actual-cost-exceeds-frontier-reservation'], 'FRONTIER_EXECUTION_BUDGET_EXCEEDED', { costCeilingCents: costLimit, reportedCostCents: reportedCost });",
    replace: "  if (false && reportedCost > costLimit) return failure(['actual-cost-exceeds-frontier-reservation'], 'FRONTIER_EXECUTION_BUDGET_EXCEEDED', { costCeilingCents: costLimit, reportedCostCents: reportedCost });",
    suites: ['tests/frontier-producer-origin.test.mjs'],
    testName: 'executor cannot report a cost above its reserved member ceiling'
  },
  {
    id: 'MAX-08',
    guard: 'Shared council budget accounts for critique costs',
    file: 'src/frontier-council-runtime.mjs',
    find: '  spentCents += sumCost(critiqueRuns);',
    replace: '  spentCents += 0;',
    suites: ['tests/avengers-frontier-execution-guard.test.mjs'],
    testName: 'COUNCIL_MAX executes sealed first passes, responder cross-critiques and distinct adjudication under one shared budget'
  },
  {
    id: 'MAX-09',
    guard: 'Degraded council requires an explicit policy reference',
    file: 'src/frontier-cognitive-fabric.mjs',
    find: "  if (allowDegradedCouncil && !text(degradationPolicyRef, 1000)) return failure(['degradation-policy-ref-required'], 'FRONTIER_POLICY_INVALID');",
    replace: "  if (false && allowDegradedCouncil && !text(degradationPolicyRef, 1000)) return failure(['degradation-policy-ref-required'], 'FRONTIER_POLICY_INVALID');",
    suites: ['tests/frontier-cognitive-fabric.test.mjs'],
    testName: 'degraded council requires an explicit policy reference and reports degradation'
  },
  {
    id: 'MAX-10',
    guard: 'Synthetic frontier execution rejects injected network transport',
    file: 'src/avengers-execution-guard.mjs',
    find: '  if (syntheticExecution && fetchImpl !== nativeFetch) {',
    replace: '  if (false && syntheticExecution && fetchImpl !== nativeFetch) {',
    suites: ['tests/avengers-frontier-execution-guard.test.mjs'],
    testName: 'even a branded synthetic simulation factory cannot be paired with injected network transport'
  },
  {
    id: 'MAX-11',
    guard: 'Synthetic frontier execution requires the branded no-network simulation factory',
    file: 'src/avengers-execution-guard.mjs',
    find: '  if (syntheticExecution && !simulationFactory) {',
    replace: '  if (false && syntheticExecution && !simulationFactory) {',
    suites: ['tests/avengers-frontier-execution-guard.test.mjs'],
    testName: 'synthetic callability rejects an arbitrary executor factory before construction'
  },
  {
    id: 'MAX-12',
    guard: 'Canonical executor factory forwards the planned reasoning effort',
    file: 'src/agent-model-executor-factory.mjs',
    find: '  return raw || null;',
    replace: '  return null;',
    suites: ['tests/agent-model-executor-factory-reasoning.test.mjs'],
    testName: 'canonical executor factory forwards xhigh reasoning to AI Gateway'
  }
]);

function runSuites(cwd, suites) {
  const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...suites], {
    cwd,
    encoding: 'utf8',
    env: { ...verificationEnv, NODE_OPTIONS: '' },
    maxBuffer: 64 * 1024 * 1024
  });
  if (result.error) throw result.error;
  return { status: result.status ?? 1, output: `${result.stdout || ''}\n${result.stderr || ''}` };
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function namedTestFailed(output, testName) {
  const clean = String(output).replace(/\u001b\[[0-9;]*m/g, '');
  const escaped = escapeRegex(testName);
  return new RegExp(`(?:^|\\n)not ok \\d+ - ${escaped}(?:\\n|$)`, 'm').test(clean)
    || new RegExp(`(?:^|\\n)\\s*(?:✖|✗|×)\\s+${escaped}(?:\\s|\\(|$)`, 'm').test(clean);
}

function applyExactMutation(root, mutation) {
  const path = join(root, mutation.file);
  const source = readFileSync(path, 'utf8');
  const occurrences = source.split(mutation.find).length - 1;
  if (occurrences !== 1) throw new Error(`${mutation.id} exact anchor mismatch: expected 1, got ${occurrences}`);
  writeFileSync(path, source.replace(mutation.find, mutation.replace));
  const syntax = spawnSync(process.execPath, ['--check', path], { cwd: root, encoding: 'utf8' });
  if (syntax.status !== 0) throw new Error(`${mutation.id} mutant did not parse: ${syntax.stderr || syntax.stdout || ''}`);
}

console.log(`MAX_COUNCIL_MUTATION_WAR_BEGIN ${MUTATIONS.length}`);
const baselines = new Set();
for (const mutation of MUTATIONS) {
  const key = mutation.suites.join('\u0000');
  if (baselines.has(key)) continue;
  const baseline = runSuites(repoRoot, mutation.suites);
  if (baseline.status !== 0) {
    process.stdout.write(baseline.output);
    throw new Error(`MAX baseline red: ${mutation.suites.join(', ')}`);
  }
  baselines.add(key);
  console.log(`MAX_COUNCIL_BASELINE_PASS ${JSON.stringify({ suites: mutation.suites })}`);
}

const results = [];
for (const mutation of MUTATIONS) {
  const root = mkdtempSync(join(repoRoot, '.uberbond-max-mutant-'));
  try {
    for (const item of ['src', 'tests', 'scripts', 'config', 'api']) {
      try { cpSync(join(repoRoot, item), join(root, item), { recursive: true }); } catch { }
    }
    for (const file of ['package.json', 'package-lock.json', 'server.mjs', 'worker.mjs']) {
      try { cpSync(join(repoRoot, file), join(root, file)); } catch { }
    }
    applyExactMutation(root, mutation);
    const mutant = runSuites(root, mutation.suites);
    const intendedTestFailed = mutant.status !== 0 && namedTestFailed(mutant.output, mutation.testName);
    if (!intendedTestFailed) {
      process.stdout.write(mutant.output);
      throw new Error(`${mutation.id} not causally killed by named test: ${mutation.testName}`);
    }
    const verdict = {
      id: mutation.id,
      verdict: 'KILLED',
      guard: mutation.guard,
      file: mutation.file,
      testName: mutation.testName,
      causalBasis: 'BASELINE_GREEN_SINGLE_EXACT_MUTATION_NAMED_TEST_RED'
    };
    results.push(verdict);
    console.log(`MAX_COUNCIL_MUTATION_KILLED ${JSON.stringify(verdict)}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

console.log(`MAX_COUNCIL_MUTATION_WAR_PASS ${JSON.stringify({ mutations: results.length, killed: results.length, notKilled: 0, skipped: 0 })}`);
