import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRevenueCandidate, runRevenueDecisionDesk } from '../src/revenue-decision-desk.mjs';
import { buildAgentAcquisitionSurface, createDelegatedAgentIdentity, executeAgentCommand } from '../src/agent-native-commerce.mjs';

test('revenue desk vetoes upside without authority', () => {
  const decision = evaluateRevenueCandidate({ id:'x', evidenceRefs:['e'], expectedClearedContribution:1000000, probability:1, downside:0, founderMinutes:1, authority:false, stopConditions:['stop'] });
  assert.equal(decision.verdict, 'RED_LIGHT');
  assert.ok(decision.reasons.includes('missing-authority'));
});

test('archive rejection cannot silently re-enter without newer evidence', () => {
  const decision = evaluateRevenueCandidate({ id:'x', fingerprint:'f', evidenceRevision:1, evidenceRefs:['e'], expectedClearedContribution:100, probability:1, downside:1, founderMinutes:1, authority:true, stopConditions:['stop'] }, { archive:[{ fingerprint:'f', status:'REJECTED', evidenceRevision:1 }] });
  assert.equal(decision.verdict, 'RED_LIGHT');
  assert.ok(decision.reasons.includes('archive-rejection-not-superseded'));
});

test('desk ranks by risk-adjusted contribution per founder minute', () => {
  const common = { evidenceRefs:['e'], probability:1, downside:0, authority:true, stopConditions:['stop'], reversibility:1, evidenceQuality:1 };
  const result = runRevenueDecisionDesk([{ ...common, id:'slow', expectedClearedContribution:1000, founderMinutes:100 }, { ...common, id:'fast', expectedClearedContribution:300, founderMinutes:10 }], { maxActions:1 });
  assert.deepEqual(result.selected, ['fast']);
  assert.equal(result.baseline, 'DO_NOTHING');
});

test('agent surface is machine-readable and stable', () => {
  const product = { productId:'uberbond', displayName:'UberBond', commands:[{ name:'quote', scopes:['quote:read'], inputSchema:{ type:'object' } }] };
  const a = buildAgentAcquisitionSurface(product);
  const b = buildAgentAcquisitionSurface(product);
  assert.equal(a.discover.output, 'application/json');
  assert.equal(a.discover.revisionHash, b.discover.revisionHash);
});

test('delegation can only attenuate scope', () => {
  const parent = createDelegatedAgentIdentity({ principalId:'p', agentId:'a', scopes:['quote:read','task:write'], spendCap:100, expiresAt:'2099-01-01T00:00:00Z' }).data;
  const widened = createDelegatedAgentIdentity({ principalId:'p', agentId:'b', scopes:['admin'], spendCap:100, expiresAt:'2099-01-01T00:00:00Z', parent });
  assert.equal(widened.ok, false);
  assert.equal(widened.status, 'DELEGATION_WIDENS_SCOPE');
});

test('destructive agent commands require dry-run', () => {
  const product = { productId:'uberbond', commands:[{ name:'provision', destructive:true, scopes:['task:write'], inputSchema:{} }] };
  const identity = createDelegatedAgentIdentity({ principalId:'p', agentId:'a', scopes:['task:write'], spendCap:0, expiresAt:'2099-01-01T00:00:00Z' }).data;
  const needsDryRun = executeAgentCommand({ product, identity, commandName:'provision', input:{} });
  assert.equal(needsDryRun.status, 'DRY_RUN_REQUIRED');
  const dry = executeAgentCommand({ product, identity, commandName:'provision', input:{}, dryRun:true });
  assert.equal(dry.status, 'DRY_RUN_OK');
});
