import test from 'node:test';
import assert from 'node:assert/strict';
import { runUberBondSelfMaintenance } from '../src/uberbond-self-maintainer.mjs';

const BASE = 'a'.repeat(40);
const SANDBOX = '/tmp/uberbond-verification-monotonicity/repo';

function candidate(verification) {
  return {
    ok: true,
    changeSetId: 'change_monotonic_1',
    taskId: 'task_monotonic_1',
    baseRevision: BASE,
    summary: 'Harmless candidate for verification monotonicity.',
    verification,
    changes: [{
      operation: 'UPDATE',
      path: 'src/example.mjs',
      beforeSha256: 'b'.repeat(64),
      afterSha256: 'c'.repeat(64),
      content: 'export const value = 2;\n'
    }]
  };
}

function isolation() {
  return {
    status: 'VERIFIED_ISOLATED',
    sandboxRoot: SANDBOX,
    filesystemScope: 'EPHEMERAL_SANDBOX_ONLY',
    businessCredentialsMounted: false,
    hostHomeMounted: false,
    productionNetworkReachability: false,
    networkEgressMode: 'NONE',
    providerCredentialScope: 'NONE',
    evidenceRefs: ['audit:verification-monotonicity-isolation']
  };
}

async function execute({ acceptanceTests, candidateVerification }) {
  const changeSet = candidate(candidateVerification);
  let observedCommands = null;
  const result = await runUberBondSelfMaintenance({
    task: {
      taskId: changeSet.taskId,
      objective: 'Prove that required verification cannot be weakened by a candidate.',
      acceptanceTests
    },
    candidateChangeSet: changeSet,
    createSandbox: async () => ({ ok: true, sandboxRoot: SANDBOX, isolationReceipt: isolation() }),
    destroySandbox: async () => ({ ok: true, receiptRef: 'receipt:monotonicity-cleanup' }),
    applyChangeSet: async () => ({ ok: true, status: 'SANDBOX_APPLIED_VERIFICATION_REQUIRED' }),
    verifySandbox: async input => {
      observedCommands = [...input.commands];
      return {
        ok: true,
        status: 'PASS',
        verificationReceiptId: 'sandbox_verify_monotonicity',
        executed: input.commands.map(command => ({ command, status: 'PASS' }))
      };
    },
    collectChanges: async input => ({
      ok: true,
      status: 'CHANGE_SET_COLLECTED',
      changeSet: {
        ...structuredClone(changeSet),
        verification: [...input.verification]
      }
    })
  });
  return { result, observedCommands };
}

test('candidate verification can add checks but cannot replace trusted task acceptance tests', async () => {
  const required = ['npm run check', 'npm run test:deterministic'];
  const proposed = ['node --check src/example.mjs'];
  const { result, observedCommands } = await execute({ acceptanceTests: required, candidateVerification: proposed });

  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(observedCommands, [...required, ...proposed]);
  assert.deepEqual(result.verifiedReceipt.requiredAcceptanceTests, required);
  assert.deepEqual(result.verifiedReceipt.candidateVerificationCommands, proposed);
  assert.deepEqual(result.verifiedReceipt.verificationCommands, [...required, ...proposed]);
});

test('candidate duplicate checks cannot reorder or duplicate trusted acceptance tests', async () => {
  const required = ['npm run check', 'npm run test:deterministic'];
  const proposed = ['npm run check', 'node --check src/example.mjs', 'npm run test:deterministic'];
  const { result, observedCommands } = await execute({ acceptanceTests: required, candidateVerification: proposed });

  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(observedCommands, ['npm run check', 'npm run test:deterministic', 'node --check src/example.mjs']);
});

test('trusted acceptance tests still execute when the candidate proposes none', async () => {
  const required = ['npm run check', 'npm run test:deterministic'];
  const { result, observedCommands } = await execute({ acceptanceTests: required, candidateVerification: [] });

  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(observedCommands, required);
});
