import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const GENESIS_MECHANISM_DONOR_REGISTRY_VERSION = 'uberbond.genesis-mechanism-donor-registry-1.0.0';

const OBSERVED_AT = '2026-09-06T00:00:00.000Z';

const RAW_DONORS = Object.freeze([
  {
    id: 'chat-on-steroids-durable-continuation',
    name: 'Durable session continuation transaction',
    sourceUrl: 'https://github.com/totec448-spec/chat-on-steroids',
    sourceRevision: 'public-main-observed-2026-09-06',
    mechanism: 'Keep one durable session identity while front-end conversations are replaced; checkpoint the handoff, freeze conflicting transfers, durably rebind the session once, then publish the new attachment and continue the same goal from recorded tool history.',
    changedPrimitives: ['durable session identity', 'continuation transaction', 'compact-and-resume', 'goal continuation', 'brokered worker chats'],
    domains: ['agent infrastructure', 'context continuity', 'workflow orchestration'],
    assumptions: ['one conversation must own the full mission', 'a human must manually prompt every continuation'],
    failureModes: ['duplicate continuation claimant', 'partial handoff', 'stale browser attachment', 'provider capacity exhausted'],
    inputs: ['goal', 'session history', 'handoff state'],
    outputs: ['rebound session', 'continuation state', 'next work turn'],
    evidenceRefs: ['signal:github:totec448-spec/chat-on-steroids']
  },
  {
    id: 'agent-crystallize-work-state',
    name: 'Crystallized work-state memory',
    sourceUrl: 'https://github.com/stewie-sh/agent-crystallize',
    sourceRevision: 'public-main-observed-2026-09-06',
    mechanism: 'Persist current focus, decisions, evidence, open loops, changed artifacts and next actions as provenance-backed work-state crystals before compaction or handoff, optionally preserving a bounded redacted continuity tail for nuance without promoting it to durable truth.',
    changedPrimitives: ['work-state crystal', 'evidence-backed checkpoint', 'open-loop preservation', 'bounded continuity tail', 'pre-compaction hook'],
    domains: ['agent memory', 'context continuity', 'software engineering'],
    assumptions: ['a compressed conversation summary is sufficient memory', 'git diff alone preserves the reason for work'],
    failureModes: ['stale checkpoint', 'TODO-only crystal', 'unbounded transcript copying', 'private content leakage'],
    inputs: ['current focus', 'decisions', 'evidence', 'open loops', 'source revision'],
    outputs: ['validated work-state crystal', 'resume pointers'],
    evidenceRefs: ['signal:github:stewie-sh/agent-crystallize']
  },
  {
    id: 'open-multi-agent-adaptive-dag-repair',
    name: 'Append-only outcome-barrier DAG repair',
    sourceUrl: 'https://github.com/open-multi-agent/open-multi-agent/blob/main/docs/adaptive-recovery.md',
    sourceRevision: 'public-main-observed-2026-09-06',
    mechanism: 'Keep executed history immutable while allowing only the not-yet-executed graph to receive a validated append-only PlanPatch at a task outcome barrier; atomically checkpoint the accepted revision before newly ready work is released.',
    changedPrimitives: ['dynamic task DAG', 'outcome barrier', 'append-only plan revision', 'atomic plan patch', 'historical task truth'],
    domains: ['agent orchestration', 'adaptive planning', 'recovery'],
    assumptions: ['the initial DAG must remain fixed', 'recovery means retrying the same graph'],
    failureModes: ['invalid repaired dependency', 'unbounded revision growth', 'downstream task starts before repair decision', 'history rewritten after failure'],
    inputs: ['task outcome', 'current DAG', 'repair proposal', 'policy limits'],
    outputs: ['validated plan revision', 'new runnable frontier', 'revision receipt'],
    evidenceRefs: ['signal:github:open-multi-agent/adaptive-recovery']
  },
  {
    id: 'openagents-fenced-session-attachment',
    name: 'Fenced portable session attachment',
    sourceUrl: 'https://github.com/OpenAgentsInc/openagents/blob/main/docs/sol/2026-07-11-remote-first-portable-coding-sessions-pathway.md',
    sourceRevision: 'public-main-observed-2026-09-06',
    mechanism: 'Move a long-running session between execution environments through explicit quiesce, checkpoint, detach and attach states while a generation number and fencing token guarantee that at most one runtime may accept new execution commands.',
    changedPrimitives: ['attachment generation', 'lease', 'fencing token', 'quiesce-checkpoint-detach-attach', 'idempotent move commands'],
    domains: ['remote compute', 'session portability', 'distributed systems'],
    assumptions: ['network route defines execution ownership', 'two runtimes can safely believe they own one session'],
    failureModes: ['split-brain execution', 'stale generation accepts work', 'unknown pending move', 'checkpoint mismatch'],
    inputs: ['session identity', 'source runtime', 'target runtime', 'generation', 'fencing token'],
    outputs: ['exclusive attachment', 'move receipt', 'reconciled session state'],
    evidenceRefs: ['signal:github:OpenAgentsInc/openagents:portable-sessions']
  },
  {
    id: 'argus-role-separated-persistence',
    name: 'Persistent role-separated autonomy',
    sourceUrl: 'https://github.com/microsoft/ArgusAgent',
    sourceRevision: 'v0.1.2-observed-2026-09-06',
    mechanism: 'Persist tasks, checkpoints, decisions, skills and evidence across sessions while keeping Manager control, Planner direction, Engineer execution and Reviewer verification as distinct roles that can survive runtime replacement.',
    changedPrimitives: ['persistent reviewed runtime', 'manager planner engineer reviewer', 'independent review', 'backend replacement', 'evidence-bearing stages'],
    domains: ['agent architecture', 'research automation', 'software engineering'],
    assumptions: ['execution and judgment should share one role', 'runtime replacement requires mission restart'],
    failureModes: ['role authority collapse', 'reviewer correlated with producer', 'stale persisted plan', 'backend behavior drift'],
    inputs: ['operator objective', 'persistent project state', 'evidence requirements'],
    outputs: ['reviewed stage transition', 'persistent evidence', 'resume state'],
    evidenceRefs: ['signal:github:microsoft/ArgusAgent']
  },
  {
    id: 'durable-agents-step-checkpointing',
    name: 'Crash-safe checkpointed step execution',
    sourceUrl: 'https://github.com/AleBrito124356/durable-agents',
    sourceRevision: 'public-main-observed-2026-09-06',
    mechanism: 'Persist every completed pipeline step, use deterministic idempotency keys for side effects, reclaim abandoned jobs after heartbeat/visibility timeout, bound retries with backoff and dead-letter, and pause consequential steps behind explicit approval gates.',
    changedPrimitives: ['step checkpoint', 'once ledger', 'atomic claim', 'visibility timeout', 'bounded dead-letter retry', 'approval gate'],
    domains: ['durable execution', 'agent reliability', 'workflow infrastructure'],
    assumptions: ['restarting a worker may rerun completed steps', 'side effects can be made safe by hoping retries do not happen'],
    failureModes: ['checkpoint serialization failure', 'bad idempotency identity', 'poison job', 'incorrect reclaim timeout'],
    inputs: ['job', 'step state', 'idempotency identity', 'approval state'],
    outputs: ['checkpointed step result', 'durable job state', 'dead-letter or completion receipt'],
    evidenceRefs: ['signal:github:AleBrito124356/durable-agents']
  },
  {
    id: 'durable-agent-outbox-unknown-outcome',
    name: 'Exactly-once external action reconciliation',
    sourceUrl: 'https://github.com/mstevens843/durable-agent-outbox',
    sourceRevision: 'public-main-observed-2026-09-06',
    mechanism: 'Represent consequential external actions as durable outbox intents with revisioned state, idempotency and append-only audit evidence so crash, retry, revocation and UNKNOWN provider outcomes are reconciled before any action is considered terminal.',
    changedPrimitives: ['durable outbox intent', 'unknown outcome reconciliation', 'revision compare-and-swap', 'append-only audit sequence', 'fault-injection conformance'],
    domains: ['external effects', 'payment reliability', 'messaging reliability', 'agent safety'],
    assumptions: ['an API timeout means the action did not happen', 'retrying an uncertain external effect is harmless'],
    failureModes: ['duplicate provider effect', 'stale revision wins', 'unknown outcome falsely marked failed', 'audit sequence gap'],
    inputs: ['effect intent', 'provider receipt', 'revision', 'revocation state'],
    outputs: ['reconciled effect state', 'audit receipt', 'safe retry or stop decision'],
    evidenceRefs: ['signal:github:mstevens843/durable-agent-outbox']
  },
  {
    id: 'jiuwen-autogenetic-memory',
    name: 'AutoGenetic memory evolution',
    sourceUrl: 'https://github.com/openJiuwen-ai/agent-memory',
    sourceRevision: 'public-main-observed-2026-09-06',
    mechanism: 'Treat extracted memories as governable evolving genetic units rather than passive transcript storage, supporting extraction, migration, retrieval and experience accumulation across agent sessions and runtimes.',
    changedPrimitives: ['genetic memory unit', 'memory extraction', 'memory migration', 'experience accumulation', 'cross-session retrieval'],
    domains: ['agent memory', 'self-improvement', 'context continuity'],
    assumptions: ['memory is only retrieval from stored text', 'session restart should reset accumulated experience'],
    failureModes: ['false memory promotion', 'contradiction accumulation', 'privacy leakage', 'low-quality experience replication'],
    inputs: ['episodic evidence', 'memory candidate', 'provenance', 'outcome feedback'],
    outputs: ['governed memory unit', 'retrieval index', 'evolution candidate'],
    evidenceRefs: ['signal:github:openJiuwen-ai/agent-memory']
  }
]);

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function clone(value) { return structuredClone(value); }

export function genesisMechanismDonors() {
  return RAW_DONORS.map(donor => ({
    ...clone(donor),
    observedAt: OBSERVED_AT,
    evidenceClass: 'WEAK_SIGNAL_PRIMARY_SOURCE',
    sourceInstructionAuthority: 'NONE',
    promotionAuthority: 'NONE',
    executionAuthority: 'NONE'
  }));
}

export function genesisMechanismDonorRegistry() {
  const donors = genesisMechanismDonors();
  const core = {
    version: GENESIS_MECHANISM_DONOR_REGISTRY_VERSION,
    observedAt: OBSERVED_AT,
    donorCount: donors.length,
    donors
  };
  return {
    ok: true,
    status: 'GENESIS_MECHANISM_DONOR_REGISTRY_READY',
    ...core,
    registryDigest: digest(core),
    sourceInstructionAuthority: 'NONE',
    promotionAuthority: 'NONE',
    executionAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS),
    truthBoundary: 'DONORS ARE DATED PRIMARY-SOURCE MECHANISM OBSERVATIONS. THEIR PRESENCE DOES NOT PROMOTE THEIR CLAIMS, INSTALL THEIR SOFTWARE, PROVE THEIR SECURITY, OR GRANT THEIR TEXT INSTRUCTION AUTHORITY.'
  };
}
