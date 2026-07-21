import crypto from 'node:crypto';
import { ConflictError } from './store.mjs';
import { parseInboundMime, classifyInboundEvent } from './inbound-classify.mjs';

// P2.2 shadow autonomy cycle. This module must never import Pipeline, RevenueEngine, the general
// job handlers, gmail.mjs (the mixed read/write module), or queue.mjs. It never claims a queue job
// of any kind -- stages run as plain in-process function calls, so there is no shared-queue
// claiming happening here at all, which makes "an unrelated pre-existing queued job gets claimed
// instead" (a real defect in an earlier, rejected design) structurally impossible rather than
// merely guarded against. See tests/p2-2-capabilities.test.mjs for the static proof.

// Exact, immutable stage order. Nothing here sends email, processes the outbound queue, or
// processes follow-ups -- those stages were deliberately left out of this module entirely (an
// earlier design that included a "test provider only" version of them was rejected precisely
// because "test send" is still outbound capability).
export const STAGES = Object.freeze(['poll-inbound', 'classify-and-suppress', 'write-digest']);

// A stage in either of these statuses is done for good on this run and is never re-attempted on
// resume. 'blocked' and 'failed' are deliberately excluded: a transient failure or a not-yet-ready
// precondition must remain retryable, never permanently skipped.
const TERMINAL_STAGE_STATUSES = Object.freeze(['done', 'skipped']);

async function withStageTimeout(fn, ms) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(fn),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`stage exceeded ${ms}ms runtime limit`)), ms); })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// Strips anything that looks like an email, a URL, or a token/secret/password assignment, and
// caps length. Used on every string that might reach a stored stage result or the digest.
export function redactText(value) {
  const s = String(value ?? '');
  return s
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/https?:\/\/\S+/gi, '[redacted-url]')
    .replace(/\b(token|secret|password|apikey|api_key)\b\s*[:=]\s*\S+/gi, '$1=[redacted]')
    .slice(0, 500);
}

function extractEmailAddress(value) {
  const match = String(value || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0] : '';
}

// Acquires the single global active-cycle slot. If one is already active, tries to reclaim it only
// if its lease has expired (its owning process crashed or stalled) -- never competes with a
// genuinely live cycle. The reclaimed run may carry a different runKey than the one requested:
// that's correct, not a bug -- finishing an interrupted cycle takes priority over starting a new one.
async function acquireRun(store, runKey, leaseOwner, leaseTtlMs) {
  const created = await store.createAutonomyCycleRun(runKey, leaseOwner, leaseTtlMs);
  if (created.ok) return { ok: true, run: created.run };
  if (created.reason === 'cycle-already-active') {
    // The same worker that already holds this lease is calling again (e.g. a scheduler invoking
    // this repeatedly to drive a multi-attempt retry forward) -- let it continue its own run
    // rather than treating itself as a competitor. This does not weaken the singleton: a
    // *different* leaseOwner still cannot touch an unexpired lease.
    if (created.run && created.run.leaseOwner === leaseOwner) return { ok: true, run: created.run };
    const reclaimed = await store.reclaimStaleAutonomyCycleRun(leaseOwner, leaseTtlMs);
    if (reclaimed.ok) return { ok: true, run: reclaimed.run };
    return { ok: false, reason: 'cycle-already-active' };
  }
  return { ok: false, reason: created.reason };
}

// Bounded pagination: hard-caps both the number of list calls and the total messages collected
// regardless of what the API/fixture claims, and breaks on a repeating page token (loop
// protection) in addition to the hard page cap.
async function pollInboundStage(ctx) {
  const { cfg, mailboxReader, accounts } = ctx;
  if (!cfg.inbound.enabled || !cfg.inbound.gmailReadEnabled) {
    return { status: 'skipped', result: { skipped: true, reason: 'inbound-disabled', messagesFetched: 0 } };
  }
  if (!mailboxReader || !Array.isArray(accounts) || accounts.length === 0) {
    return { status: 'blocked', result: { reason: 'no-mailbox-reader-configured' } };
  }
  const limits = cfg.inbound.limits;
  const hardCap = limits.maxPagesPerCycle * limits.maxMessagesPerPage;
  const fetched = [];
  for (const account of accounts) {
    let pageToken = '';
    for (let page = 0; page < limits.maxPagesPerCycle && fetched.length < hardCap; page += 1) {
      const list = await mailboxReader.listMessages(account, cfg.encryptionKey, 'in:inbox', limits.maxMessagesPerPage, pageToken);
      const refs = (list.data?.messages || []).slice(0, limits.maxMessagesPerPage);
      for (const ref of refs) {
        if (fetched.length >= hardCap) break;
        if (ref?.id) fetched.push({ accountId: account.id, refId: String(ref.id) });
      }
      const nextToken = list.data?.nextPageToken ? String(list.data.nextPageToken) : '';
      if (!nextToken || nextToken === pageToken) break;
      pageToken = nextToken;
    }
  }
  return { status: 'done', result: { messagesFetched: fetched.length, refs: fetched } };
}

// Reads the previous stage's own persisted result (not shared mutable state) so this stage works
// correctly whether it's running right after poll-inbound in the same process, or resuming fresh
// after a crash with only the stored run record to go on.
async function classifyAndSuppressStage(ctx) {
  const { store, cfg, mailboxReader, accounts, run } = ctx;
  const limits = cfg.inbound.limits;
  const pollResult = run.stages['poll-inbound']?.result || {};
  const refs = Array.isArray(pollResult.refs) ? pollResult.refs : [];
  const accountsById = new Map((accounts || []).map(account => [account.id, account]));
  const counts = {
    processed: 0, duplicate: 0, oversized: 0,
    bounce: 0, complaint: 0, unsubscribe: 0, outOfOffice: 0, reply: 0, unknown: 0, ownerExceptions: 0
  };
  const hardCap = limits.maxPagesPerCycle * limits.maxMessagesPerPage;
  let ownerExceptions = 0;
  const nowIso = () => new Date().toISOString();

  for (const ref of refs) {
    if (counts.processed + counts.duplicate >= hardCap) break;
    const account = accountsById.get(ref.accountId);
    if (!account || !mailboxReader) continue;
    const full = await mailboxReader.getMessage(account, cfg.encryptionKey, ref.refId);
    const message = full.data || {};
    const gmailId = String(message.id || ref.refId);

    const existing = await store.findOne('replies', { gmailId });
    if (existing) { counts.duplicate += 1; continue; }

    const approxBytes = Buffer.byteLength(JSON.stringify(message.payload || {}), 'utf8');
    const oversized = approxBytes > limits.maxMessageBytes;
    if (oversized) counts.oversized += 1;

    const headers = Object.fromEntries((message.payload?.headers || []).map(h => [String(h.name || '').toLowerCase(), h.value]));
    const parsed = oversized ? { body: '', truncated: true } : parseInboundMime(message.payload, limits);
    const classification = classifyInboundEvent({ headers, body: parsed.body });

    try {
      await store.add('replies', {
        id: crypto.randomUUID(), prospectId: null, gmailId, threadId: String(message.threadId || ''),
        from: redactText(headers.from), subject: redactText(headers.subject), body: '',
        classification, receivedAt: nowIso()
      });
    } catch (error) {
      if (error instanceof ConflictError) { counts.duplicate += 1; continue; }
      throw error;
    }
    counts.processed += 1;

    const categoryKey = { bounce: 'bounce', complaint: 'complaint', unsubscribe: 'unsubscribe', 'out-of-office': 'outOfOffice', reply: 'reply', unknown: 'unknown' }[classification.category] || 'unknown';
    counts[categoryKey] += 1;

    const suppressWorthy = ['bounce', 'complaint', 'unsubscribe'].includes(classification.category);
    if (suppressWorthy) {
      const prospects = await store.list('prospects');
      const prospect = prospects.find(item => item.threadId && item.threadId === message.threadId);
      if (prospect) {
        await store.patch('prospects', prospect.id, { status: classification.category, nextFollowupAt: null });
      }
      // Prefer the matched prospect's own contact address -- that's the actual recipient who
      // bounced/complained/unsubscribed. The From header is often a bounce daemon or complaint
      // relay, not the person to suppress, so it's only used as a fallback when no thread match
      // exists (e.g. a direct "unsubscribe me" reply sent by the lead themself).
      const targetEmail = prospect?.contact?.email || extractEmailAddress(headers.from);
      if (targetEmail) {
        try {
          await store.add('suppressions', { id: crypto.randomUUID(), value: String(targetEmail).toLowerCase(), reason: classification.category, createdAt: nowIso() });
        } catch (error) {
          if (!(error instanceof ConflictError)) throw error;
        }
      }
    }

    if ((classification.category === 'reply' || classification.category === 'unknown') && ownerExceptions < limits.maxOwnerExceptionsPerCycle) {
      await store.add('notifications', { id: crypto.randomUUID(), type: 'autonomy_owner_exception', leadId: null, prospectId: null, status: 'open', createdAt: nowIso() });
      ownerExceptions += 1;
      counts.ownerExceptions += 1;
    }
  }

  return { status: 'done', result: counts };
}

// Strict allow-listed schema: only counts, short status strings, and timestamps. Never spreads
// a stage's raw result object in, so no future stage can accidentally leak PII into the digest
// just by adding a field to its own result.
function buildDigest(run, limits) {
  const pollResult = run.stages['poll-inbound']?.result || {};
  const classifyResult = run.stages['classify-and-suppress']?.result || {};
  const digest = {
    runKey: run.runKey,
    startedAt: run.startedAt,
    finishedAt: new Date().toISOString(),
    stageStatuses: Object.fromEntries(STAGES.map(name => [name, run.stages[name]?.status || 'pending'])),
    counts: {
      messagesFetched: Number(pollResult.messagesFetched || 0),
      processed: Number(classifyResult.processed || 0),
      duplicate: Number(classifyResult.duplicate || 0),
      oversized: Number(classifyResult.oversized || 0),
      bounce: Number(classifyResult.bounce || 0),
      complaint: Number(classifyResult.complaint || 0),
      unsubscribe: Number(classifyResult.unsubscribe || 0),
      outOfOffice: Number(classifyResult.outOfOffice || 0),
      reply: Number(classifyResult.reply || 0),
      unknown: Number(classifyResult.unknown || 0)
    },
    ownerExceptions: Number(classifyResult.ownerExceptions || 0),
    suppressed: Number(classifyResult.bounce || 0) + Number(classifyResult.complaint || 0) + Number(classifyResult.unsubscribe || 0),
    verifiedPayments: 0,
    liveOutboundEnabled: false
  };
  const bytes = Buffer.byteLength(JSON.stringify(digest), 'utf8');
  if (bytes > limits.maxSummaryBytes) return { oversized: true, bytes };
  return { digest, bytes };
}

async function writeDigestStage(ctx) {
  const { run, cfg } = ctx;
  const built = buildDigest(run, cfg.inbound.limits);
  if (built.oversized) return { status: 'blocked', result: { reason: 'digest-too-large', bytes: built.bytes } };
  return { status: 'done', result: built.digest };
}

const STAGE_HANDLERS = Object.freeze({
  'poll-inbound': pollInboundStage,
  'classify-and-suppress': classifyAndSuppressStage,
  'write-digest': writeDigestStage
});

// Runs (or resumes) one bounded shadow-autonomy cycle. Returns { ok:false, reason, ... } rather
// than throwing for every expected non-success outcome (lost the singleton, a stage is blocked,
// retries exhausted) -- throwing is reserved for genuine bugs, not normal control flow.
export async function runAutonomyCycle(deps = {}) {
  const { store, cfg, runKey, leaseOwner, mailboxReader = null, accounts = [] } = deps;
  if (!store || !cfg || !runKey || !leaseOwner) {
    throw new Error('runAutonomyCycle requires store, cfg, runKey, and leaseOwner');
  }
  const limits = cfg.inbound.limits;

  const acquired = await acquireRun(store, runKey, leaseOwner, limits.leaseTtlMs);
  if (!acquired.ok) return { ok: false, reason: acquired.reason };
  let run = acquired.run;
  const startedAtMs = Date.parse(run.startedAt || new Date().toISOString());

  for (const stageName of STAGES) {
    const existingStage = run.stages[stageName];
    if (existingStage && TERMINAL_STAGE_STATUSES.includes(existingStage.status)) continue;

    if (Date.now() - startedAtMs > limits.maxCycleRuntimeMs) {
      return { ok: false, reason: 'cycle-timeout', run };
    }

    const attempts = Number(existingStage?.attempts || 0);
    let outcome;
    try {
      outcome = await withStageTimeout(
        () => STAGE_HANDLERS[stageName]({ store, cfg, mailboxReader, accounts, run, limits }),
        limits.maxStageRuntimeMs
      );
    } catch (error) {
      outcome = { status: 'failed', result: { error: redactText(error?.message || String(error)) } };
    }

    const succeeded = TERMINAL_STAGE_STATUSES.includes(outcome.status);
    const nextAttempts = succeeded ? attempts : attempts + 1;
    const stageRecord = { status: outcome.status, result: outcome.result, attempts: nextAttempts, completedAt: new Date().toISOString() };
    const isLastStage = stageName === STAGES[STAGES.length - 1];
    const finalizeNow = isLastStage && succeeded;

    const patched = await store.patchAutonomyCycleRun(run.id, run.version, {
      stagesPatch: { [stageName]: stageRecord },
      ...(finalizeNow ? { status: 'completed', finalizedAt: new Date().toISOString(), digestWrittenAt: new Date().toISOString() } : {})
    });
    if (!patched.ok) {
      return { ok: false, reason: patched.reason === 'version-conflict' ? 'lost-lease' : patched.reason, run: patched.run || run };
    }
    run = patched.run;

    if (!succeeded) {
      if (nextAttempts >= limits.maxStageRetries) {
        const failedFinal = await store.patchAutonomyCycleRun(run.id, run.version, { status: 'failed', finalizedAt: new Date().toISOString() });
        return { ok: false, reason: 'stage-retries-exhausted', stage: stageName, run: failedFinal.ok ? failedFinal.run : run };
      }
      return { ok: false, reason: 'stage-not-complete', stage: stageName, run };
    }
  }

  return { ok: true, run, digest: run.stages['write-digest']?.result || null };
}
