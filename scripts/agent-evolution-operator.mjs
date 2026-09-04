#!/usr/bin/env node
// Operator surface for UberBond's already-existing bounded self-improvement wave.
//
// This file deliberately creates no new autonomy engine. It composes the
// canonical self-upgrade proposal, agent-evolution wave and existing relay
// transports. Default mode is a zero-I/O doctor. `--execute` may perform
// exactly the one bounded LOCAL_PREPARATION relay cycle already enforced by
// runBoundedAgentEvolutionWave; it never grants promotion authority.

import { compileUpgradeProposal } from '../src/self-upgrade.mjs';
import {
  compileAgentEvolutionMission,
  runBoundedAgentEvolutionWave
} from '../src/agent-evolution-wave.mjs';
import {
  createRelayAdapterFactory,
  describeRelayReadiness
} from '../src/agent-relay-adapter-factory.mjs';
import {
  createGithubIssuesRelayClient,
  describeGithubIssuesRelayReadiness
} from '../src/github-issues-relay-client.mjs';

export const AGENT_EVOLUTION_OPERATOR_POLICY_VERSION = 'agent-evolution-operator-1.1.0';

const ZERO = Object.freeze({
  providerCalls: 0,
  messages: 0,
  purchases: 0,
  deployments: 0,
  credentialChanges: 0,
  dnsChanges: 0,
  productionMutations: 0,
  spendCents: 0
});

function timestamp(value) {
  const candidate = value instanceof Date ? value : new Date(value ?? Date.now());
  return Number.isNaN(candidate.getTime()) ? new Date().toISOString() : candidate.toISOString();
}

function buildProposal(date) {
  return compileUpgradeProposal({
    problem: 'Prove the bounded UberBond self-improvement relay and independent-review path without production or business effects.',
    evidenceRefs: [
      'capability:agent-evolution-wave',
      'capability:github-issues-relay-client',
      'capability:agent-relay-adapter-factory',
      'doc:LIVE_BRIDGE_HANDOFF'
    ],
    expectedEconomicEffect: { expectedOwnerMinutesSaved: 15, confidence: 0.5 },
    buildCost: { engineeringMinutes: 0, computeCents: 0 },
    risk: { level: 'LOW', categories: ['local-preparation', 'zero-business-effect'] },
    affectedCapabilities: ['self-upgrade', 'agent-relay', 'independent-review'],
    acceptanceCriteria: ['npm run check:syntax passes'],
    rollbackPlan: 'No production change is authorized; discard the bounded task/result if any gate refuses it.',
    date
  });
}

export function compileAgentEvolutionOperatorBundle({ date = new Date() } = {}) {
  const at = timestamp(date);
  const proposal = buildProposal(at);
  if (!proposal?.ok) {
    return {
      ok: false,
      policyVersion: AGENT_EVOLUTION_OPERATOR_POLICY_VERSION,
      status: 'PROPOSAL_INVALID',
      reasonCodes: proposal?.reasonCodes || ['upgrade-proposal-invalid'],
      externalEffectLedger: { ...ZERO }
    };
  }
  return compileAgentEvolutionMission({
    proposal,
    repositoryScope: ['src/', 'tests/', 'scripts/', 'docs/'],
    requiredTests: ['npm run check:syntax'],
    acceptanceGate: ['zero test failures', 'zero external business effects'],
    budget: { maxTokens: 50_000, maxCostCents: 0 },
    date: at
  });
}

function selectRelayTransport(githubIssues, httpIngress) {
  if (githubIssues.ready) return 'GITHUB_ISSUES';
  if (httpIngress.ready) return 'HTTP_INGRESS';
  return null;
}

export function describeAgentEvolutionOperator({ env = process.env, date = new Date() } = {}) {
  const githubIssues = describeGithubIssuesRelayReadiness({ env });
  const httpIngress = describeRelayReadiness({ env });
  const selectedTransport = selectRelayTransport(githubIssues, httpIngress);
  const bundle = compileAgentEvolutionOperatorBundle({ date });
  const sandboxIsolationAttestationPresent = Boolean(String(env.CLAUDE_CODE_SANDBOX_ISOLATION_FILE || '').trim());
  const transportBlockers = selectedTransport ? [] : [
    ...githubIssues.blockers,
    ...httpIngress.blockers.map(code => `http-ingress:${code}`)
  ];
  const reasonCodes = [
    ...(bundle?.ok ? [] : (bundle?.reasonCodes || ['operator-bundle-invalid'])),
    ...transportBlockers
  ];
  return {
    ok: bundle?.ok === true,
    policyVersion: AGENT_EVOLUTION_OPERATOR_POLICY_VERSION,
    status: bundle?.ok !== true
      ? 'OPERATOR_INVALID'
      : selectedTransport ? 'READY_FOR_BOUNDED_RELAY' : 'BLOCKED_EXTERNAL_RELAY_CONFIG',
    reasonCodes: [...new Set(reasonCodes)],
    relay: {
      ready: Boolean(selectedTransport),
      selectedTransport,
      githubIssues: {
        ready: githubIssues.ready,
        repositoryPresent: githubIssues.repositoryPresent,
        credentialPresent: githubIssues.credentialPresent,
        blockers: githubIssues.blockers
      },
      httpIngress: {
        ready: httpIngress.ready,
        endpointPresent: httpIngress.endpointPresent,
        credentialPresent: httpIngress.credentialPresent,
        blockers: httpIngress.blockers
      }
    },
    sandbox: {
      isolationAttestationPresent: sandboxIsolationAttestationPresent,
      note: sandboxIsolationAttestationPresent
        ? 'An attestation path is configured; its content must still be validated by the canonical sandbox provisioner before code execution.'
        : 'Autonomous code application remains blocked until the external sandbox isolation attestation exists.'
    },
    wave: bundle?.ok ? {
      waveId: bundle.waveId,
      proposalId: bundle.proposal?.proposalId || null,
      missionId: bundle.mission?.missionId || null,
      taskId: bundle.task?.taskId || null,
      authority: bundle.authority,
      promotion: bundle.promotion
    } : null,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO }
  };
}

export async function executeAgentEvolutionOperator({
  env = process.env,
  fetchImpl = globalThis.fetch,
  relayClient = null,
  date = new Date(),
  poll = { maxPolls: 3, pollIntervalMs: 1000 }
} = {}) {
  const doctor = describeAgentEvolutionOperator({ env, date });
  if (!doctor.ok) return doctor;

  let client = relayClient;
  let transportUsed = relayClient ? 'INJECTED_TEST_OR_OPERATOR_CLIENT' : doctor.relay.selectedTransport;
  if (!client) {
    if (!doctor.relay.ready) return doctor;
    try {
      if (doctor.relay.selectedTransport === 'GITHUB_ISSUES') {
        client = createGithubIssuesRelayClient({ env, fetchImpl });
      } else {
        const factory = createRelayAdapterFactory({
          env,
          fetchImpl,
          defaultOriginAgent: 'chatgpt',
          defaultTargetAgent: 'claude-code'
        });
        client = factory({ originAgent: 'chatgpt', targetAgent: 'claude-code' });
      }
    } catch {
      return {
        ...doctor,
        status: 'BLOCKED_EXTERNAL_RELAY_CONFIG',
        reasonCodes: [...new Set([...doctor.reasonCodes, 'relay-adapter-not-configured'])],
        errorClass: doctor.relay.selectedTransport === 'GITHUB_ISSUES'
          ? 'GITHUB_ISSUES_RELAY_CONFIG'
          : 'HTTP_RELAY_CONFIG'
      };
    }
  }

  const bundle = compileAgentEvolutionOperatorBundle({ date });
  const result = await runBoundedAgentEvolutionWave({
    proposal: bundle.proposal,
    mission: {
      repositoryScope: bundle.mission.repositoryScope,
      requiredTests: bundle.mission.requiredTests,
      acceptanceGate: bundle.mission.acceptanceGate,
      rollbackPlan: bundle.mission.rollbackPlan,
      budget: bundle.task.budget
    },
    relayClient: client,
    poll,
    date
  });

  return {
    ...result,
    operatorPolicyVersion: AGENT_EVOLUTION_OPERATOR_POLICY_VERSION,
    transportUsed,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO },
    completionBoundary: result?.status === 'SHADOW_READY'
      ? 'BOUNDED_REVIEW_COMPLETE__PROMOTION_STILL_BLOCKED'
      : 'BOUNDED_WAVE_NOT_SHADOW_READY'
  };
}

async function main() {
  const execute = process.argv.includes('--execute');
  const result = execute
    ? await executeAgentEvolutionOperator()
    : describeAgentEvolutionOperator();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result?.ok) process.exitCode = 2;
  else if (execute && result.status !== 'SHADOW_READY') process.exitCode = 3;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
