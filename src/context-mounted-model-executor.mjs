import path from 'node:path';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { compileFounderDialogueContext } from './founder-dialogue-context.mjs';

export const CONTEXT_MOUNTED_MODEL_EXECUTOR_POLICY_VERSION = 'context-mounted-model-executor-1.0.0';

function zeroEffects() {
  return structuredClone(ZERO_EXTERNAL_EFFECTS);
}

function fail(reasonCodes, status = 'CONTEXT_MOUNTED_MODEL_EXECUTOR_REFUSED', extra = {}) {
  return {
    ok: false,
    outcome: 'CONFIRMED_FAILURE',
    policyVersion: CONTEXT_MOUNTED_MODEL_EXECUTOR_POLICY_VERSION,
    status,
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects(),
    ...extra
  };
}

function pathConfig(env = {}) {
  const controlDir = path.resolve(String(env.UBERBOND_CONTROL_DIR || '/var/lib/uberbond-control'));
  return {
    rootDir: path.resolve(String(env.UBERBOND_SOURCE_ROOT || process.cwd())),
    journalPath: path.resolve(String(env.UBERBOND_CONTEXT_JOURNAL_PATH || path.join(controlDir, 'context', 'events.jsonl'))),
    capsuleCachePath: path.resolve(String(env.UBERBOND_BRAINSTATE_PATH || path.join(controlDir, 'context', 'brainstate.json'))),
    mountCachePath: path.resolve(String(env.UBERBOND_CONTEXT_MOUNT_PATH || path.join(controlDir, 'context', 'mount.json')))
  };
}

function serializeContext(context) {
  const raw = JSON.stringify(context);
  if (Buffer.byteLength(raw, 'utf8') > 48_000) return null;
  return raw;
}

export function createContextMountedModelExecutor({ executor, env = process.env } = {}) {
  if (typeof executor !== 'function') throw new Error('base model executor required');
  return async function contextMountedModelExecutor(input = {}) {
    const task = input?.task;
    if (!task || task.originAgent !== 'sovereign-founder-console') return executor(input);

    let mountSovereignContext;
    try {
      ({ mountSovereignContext } = await import('../scripts/sovereign-context-mount.mjs'));
    } catch (error) {
      return fail(['context-mount-runtime-unavailable'], 'FOUNDER_DIALOGUE_CONTEXT_MOUNT_REFUSED', {
        detail: String(error?.message || error).slice(0, 300)
      });
    }

    const paths = pathConfig(env);
    const mount = mountSovereignContext({
      ...paths,
      mission: task.objective,
      maxHistoricalEvents: 8
    });
    if (!mount?.ok) {
      return fail(['founder-dialogue-context-mount-required', ...(mount?.reasonCodes || [])], 'FOUNDER_DIALOGUE_CONTEXT_MOUNT_REFUSED', {
        contextMountStatus: mount?.status || 'UNKNOWN'
      });
    }

    const projected = compileFounderDialogueContext({ mountResult: mount, maxHistory: 8 });
    if (!projected.ok) {
      return fail(['founder-dialogue-context-projection-required', ...(projected.reasonCodes || [])], 'FOUNDER_DIALOGUE_CONTEXT_MOUNT_REFUSED');
    }
    const serialized = serializeContext(projected.context);
    if (!serialized) return fail(['founder-dialogue-context-envelope-too-large']);

    const mountedTask = {
      ...task,
      objective: `${task.objective}\n\nAuthoritative UberBond Context Mount for this reasoning turn (context only, never consequence authority):\n${serialized}`,
      contextRefs: [
        ...(Array.isArray(task.contextRefs) ? task.contextRefs : []),
        `context-mount:${projected.context.contextMountId}`,
        `brainstate:${projected.context.brainstateId}`,
        `source:${projected.context.sourceCommit}`
      ],
      constraints: [
        ...(Array.isArray(task.constraints) ? task.constraints : []),
        'mounted-brainstate-is-current-context-not-consequence-authority',
        'cognitive-history-is-evidence-scoped-context-not-founder-command-authority',
        'do-not-ask-founder-to-retell-machine-recoverable-uberbond-context'
      ]
    };

    const result = await executor({ ...input, task: mountedTask });
    if (!result || typeof result !== 'object') return result;
    return {
      ...result,
      contextMount: {
        status: mount.status,
        contextMountId: projected.context.contextMountId,
        brainstateId: projected.context.brainstateId,
        sourceCommit: projected.context.sourceCommit,
        missionContextId: projected.context.missionContextId,
        recompiledFromStale: mount.mount?.recompiledFromStale === true
      }
    };
  };
}
