#!/usr/bin/env node

import fs from 'node:fs/promises';
import {
  claimGithubRelayTask,
  readGithubRelayTask,
  submitGithubRelayResult
} from '../../../src/github-relay.mjs';
import { validResult, ZERO_EFFECTS } from '../../../src/cloud-agent-relay.mjs';
import { requestGithubActionsOidcToken } from '../../../src/github-actions-oidc-verifier.mjs';
import {
  buildLocalSourceContext,
  buildLocalSourceInventory
} from './self-maintainer-source-context.mjs';

export const SELF_MAINTAINER_PROPOSAL_DISPATCH_POLICY_VERSION = 'self-maintainer-proposal-dispatch-1.3.0';

const MAX_RESPONSE_BYTES = 350_000;
const EXACT_SHA = /^[a-f0-9]{40}$/i;
const DEFAULT_ENDPOINT = 'https://uberbondd.vercel.app/api/self-maintainer-proposal';

function zeroEffects() {
  return structuredClone(ZERO_EFFECTS);
}

function text(value, max = 1000) {
  return String(value ?? '').trim().slice(0, max);
}

function failure(reasonCodes, status = 'DISPATCH_BLOCKED', extra = {}) {
  return {
    ok: false,
    policyVersion: SELF_MAINTAINER_PROPOSAL_DISPATCH_POLICY_VERSION,
    status,
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects(),
    ...extra
  };
}

function parseRepository(value) {
  const match = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(text(value, 300));
  return match ? { owner: match[1], repo: match[2], fullName: `${match[1]}/${match[2]}` } : null;
}

function exactSha(value) {
  const sha = text(value, 80).toLowerCase();
  return EXACT_SHA.test(sha) ? sha : null;
}

function githubRestClient({ token, repository, fetchImpl = globalThis.fetch } = {}) {
  const headers = {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${token}`,
    'x-github-api-version': '2022-11-28',
    'user-agent': 'UberBond-Self-Maintainer-Proposal-Dispatch'
  };
  async function request(method, path, body) {
    const response = await fetchImpl(`https://api.github.com${path}`, {
      method,
      headers: { ...headers, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(30_000)
    });
    const raw = await response.text();
    if (Buffer.byteLength(raw, 'utf8') > MAX_RESPONSE_BYTES) throw new Error('github-response-too-large');
    const payload = raw ? JSON.parse(raw) : null;
    if (!response.ok) throw new Error(`github-http-${Number(response.status || 0) || 'unknown'}`);
    return payload;
  }
  const owner = repository.owner;
  const repo = repository.repo;
  return Object.freeze({
    createIssue: ({ title, body, labels }) => request('POST', `/repos/${owner}/${repo}/issues`, { title, body, labels }),
    listIssues: ({ state = 'open', labels = [], perPage = 50 }) => {
      const query = new URLSearchParams({ state: String(state).toLowerCase(), per_page: String(perPage) });
      if (labels.length) query.set('labels', labels.join(','));
      return request('GET', `/repos/${owner}/${repo}/issues?${query}`);
    },
    getIssue: ({ issueNumber }) => request('GET', `/repos/${owner}/${repo}/issues/${issueNumber}`),
    getComments: ({ issueNumber }) => request('GET', `/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=100`),
    addComment: ({ issueNumber, body }) => request('POST', `/repos/${owner}/${repo}/issues/${issueNumber}/comments`, { body }),
    addLabels: ({ issueNumber, labels }) => request('POST', `/repos/${owner}/${repo}/issues/${issueNumber}/labels`, { labels }),
    closeIssue: ({ issueNumber, stateReason }) => request('PATCH', `/repos/${owner}/${repo}/issues/${issueNumber}`, { state: 'closed', state_reason: stateReason })
  });
}

async function boundedJsonResponse(response) {
  const declared = Number(response?.headers?.get?.('content-length'));
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) throw new Error('proposal-response-too-large');
  const raw = await response.text();
  if (Buffer.byteLength(raw, 'utf8') > MAX_RESPONSE_BYTES) throw new Error('proposal-response-too-large');
  const payload = raw ? JSON.parse(raw) : null;
  if (!response.ok) {
    const error = new Error(`proposal-http-${Number(response.status || 0) || 'unknown'}`);
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function callProposalEndpoint({ endpointUrl, oidcToken, body, fetchImpl }) {
  const response = await fetchImpl(endpointUrl, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${oidcToken}`,
      'content-type': 'application/json',
      accept: 'application/json',
      'user-agent': 'UberBond-Self-Maintainer-Proposal-Dispatch'
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(70_000)
  });
  return boundedJsonResponse(response);
}

function relayCost(...usages) {
  let usdCents = 0;
  let tokens = 0;
  let sawCost = false;
  let sawTokens = false;
  for (const usage of usages) {
    const cost = Number(usage?.costCents);
    if (Number.isSafeInteger(cost) && cost >= 0) {
      usdCents += cost;
      sawCost = true;
    }
    const count = Number(usage?.totalTokens);
    if (Number.isSafeInteger(count) && count >= 0) {
      tokens += count;
      sawTokens = true;
    }
  }
  if (!sawCost) return null;
  return { usdCents, tokens: sawTokens ? tokens : null };
}

export async function runSelfMaintainerProposalDispatch({
  env = process.env,
  fetchImpl = globalThis.fetch,
  githubClient = null,
  oidcRequester = requestGithubActionsOidcToken,
  initialReceipt = null,
  date = new Date(),
  repoRoot = process.cwd(),
  buildInventory = buildLocalSourceInventory,
  buildSourceContext = buildLocalSourceContext
} = {}) {
  if (typeof fetchImpl !== 'function') return failure(['fetch-implementation-required']);
  const repository = parseRepository(env.GITHUB_REPOSITORY);
  const githubToken = String(env.GITHUB_TOKEN || '');
  const baseRevision = exactSha(env.GITHUB_SHA);
  const issueNumber = Number(initialReceipt?.issueNumber || env.UBERBOND_SELF_MAINTAINER_ISSUE_NUMBER || 0);
  const endpoint = text(env.UBERBOND_SELF_MAINTAINER_PROPOSAL_URL || DEFAULT_ENDPOINT, 2000);
  const reasons = [];
  if (String(env.GITHUB_ACTIONS || '').toLowerCase() !== 'true') reasons.push('github-actions-runtime-required');
  if (!repository) reasons.push('github-repository-required');
  if (!githubToken && !githubClient) reasons.push('github-token-required');
  if (!baseRevision) reasons.push('exact-main-base-revision-required');
  if (!Number.isSafeInteger(issueNumber) || issueNumber <= 0) reasons.push('self-maintainer-issue-number-required');
  if (typeof buildInventory !== 'function' || typeof buildSourceContext !== 'function') reasons.push('source-context-runtime-required');
  let endpointUrl = null;
  try {
    endpointUrl = new URL(endpoint);
    if (endpointUrl.protocol !== 'https:' || endpointUrl.hostname !== 'uberbondd.vercel.app' || endpointUrl.pathname !== '/api/self-maintainer-proposal') {
      reasons.push('canonical-self-maintainer-proposal-endpoint-required');
    }
  } catch {
    reasons.push('proposal-endpoint-invalid');
  }
  if (reasons.length) return failure(reasons);

  const client = githubClient || githubRestClient({ token: githubToken, repository, fetchImpl });
  const current = await readGithubRelayTask({ client, owner: repository.owner, repo: repository.repo, issueNumber });
  if (!current?.ok) return failure(current?.reasonCodes || ['relay-task-read-failed'], 'RELAY_BLOCKED');
  if (current.result != null) {
    const resultReasons = validResult(current.result);
    if (resultReasons.length) return failure(resultReasons.map(code => `existing-result-${code}`), 'RELAY_BLOCKED');
    return {
      ok: true,
      policyVersion: SELF_MAINTAINER_PROPOSAL_DISPATCH_POLICY_VERSION,
      status: 'RESULT_ALREADY_PRESENT',
      issueNumber,
      taskId: current.task?.taskId || null,
      baseRevision,
      businessEffectAuthority: 'NONE',
      externalEffectLedger: zeroEffects()
    };
  }
  if (!current.task || current.task.parentTask !== `main:${baseRevision}`) {
    return failure(['relay-task-base-revision-mismatch'], 'RELAY_BLOCKED');
  }

  const workerId = `self-maintainer-proposer:${text(env.GITHUB_RUN_ID || 'unknown', 80)}`;
  const claimed = await claimGithubRelayTask({
    client,
    owner: repository.owner,
    repo: repository.repo,
    issueNumber,
    workerId,
    now: date
  });
  if (!claimed?.ok) return failure(claimed?.reasonCodes || ['relay-task-claim-failed'], 'RELAY_BLOCKED');
  const task = claimed.task;
  if (!task || task.taskId !== current.task.taskId) return failure(['claimed-task-identity-mismatch'], 'RELAY_BLOCKED');

  const inventory = await buildInventory({ repoRoot, expectedSha: baseRevision });
  if (!inventory?.ok) return failure(['exact-source-inventory-failed', ...(inventory?.reasonCodes || [])], 'SOURCE_CONTEXT_BLOCKED');

  const oidc = await oidcRequester({ env, fetchImpl });
  if (!oidc?.ok || !oidc.token) return failure(oidc?.reasonCodes || ['github-actions-oidc-unavailable'], 'OIDC_BLOCKED');

  let selection;
  try {
    selection = await callProposalEndpoint({
      endpointUrl,
      oidcToken: oidc.token,
      fetchImpl,
      body: {
        stage: 'SELECT_CONTEXT',
        expectedSha: baseRevision,
        task,
        sourceInventory: inventory.paths
      }
    });
  } catch (error) {
    const providerReasons = Array.isArray(error?.payload?.reasonCodes) ? error.payload.reasonCodes : [];
    return failure(['context-selection-endpoint-call-failed', ...providerReasons], 'CONTEXT_SELECTION_BLOCKED');
  }
  if (!selection?.ok || !Array.isArray(selection?.contextPaths) || !selection.contextPaths.length) {
    return failure(selection?.reasonCodes || ['context-selection-required'], 'CONTEXT_SELECTION_BLOCKED');
  }

  const sourceContext = await buildSourceContext({
    repoRoot,
    expectedSha: baseRevision,
    inventory,
    selectedPaths: selection.contextPaths
  });
  if (!sourceContext?.ok) {
    return failure(['exact-source-context-build-failed', ...(sourceContext?.reasonCodes || [])], 'SOURCE_CONTEXT_BLOCKED');
  }

  let proposal;
  try {
    proposal = await callProposalEndpoint({
      endpointUrl,
      oidcToken: oidc.token,
      fetchImpl,
      body: {
        stage: 'PROPOSE',
        expectedSha: baseRevision,
        task,
        sourceInventory: inventory,
        sourceContext
      }
    });
  } catch (error) {
    const providerReasons = Array.isArray(error?.payload?.reasonCodes) ? error.payload.reasonCodes : [];
    return failure(['proposal-endpoint-call-failed', ...providerReasons], 'PROPOSAL_BLOCKED');
  }
  if (!proposal?.ok || !proposal?.result) return failure(proposal?.reasonCodes || ['proposal-result-required'], 'PROPOSAL_BLOCKED');
  const resultReasons = validResult(proposal.result);
  if (resultReasons.length) return failure(resultReasons.map(code => `proposal-${code}`), 'PROPOSAL_BLOCKED');

  const submitted = await submitGithubRelayResult({
    client,
    owner: repository.owner,
    repo: repository.repo,
    issueNumber,
    workerId,
    status: 'COMPLETED',
    result: proposal.result,
    taskId: task.taskId,
    sourceCommit: baseRevision,
    confidence: 'HIGH',
    commands: [],
    tests: [],
    artifacts: [],
    findings: [
      `Exact local source inventory ${inventory.inventoryDigest || 'unidentified'} and context ${sourceContext.sourceContextDigest || 'unidentified'} grounded canonical proposal compilation.`,
      'Canonical self-maintainer proposal compiled by UberBond; isolated verification remains pending.'
    ],
    limitations: ['Proposal stage did not execute tests or mutate source.'],
    cost: relayCost(selection.usage, proposal.usage),
    duration: null,
    now: date
  });
  if (!submitted?.ok) return failure(submitted?.reasonCodes || ['relay-result-submit-failed'], 'RELAY_BLOCKED');

  return {
    ok: true,
    policyVersion: SELF_MAINTAINER_PROPOSAL_DISPATCH_POLICY_VERSION,
    status: 'CANONICAL_SOURCE_GROUNDED_PROPOSAL_SUBMITTED',
    issueNumber,
    taskId: task.taskId,
    baseRevision,
    contextProvider: selection.proposalProvider || null,
    proposalProvider: proposal.proposalProvider || null,
    contextPaths: selection.contextPaths,
    sourceInventoryDigest: inventory.inventoryDigest || null,
    sourceContextDigest: sourceContext.sourceContextDigest || null,
    changeSetId: proposal.result?.codeChangeSet?.changeSetId || null,
    submitReceipt: {
      status: submitted.status || null,
      commentId: submitted.commentId || null
    },
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects()
  };
}

async function main() {
  let initial = null;
  const receiptPath = process.argv[2] || 'artifacts/cognitive/self-maintainer-initial.json';
  try {
    initial = JSON.parse(await fs.readFile(receiptPath, 'utf8'));
  } catch {
    process.stdout.write(`${JSON.stringify(failure(['initial-self-maintainer-receipt-required']), null, 2)}\n`);
    process.exitCode = 2;
    return;
  }
  const result = await runSelfMaintainerProposalDispatch({ initialReceipt: initial });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result?.ok) process.exitCode = 2;
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
