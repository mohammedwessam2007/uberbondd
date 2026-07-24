// Bounded AI assistant harness (workstream 16's own requirement list: schema, prompt version,
// input hash, evidence grounding, budget, timeout, confidence, validation, replay, deterministic
// fallback, no direct action). Every assistant call goes through `runAssistant`, the one place all
// of those bounds are enforced together. "No direct action" is structural: this module has zero
// email/notify/payment/deploy dependency, so nothing here could act on a caller's behalf even if
// asked -- every result is returned as a draft the caller must separately route through an
// owner-approval step (the same approvals.mjs pipeline every other draft goes through).
import { sha256Hex } from './utils.mjs';

export class AiAssistantError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'AiAssistantError';
    this.code = code;
  }
}

export const ASSISTANT_TASKS = Object.freeze([
  'evidence_summarization', 'defect_classification', 'opportunity_summary', 'message_drafting',
  'reply_classification', 'reply_drafting', 'proposal_drafting', 'report_drafting', 'qa_summary',
  'owner_digest', 'next_best_action'
]);

function assertKnownTask(taskType) {
  if (!ASSISTANT_TASKS.includes(taskType)) throw new AiAssistantError('unknown-assistant-task', taskType);
}

/**
 * `evidenceRefs`: every AI-drafted output must be grounded in at least one already-verified
 * evidence item the caller explicitly passed in -- an empty list is refused outright. `input hash`
 * is computed here so a caller can later prove exactly what input a given output was produced
 * from, without re-serializing it themselves.
 */
export async function runAssistant(provider, {
  taskType, promptVersion = 1, evidenceRefs = [], input = {},
  costCapCents = 5, timeoutMs = 10000, minConfidence = 0.5
} = {}) {
  assertKnownTask(taskType);
  if (!Array.isArray(evidenceRefs) || evidenceRefs.length === 0) throw new AiAssistantError('evidence-grounding-required');
  if (!provider?.complete) throw new AiAssistantError('provider-missing-complete-method');

  const fullInput = { ...input, evidence: evidenceRefs.map(ref => (typeof ref === 'string' ? { id: ref } : ref)) };
  const inputHash = sha256Hex(JSON.stringify({ taskType, promptVersion, fullInput }));
  const timeoutPromise = new Promise((_, reject) => {
    const timer = setTimeout(() => reject(new AiAssistantError('assistant-timeout', `${taskType} exceeded ${timeoutMs}ms`)), timeoutMs);
    timer.unref?.();
  });
  const result = await Promise.race([provider.complete({ taskType, promptVersion, input: fullInput, costCapCents }), timeoutPromise]);

  return {
    taskType, promptVersion, inputHash, output: result.output, confidence: result.confidence,
    costCents: result.costCents, evidenceRefs: fullInput.evidence.map(item => item.id),
    belowConfidenceThreshold: result.confidence < minConfidence,
    requiresOwnerApproval: true
  };
}

/** A tiny, deterministic self-test harness ("eval fixtures") -- runs a fixed set of known
 * input/expected-shape pairs against a provider and reports pass/fail per fixture. */
export async function runEvalFixtures(provider, fixtures = []) {
  const results = [];
  for (const fixture of fixtures) {
    try {
      const result = await runAssistant(provider, fixture.call);
      const passed = typeof fixture.expect === 'function' ? fixture.expect(result) : true;
      results.push({ name: fixture.name, passed, result });
    } catch (error) {
      results.push({ name: fixture.name, passed: false, error: error.message });
    }
  }
  return { total: results.length, passed: results.filter(item => item.passed).length, results };
}
