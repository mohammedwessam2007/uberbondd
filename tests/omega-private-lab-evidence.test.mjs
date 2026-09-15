import test from 'node:test';
import assert from 'node:assert/strict';
import { compileControlledLanguage, solveProblem, verifyAssignment } from '../src/omega-private-lab-core.mjs';
import { commitHoldout, verifyHoldoutReveal, renameProblem } from '../src/omega-private-lab-protocol.mjs';
import { trainPolicyMetaCrystal, evaluateMetaTransfer, selectPolicyFromMetaCrystal, extractStructuralFeatures } from '../src/omega-policy-meta-learner.mjs';
import { generateTrainingSuite, generateSuite } from '../src/omega-private-benchmark-generators.mjs';

const zero = receipt => {
  assert.equal(receipt.businessEffectAuthority, 'NONE');
  assert.equal(receipt.externalEffectAuthority, 'NONE');
  assert.equal(receipt.externalEffectLedger.providerCalls, 0);
  assert.equal(receipt.externalEffectLedger.productionMutations, 0);
  assert.equal(receipt.externalEffectLedger.spendCents, 0);
};

test('controlled language compiles to a verified bounded Law IR problem', () => {
  const compiled = compileControlledLanguage({
    id: 'nl-canary',
    domain: 'CONTROLLED_SEMANTICS',
    text: 'variables a,b,c use values 1,2,3. all of a,b,c are different. given a = 1'
  });
  assert.equal(compiled.ok, true);
  assert.equal(compiled.semanticScope, 'CONTROLLED_EXPLICIT_GRAMMAR');
  const solved = solveProblem({ problem: compiled.problem, policy: 'INPUT_ORDER' });
  assert.equal(solved.ok, true);
  assert.equal(verifyAssignment({ problem: compiled.problem, assignment: solved.solution }).valid, true);
  zero(compiled);
});

test('holdout commitments bind exact hidden task payloads and salt', () => {
  const tasks = generateSuite(777, { perFamily: 2, domainPrefix: 'TEST' });
  const salt = '0123456789abcdef-test-salt';
  const commitment = commitHoldout({ tasks, salt });
  assert.equal(commitment.ok, true);
  assert.equal(verifyHoldoutReveal({ commitment: commitment.commitment, tasks, salt }).valid, true);
  const wrong = verifyHoldoutReveal({ commitment: commitment.commitment, tasks, salt: 'wrong-wrong-wrong-wrong' });
  assert.equal(wrong.valid, false);
});

test('meta learner selects from structural features without target portfolio runs', () => {
  const trained = trainPolicyMetaCrystal({ sourceTasks: generateTrainingSuite(), policyBudget: 5000 });
  assert.equal(trained.ok, true);
  assert.equal(trained.crystal.containsAnswers, false);
  assert.equal(trained.crystal.containsTargetTasks, false);
  const target = generateSuite(999, { perFamily: 1, domainPrefix: 'UNSEEN' })[0];
  const selected = selectPolicyFromMetaCrystal({ crystal: trained.crystal, targetTask: target });
  assert.equal(selected.ok, true);
  assert.equal(selected.adapter.answerFree, true);
  assert.equal(selected.adapter.usesTargetPortfolioRuns, false);
  zero(selected);
});

test('structural features are invariant to identifier renaming', () => {
  const problem = generateSuite(333, { perFamily: 1, domainPrefix: 'NAME_TEST' })[2];
  const renamed = renameProblem(problem, 'opaque_');
  assert.deepEqual(extractStructuralFeatures(problem), extractStructuralFeatures(renamed));
});

test('frozen meta learner lowers total verified work on a deterministic unseen multi-algebra suite', () => {
  const trained = trainPolicyMetaCrystal({ sourceTasks: generateTrainingSuite(), policyBudget: 5000 });
  assert.equal(trained.ok, true);
  const evaluated = evaluateMetaTransfer({ crystal: trained.crystal, targetTasks: generateSuite(888, { perFamily: 3, domainPrefix: 'UNSEEN' }) });
  assert.equal(evaluated.ok, true);
  assert.equal(evaluated.receipt.novelDomains.length, 4);
  assert.ok(evaluated.receipt.transferWork < evaluated.receipt.coldWork);
  assert.ok(evaluated.receipt.reductionFraction > 0.9);
  assert.ok(evaluated.receipt.improvedTasks > evaluated.receipt.worsenedTasks);
  assert.match(evaluated.truthBoundary, /not unrestricted cross-domain reasoning/i);
});
