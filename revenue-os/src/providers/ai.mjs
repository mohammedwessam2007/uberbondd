// AI provider contract, underneath the bounded assistant harness (ai-assistants.mjs). The fake
// provider is purely deterministic (a hash of the input selects among a small set of canned,
// schema-shaped outputs) -- it never calls a real model, and its output is grounded only in fields
// the caller explicitly passed in `input.evidence`, never invented.
import crypto from 'node:crypto';

export const AI_CONTRACT = Object.freeze(['name', 'complete']);
export function assertAiContract(provider) {
  if (typeof provider?.name !== 'string') throw new Error('AI provider missing name');
  if (typeof provider?.complete !== 'function') throw new Error('AI provider missing complete');
  return true;
}

function deterministicPick(seedText, options) {
  const hash = crypto.createHash('sha256').update(seedText).digest();
  return options[hash.readUInt32BE(0) % options.length];
}

export function createFakeAiProvider() {
  const calls = [];
  return {
    name: 'fake',
    async complete({ taskType, promptVersion = 1, input = {}, costCapCents = 5 } = {}) {
      if (!taskType) throw new Error('ai-task-type-required');
      const costCents = 1;
      if (costCents > costCapCents) throw new Error('ai-cost-cap-exceeded');
      const evidenceRefs = Array.isArray(input.evidence) ? input.evidence.map(item => item.id || item.url || '').filter(Boolean) : [];
      const seed = JSON.stringify({ taskType, promptVersion, evidenceRefs });
      const confidence = deterministicPick(seed, [0.55, 0.65, 0.75, 0.85, 0.9]);
      const summary = `[fake-ai:${taskType}:v${promptVersion}] Grounded in ${evidenceRefs.length} evidence item(s): ${evidenceRefs.slice(0, 3).join(', ') || 'none'}.`;
      const record = { taskType, promptVersion, output: { summary, evidenceRefs }, confidence, costCents, tokensUsed: 42 };
      calls.push(record);
      return { ok: true, ...record };
    },
    _debug: { calls }
  };
}

export function createReplayAiProvider(scriptedOutputs = []) {
  let cursor = 0;
  const calls = [];
  return {
    name: 'replay',
    async complete({ taskType, promptVersion = 1, costCapCents = 5 } = {}) {
      const scripted = scriptedOutputs[cursor] || { output: { summary: '', evidenceRefs: [] }, confidence: 0.5, costCents: 1 };
      cursor += 1;
      if ((scripted.costCents ?? 1) > costCapCents) throw new Error('ai-cost-cap-exceeded');
      const record = { taskType, promptVersion, output: scripted.output, confidence: scripted.confidence ?? 0.5, costCents: scripted.costCents ?? 1, tokensUsed: scripted.tokensUsed ?? 0 };
      calls.push(record);
      return { ok: true, ...record };
    },
    _debug: { calls, cursor: () => cursor }
  };
}
