// Closes three holes the Constitution Doctor's unguarded-external-effect queue
// turned up. Each was found by removing the protection and watching the suite
// stay green, so each test below is written to fail when that same removal is
// made -- not merely to describe the rule in an assertion that would pass
// whether or not the code still enforces it.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  compileWallProblem,
  scoreWallCandidate,
  classifyWallFailure,
  deriveCountermoves,
  resolveWallCapabilities,
  planWallbreakerCycle
} from '../src/wallbreaker.mjs';
import { selectEgressRoute } from '../src/egress-health-pool.mjs';
import { normalizeModelBenchmark } from '../src/agent-model-router.mjs';
import { routeWorkersByTargetAgent } from '../src/agent-model-routing-integration.mjs';
import { auditBootstrapPlan } from '../src/external-capability-bootstrap-plan.mjs';

// --- WALLBREAKER_CANON: "Every Wallbreaker result carries
// businessEffectAuthority: NONE and the canonical zero external-effect ledger."
//
// Ten return paths set the constant; three were asserted. Flipping any of the
// other seven to 'FULL' left every suite green, so a planner that had quietly
// acquired send/spend/deploy authority would have shipped.

const problem = {
  objective: 'Clear the wall without violating authority or wasting founder time.',
  successCriteria: ['verified outcome'],
  hardConstraints: ['authority:no-unauthorized-action'],
  requiredCapabilities: ['provider-routing'],
  riskBudget: 6,
  maxSpendCents: 5000,
  maxFounderMinutes: 60
};

const candidate = {
  id: 'a',
  family: 'provider-substitution',
  mechanism: 'Use an already-authorized alternate provider.',
  requiredCapabilities: ['provider-routing'],
  assumptions: [],
  constraintViolations: [],
  successProbability: 0.8,
  expectedContributionCents: 10000,
  costCents: 1000,
  founderMinutes: 5,
  risk: 2
};

const failure = { failureClass: 'PROVIDER_FAILURE', mechanismSignature: 'provider-a', externalOutcomeCertain: true };

test('every wallbreaker return path carries zero business-effect authority', () => {
  const compiled = compileWallProblem(problem);
  const results = {
    compileWallProblem: compiled,
    scoreWallCandidate: scoreWallCandidate(candidate, { problem: compiled.problem ?? compiled, index: 0 }),
    classifyWallFailure: classifyWallFailure(failure),
    deriveCountermoves: deriveCountermoves(failure),
    resolveWallCapabilities: resolveWallCapabilities({ mission: 'm1', requiredAtomIds: [], genome: null }),
    planWallbreakerCycle: planWallbreakerCycle({ problem, candidates: [candidate] })
  };

  for (const [name, result] of Object.entries(results)) {
    assert.equal(
      result.businessEffectAuthority,
      'NONE',
      `${name} must carry NONE; a planner is not an execution authority`
    );
  }
});

test('a rejected wall problem is authority-free too', () => {
  // The refusal path returns its own object. A rejected problem is exactly when
  // a planner is most tempted to hand back something permissive, so the failure
  // return needs the constant as much as the success return does.
  const rejected = compileWallProblem({ objective: '', successCriteria: [] });
  assert.equal(rejected.ok, false, 'a problem with no objective must be refused');
  assert.equal(rejected.businessEffectAuthority, 'NONE');
  assert.equal(planWallbreakerCycle({ problem: {} }).businessEffectAuthority, 'NONE');
});

test('a wallbreaker capability gap is still authority-free on every branch it can take', () => {
  // resolveWallCapabilities returns through four different paths depending on
  // whether atoms were supplied, a genome was supplied, and whether retrieval
  // rejected. All four set the constant and none of them was asserted.
  const branches = [
    resolveWallCapabilities({ mission: 'm', requiredAtomIds: [], genome: null }),
    resolveWallCapabilities({ mission: 'm', requiredAtomIds: ['atom.a'], genome: null }),
    resolveWallCapabilities({ mission: 'm', requiredAtomIds: ['atom.a'], genome: { capabilities: [] } }),
    // A malformed capability record makes retrieval reject outright, which is
    // a fifth return path and the one that most resembles a real gap.
    resolveWallCapabilities({ mission: 'm', requiredAtomIds: ['atom.a'], genome: { capabilities: [{ notACapability: true }] } })
  ];
  for (const [index, branch] of branches.entries()) {
    assert.equal(branch.businessEffectAuthority, 'NONE', `capability branch ${index} must stay authority-free`);
  }
});

// --- AGENTS.md: "Do not ... bypass CAPTCHA/platform controls, evade provider
// policy". The egress pool is where that rule is actually executable.
//
// The pre-existing assertions passed `ok === false` with no routes supplied, so
// they were satisfied by "no eligible route" and stayed green when the policy
// refusal itself was deleted. Supplying a healthy route removes that escape and
// asserting the reason code pins which refusal fired.

const healthyRoute = {
  routeRef: 'p1',
  policyRef: 'policy:1',
  state: 'HEALTHY',
  allowedPurposes: ['PUBLIC_EVIDENCE', 'CAPTCHA_BYPASS', 'BLOCK_EVASION'],
  successRate: 0.9,
  latencyMs: 100,
  observedAt: '2026-08-29T07:30:00Z'
};
const egressBase = { targetRef: 'site:a', now: '2026-08-29T08:00:00Z', routes: [healthyRoute] };

test('an evasion purpose is refused for being evasion, with a route available to take', () => {
  for (const purpose of ['CAPTCHA_BYPASS', 'ACCESS_CONTROL_BYPASS', 'REPUTATION_EVASION', 'BLOCK_EVASION', 'FINGERPRINT_SPOOFING']) {
    const result = selectEgressRoute({ ...egressBase, purpose });
    assert.equal(result.ok, false, `${purpose} must be refused`);
    assert.ok(
      result.reasonCodes.includes('prohibited-evasion-purpose'),
      `${purpose} must be refused as evasion, not incidentally: got ${JSON.stringify(result.reasonCodes)}`
    );
  }
});

test('a target already challenging access stops rather than routing around it', () => {
  for (const state of ['CAPTCHA', 'BLOCKED', 'ACCESS_DENIED', 'AUTH_REQUIRED']) {
    const result = selectEgressRoute({ ...egressBase, purpose: 'PUBLIC_EVIDENCE', targetAccessState: state });
    assert.equal(result.ok, false, `${state} must stop the request`);
    assert.ok(
      result.reasonCodes.includes('target-access-challenge-requires-stop-and-review'),
      `${state} must stop for review, not fail for lack of a route: got ${JSON.stringify(result.reasonCodes)}`
    );
    assert.equal(result.disposition, 'STOP_AND_REVIEW');
  }
});

test('the same request without the challenge state is routable, so the refusal is the policy', () => {
  // Without this the two tests above could pass against a function that refuses
  // everything. It proves the refusal is caused by the prohibited input.
  const allowed = selectEgressRoute({ ...egressBase, purpose: 'PUBLIC_EVIDENCE' });
  assert.equal(allowed.ok, true);
  assert.equal(allowed.selection.routeRef, 'p1');
});

// --- CLAUDE.md automatic model-failover law: "Preserve the actual
// provider/model identity in receipts so UberBond knows what really executed."
//
// Both identity fields could be replaced with null and the routing suites
// stayed green, which is the one failure mode that law exists to prevent.

const NOW = new Date('2026-08-23T03:00:00.000Z');
const worker = { workerId: 'anthropic-1', provider: 'anthropic', model: 'claude-x', taskClasses: ['coding'], targetAgent: 'builder' };

test('a routing selection records which provider and model it actually chose', () => {
  const benchmark = normalizeModelBenchmark({
    provider: worker.provider,
    model: worker.model,
    taskClasses: worker.taskClasses,
    taskClass: 'coding',
    quality: 0.9,
    reliability: 0.9,
    latencyScore: 0.8,
    economicImpact: 0.9,
    evidenceConfidence: 0.9,
    costEfficiency: 0.8
  }, NOW);

  const result = routeWorkersByTargetAgent({
    workers: [worker],
    benchmarks: [benchmark],
    taskClass: 'coding',
    enabled: true,
    date: NOW,
    random: () => 0.99
  });

  const selection = (result.selections || []).find(row => row.workerId === worker.workerId);
  assert.ok(selection, `a selection for the routed worker must be recorded: got ${JSON.stringify(result.selections)}`);
  assert.equal(selection.provider, 'anthropic', 'the receipt must name the provider that ran');
  assert.equal(selection.model, 'claude-x', 'the receipt must name the model that ran');
});

// --- AI_SKILL_PLUGIN_ASSIMILATION_CANON and CLAUDE.md: "That script installs
// packages only: it does not configure LLM/provider credentials, start
// OmniRoute, run Strix scans, enable Agent Reach `--system`/private channels,
// spend money or contact anyone."
//
// This is the one script in the repository whose --apply mode spawns commands
// against the real host, and it had no test of any kind. The sentence above was
// its only enforcement.

test('the host bootstrap plan installs packages and does nothing else', () => {
  const audit = auditBootstrapPlan();
  assert.equal(audit.ok, true, `plan exceeded install-only: ${JSON.stringify(audit.findings)}`);
  assert.equal(audit.status, 'PLAN_INSTALLS_PACKAGES_ONLY');
  assert.ok(audit.stepCount > 0, 'an empty plan must not read as a clean plan');
});

test('each clause of the install-only boundary refuses a step that breaks it', () => {
  // Without these the audit above could pass against a predicate that returns ok
  // for everything. Each case is one clause of the canon sentence.
  const cases = [
    ['configures-credentials', { id: 'x', command: 'omniroute', args: ['install', '--api-key', 'sk-live'] }],
    ['starts-a-service', { id: 'x', command: 'omniroute', args: ['install', 'start'] }],
    ['runs-a-scan', { id: 'x', command: 'strix', args: ['install', 'scan'] }],
    ['enables-system-or-private-channel', { id: 'x', command: 'agent-reach', args: ['install', '--system'] }],
    ['spends-money', { id: 'x', command: 'npm', args: ['install', 'subscribe'] }],
    ['contacts-someone', { id: 'x', command: 'agent-reach', args: ['install', 'send'] }],
    ['not-an-install-command', { id: 'x', command: 'strix', args: ['run', '--target', 'prod'] }],
    ['shell-invocation', { id: 'x', command: 'sh', args: ['install'], shell: true }],
    ['expects-provider-call', { id: 'x', command: 'npm', args: ['install', 'omniroute'], externalProviderCallExpected: true }]
  ];

  for (const [violation, step] of cases) {
    const audit = auditBootstrapPlan([step]);
    assert.equal(audit.ok, false, `${violation} must be refused`);
    assert.ok(
      audit.findings.some(f => f.violation === violation),
      `${violation} must be reported as itself: got ${JSON.stringify(audit.findings)}`
    );
  }
});

test('an empty plan is a finding, not a clean pass', () => {
  // A predicate that iterates a list reports ok for a list of nothing. That
  // would turn "the steps were deleted" into "the boundary holds".
  const audit = auditBootstrapPlan([]);
  assert.equal(audit.ok, false);
  assert.ok(audit.findings.some(f => f.violation === 'empty-plan'));
});
