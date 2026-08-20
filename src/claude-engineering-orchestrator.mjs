import { validResult, ZERO_EFFECTS } from './cloud-agent-relay.mjs';
import { collectAgentGitSandboxChanges } from './agent-git-sandbox-collector.mjs';
import { runSandboxVerification } from './agent-sandbox-verifier.mjs';

export const CLAUDE_ENGINEERING_ORCHESTRATOR_POLICY_VERSION = 'claude-engineering-orchestrator-1.0.0';

function text(value, max = 1200) {
  return String(value ?? '').trim().slice(0, max);
}

function fail(reasonCodes, outcome = 'CONFIRMED_FAILURE', extra = {}) {
  return {
    ok: false,
    policyVersion: CLAUDE_ENGINEERING_ORCHESTRATOR_POLICY_VERSION,
    outcome,
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    businessEffectAuthority: 'NONE',
    ...extra
  };
}

function typedRef(prefix, value) {
  const id = text(value, 240).replace(/[^A-Za-z0-9._:-]/g, '_');
  return id ? `${prefix}:${id}` : null;
}

function sandboxPacket(value) {
  if (!value?.ok) return null;
  const sandboxRoot = text(value.sandboxRoot, 1000);
  const baseRevision = text(value.baseRevision, 160);
  if (!sandboxRoot || !baseRevision || !value.isolationReceipt) return null;
  return { ...value, sandboxRoot, baseRevision };
}

function actualTests(verification) {
  if (!verification?.executed || !Array.isArray(verification.executed)) return [];
  return verification.executed.map(item => ({
    command: text(item.command, 500),
    status: item.status === 'PASS' ? 'PASS' : 'FAIL',
    total: 1,
    passed: item.status === 'PASS' ? 1 : 0,
    failed: item.status === 'PASS' ? 0 : 1,
    skipped: 0,
    receiptRef: typedRef('receipt', item.receiptId)
  }));
}

function resultFor({
  task,
  collected,
  verification,
  artifactRef,
  cleanupOk,
  cleanupRef,
  modelResult
}) {
  const changedArtifacts = collected?.status === 'CHANGE_SET_COLLECTED'
    ? collected.changeSet.changes.map(change => change.path)
    : [];
  const changeRef = artifactRef || typedRef('receipt', collected?.changeSet?.changeSetId);
  const verificationRef = typedRef('receipt', verification?.verificationReceiptId);
  const evidenceRefs = [...new Set([
    changeRef,
    verificationRef,
    cleanupRef,
    ...(Array.isArray(modelResult?.result?.evidenceRefs) ? modelResult.result.evidenceRefs : [])
  ].filter(Boolean))];

  const noChanges = collected?.status === 'NO_CHANGES';
  const verificationPass = verification?.ok === true && verification?.status === 'PASS';
  const fullyVerified = !noChanges && verificationPass && cleanupOk;
  const needsRepair = !noChanges && !verificationPass && cleanupOk;
  const cleanupFailure = cleanupOk === false;

  let decision = 'REPAIR';
  let action = 'REPAIR_REQUIRED';
  let objective = 'Repair the sandbox implementation so every deterministic verification command passes.';
  let summary = 'Actual sandbox changes were collected, but deterministic verification did not pass.';

  if (fullyVerified) {
    decision = 'PROCEED';
    action = 'REVIEW_REQUIRED';
    objective = 'Review the verified Claude engineering change set against the originating task and economic thesis.';
    summary = 'Actual Git changes were collected from the sandbox and every requested deterministic verification command passed.';
  } else if (noChanges) {
    decision = 'REPAIR';
    action = 'REPAIR_REQUIRED';
    objective = 'Produce a material bounded implementation change or explicitly prove why no change is required.';
    summary = 'Claude Code completed without a material Git change; no implementation success is inferred.';
  } else if (cleanupFailure) {
    decision = 'STOP';
    action = 'OWNER_REVIEW_REQUIRED';
    objective = '';
    summary = 'Engineering evidence exists, but sandbox teardown was not verified. The sandbox must remain quarantined.';
  } else if (needsRepair) {
    decision = 'REPAIR';
  }

  const truthTable = [
    {
      claim: 'Actual filesystem changes were derived from Git state rather than the model self-report.',
      status: collected?.status === 'CHANGE_SET_COLLECTED' ? 'VERIFIED' : (noChanges ? 'VERIFIED' : 'UNRESOLVED'),
      evidenceRefs: changeRef ? [changeRef] : []
    },
    {
      claim: 'Requested deterministic verification passed in a credential-free, network-disabled verifier sandbox.',
      status: verificationPass ? 'VERIFIED' : 'UNRESOLVED',
      evidenceRefs: verificationRef ? [verificationRef] : []
    },
    {
      claim: 'Ephemeral engineering sandbox teardown completed.',
      status: cleanupOk ? 'VERIFIED' : 'UNRESOLVED',
      evidenceRefs: cleanupRef ? [cleanupRef] : []
    }
  ];

  const result = {
    outcome: summary,
    changedArtifacts,
    testsActuallyRun: actualTests(verification),
    truthTable,
    externalEffectLedger: { ...ZERO_EFFECTS },
    decision,
    coordination: {
      action,
      objective,
      summary,
      evidenceRefs,
      confidence: fullyVerified ? 0.96 : (noChanges ? 0.85 : 0.92)
    },
    evidenceRefs,
    engineeringEvidence: {
      changeSetId: collected?.changeSet?.changeSetId || null,
      changeSetRef: changeRef,
      changeCount: collected?.changeSet?.changes?.length || 0,
      verificationReceiptId: verification?.verificationReceiptId || null,
      verificationRef,
      cleanupRef: cleanupRef || null,
      claudeSessionRef: typedRef('provider', modelResult?.providerRequestId)
    }
  };

  // If no durable artifact store was injected, inline the already relay-bounded
  // change set so the reviewing GPT worker can inspect the actual patch.
  if (!artifactRef && collected?.changeSet) result.codeChangeSet = collected.changeSet;
  return result;
}

async function persistChangeSetIfConfigured(persistChangeSet, changeSet) {
  if (!changeSet || typeof persistChangeSet !== 'function') return { ok: true, artifactRef: null, receipt: null };
  try {
    const receipt = await persistChangeSet(changeSet);
    const ref = text(receipt?.artifactRef, 500);
    if (!receipt?.ok || !/^(artifact|receipt|doc):/i.test(ref)) {
      return { ok: false, reasonCodes: ['change-set-persistence-receipt-invalid'], receipt: receipt || null };
    }
    return { ok: true, artifactRef: ref, receipt };
  } catch (error) {
    return { ok: false, reasonCodes: ['change-set-persistence-threw'], detail: text(error?.message, 800) };
  }
}

export function createClaudeEngineeringExecutor({
  createSandbox,
  destroySandbox,
  enterVerificationMode,
  claudeExecutorFactory,
  collectChanges = collectAgentGitSandboxChanges,
  verifySandbox = runSandboxVerification,
  persistChangeSet = null,
  runGit,
  runVerificationCommand
} = {}) {
  return async function claudeEngineeringExecutor({ task, model, maxTokens, costCeilingCents, idempotencyKey } = {}) {
    if (!task?.taskId || !task?.objective) return fail(['valid-agent-task-required']);
    if (task.consequenceClass && task.consequenceClass !== 'LOCAL_PREPARATION') return fail(['engineering-executor-local-preparation-only']);
    if (typeof createSandbox !== 'function') return fail(['sandbox-factory-required']);
    if (typeof destroySandbox !== 'function') return fail(['sandbox-destroyer-required']);
    if (typeof enterVerificationMode !== 'function') return fail(['verification-mode-switch-required']);
    if (typeof claudeExecutorFactory !== 'function') return fail(['claude-executor-factory-required']);
    if (typeof collectChanges !== 'function') return fail(['change-collector-required']);
    if (typeof verifySandbox !== 'function') return fail(['sandbox-verifier-required']);

    let sandbox = null;
    let modelResult = null;
    let collected = null;
    let verification = null;
    let artifact = { ok: true, artifactRef: null };
    let cleanup = { ok: false, receiptRef: null, reasonCodes: ['cleanup-not-attempted'] };

    try {
      let created;
      try {
        created = await createSandbox({ task, idempotencyKey });
      } catch (error) {
        return fail(['sandbox-creation-threw'], 'CONFIRMED_FAILURE', { detail: text(error?.message, 800) });
      }
      sandbox = sandboxPacket(created);
      if (!sandbox) return fail(['verified-sandbox-packet-required']);

      let claudeExecutor;
      try {
        claudeExecutor = await claudeExecutorFactory({
          sandboxRoot: sandbox.sandboxRoot,
          isolationReceipt: sandbox.isolationReceipt,
          task,
          idempotencyKey
        });
      } catch (error) {
        return fail(['claude-executor-factory-threw'], 'CONFIRMED_FAILURE', { detail: text(error?.message, 800) });
      }
      if (typeof claudeExecutor !== 'function') return fail(['claude-executor-function-required']);

      modelResult = await claudeExecutor({ task, model, maxTokens, costCeilingCents });
      if (!modelResult?.ok) {
        // Preserve Claude/provider uncertainty semantics. The worker runtime will
        // hold the compute reservation if the provider outcome is not proven.
        return {
          ...modelResult,
          policyVersion: CLAUDE_ENGINEERING_ORCHESTRATOR_POLICY_VERSION,
          businessEffectAuthority: 'NONE'
        };
      }

      collected = await collectChanges({
        sandboxRoot: sandbox.sandboxRoot,
        taskId: task.taskId,
        baseRevision: sandbox.baseRevision,
        verification: Array.isArray(task.acceptanceTests) && task.acceptanceTests.length
          ? task.acceptanceTests
          : ['npm run check'],
        summary: `Bounded engineering changes for ${task.taskId}`,
        ...(runGit ? { runGit } : {})
      });
      if (!collected?.ok) {
        return {
          ok: true,
          outcome: modelResult.outcome || 'COMPLETED',
          providerRequestId: modelResult.providerRequestId || null,
          model: modelResult.model || model || null,
          usage: modelResult.usage,
          result: {
            outcome: 'Claude Code completed, but actual Git state could not be converted into a trustworthy change set.',
            changedArtifacts: [],
            testsActuallyRun: [],
            truthTable: [{ claim: 'Actual Git change collection succeeded.', status: 'UNRESOLVED', evidenceRefs: [] }],
            externalEffectLedger: { ...ZERO_EFFECTS },
            decision: 'STOP',
            coordination: {
              action: 'OWNER_REVIEW_REQUIRED',
              objective: '',
              summary: `Change collection blocked: ${(collected.reasonCodes || []).join(', ')}`,
              evidenceRefs: [],
              confidence: 0.98
            },
            evidenceRefs: []
          },
          businessEffectAuthority: 'NONE'
        };
      }

      if (collected.status === 'CHANGE_SET_COLLECTED') {
        artifact = await persistChangeSetIfConfigured(persistChangeSet, collected.changeSet);
        if (!artifact.ok) {
          return {
            ok: true,
            outcome: modelResult.outcome || 'COMPLETED',
            providerRequestId: modelResult.providerRequestId || null,
            model: modelResult.model || model || null,
            usage: modelResult.usage,
            result: {
              outcome: 'Claude Code produced a bounded change set, but durable artifact persistence failed.',
              changedArtifacts: collected.changeSet.changes.map(change => change.path),
              testsActuallyRun: [],
              truthTable: [{ claim: 'Change set durability was established.', status: 'UNRESOLVED', evidenceRefs: [] }],
              externalEffectLedger: { ...ZERO_EFFECTS },
              decision: 'STOP',
              coordination: {
                action: 'OWNER_REVIEW_REQUIRED',
                objective: '',
                summary: `Artifact persistence blocked: ${(artifact.reasonCodes || []).join(', ')}`,
                evidenceRefs: [],
                confidence: 0.98
              },
              evidenceRefs: []
            },
            businessEffectAuthority: 'NONE'
          };
        }
      }

      let verifierReceipt;
      try {
        verifierReceipt = await enterVerificationMode({ sandbox, task, changeSet: collected.changeSet || null });
      } catch (error) {
        verifierReceipt = { ok: false, reasonCodes: ['verification-mode-switch-threw'], detail: text(error?.message, 800) };
      }
      if (!verifierReceipt?.ok || !verifierReceipt.isolationReceipt) {
        verification = {
          ok: false,
          status: 'FAIL',
          verificationReceiptId: null,
          executed: [],
          reasonCodes: ['verified-network-disabled-verifier-mode-required', ...(verifierReceipt?.reasonCodes || [])]
        };
      } else {
        verification = await verifySandbox({
          sandboxRoot: sandbox.sandboxRoot,
          isolationReceipt: verifierReceipt.isolationReceipt,
          commands: collected?.changeSet?.verification || task.acceptanceTests || ['npm run check'],
          ...(runVerificationCommand ? { runCommand: runVerificationCommand } : {})
        });
      }
    } catch (error) {
      // If the Claude provider already returned successfully, compute occurred
      // and is measurable. Convert later orchestration failures into a valid
      // review result rather than falsely claiming provider uncertainty.
      if (modelResult?.ok && modelResult?.usage) {
        const result = {
          outcome: 'Claude compute completed, but the deterministic engineering evidence pipeline encountered an internal failure.',
          changedArtifacts: collected?.changeSet?.changes?.map(change => change.path) || [],
          testsActuallyRun: actualTests(verification),
          truthTable: [{ claim: 'Engineering evidence pipeline completed.', status: 'UNRESOLVED', evidenceRefs: [] }],
          externalEffectLedger: { ...ZERO_EFFECTS },
          decision: 'STOP',
          coordination: {
            action: 'OWNER_REVIEW_REQUIRED',
            objective: '',
            summary: text(error?.message, 800) || 'Internal engineering orchestration failure.',
            evidenceRefs: [],
            confidence: 0.98
          },
          evidenceRefs: []
        };
        return {
          ok: true,
          outcome: modelResult.outcome || 'COMPLETED',
          providerRequestId: modelResult.providerRequestId || null,
          model: modelResult.model || model || null,
          usage: modelResult.usage,
          result,
          businessEffectAuthority: 'NONE'
        };
      }
      return fail(['engineering-orchestration-threw'], 'CONFIRMED_FAILURE', { detail: text(error?.message, 800) });
    } finally {
      if (sandbox) {
        try {
          const receipt = await destroySandbox({ sandbox, task, idempotencyKey });
          const receiptRef = text(receipt?.receiptRef, 500);
          cleanup = {
            ok: receipt?.ok === true && /^(receipt|audit):/i.test(receiptRef),
            receiptRef: /^(receipt|audit):/i.test(receiptRef) ? receiptRef : null,
            reasonCodes: receipt?.ok === true ? [] : (receipt?.reasonCodes || ['sandbox-destroy-failed'])
          };
        } catch (error) {
          cleanup = { ok: false, receiptRef: null, reasonCodes: ['sandbox-destroy-threw', text(error?.message, 500)] };
        }
      }
    }

    if (!modelResult?.ok || !modelResult?.usage) return fail(['completed-model-result-required']);
    const result = resultFor({
      task,
      collected,
      verification,
      artifactRef: artifact.artifactRef || null,
      cleanupOk: cleanup.ok,
      cleanupRef: cleanup.receiptRef,
      modelResult
    });
    const invalid = validResult(result);
    if (invalid.length) {
      // Provider usage is known, so this is a deterministic local result-format
      // failure, not uncertain compute. Return a minimal canonical stop result.
      const fallback = {
        outcome: 'Engineering work completed but the evidence packet exceeded the canonical relay contract.',
        changedArtifacts: collected?.changeSet?.changes?.map(change => change.path) || [],
        testsActuallyRun: actualTests(verification),
        truthTable: [{ claim: 'Canonical relay result validated.', status: 'UNRESOLVED', evidenceRefs: [] }],
        externalEffectLedger: { ...ZERO_EFFECTS },
        decision: 'STOP',
        coordination: {
          action: 'OWNER_REVIEW_REQUIRED',
          objective: '',
          summary: `Canonical result blocked: ${invalid.join(', ')}`,
          evidenceRefs: [],
          confidence: 0.99
        },
        evidenceRefs: []
      };
      return {
        ok: true,
        outcome: modelResult.outcome || 'COMPLETED',
        providerRequestId: modelResult.providerRequestId || null,
        model: modelResult.model || model || null,
        usage: modelResult.usage,
        result: fallback,
        businessEffectAuthority: 'NONE'
      };
    }

    return {
      ok: true,
      policyVersion: CLAUDE_ENGINEERING_ORCHESTRATOR_POLICY_VERSION,
      outcome: 'COMPLETED',
      providerRequestId: modelResult.providerRequestId || null,
      providerStatus: modelResult.providerStatus || 'success',
      model: modelResult.model || model || null,
      usage: modelResult.usage,
      result,
      businessEffectAuthority: 'NONE'
    };
  };
}
