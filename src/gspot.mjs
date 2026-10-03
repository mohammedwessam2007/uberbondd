// G-SPOT: one-button, durable, idempotent orchestration of the commercial
// pipeline over EXISTING gates. It owns sequencing and exact-batch authority
// bookkeeping only. Qualification, eligibility, contact history, message
// tournament, governance, sender health and dispatch all remain with their
// existing modules: G-SPOT consumes their verdicts as evidence and can only
// narrow, never widen.
//
// Hard properties (each has a hostile test):
//   * stages cannot be skipped; each needs its own evidence;
//   * a human reply halts the prospect at every later stage and mid-dispatch;
//   * authorization is bound to an exact batch digest, single-use, expiring,
//     never standing authority for unknown future sends;
//   * the effect is reserved (persisted) BEFORE it is attempted; an ambiguous
//     outcome becomes UNCERTAIN and is never blind-retried;
//   * without an injected dispatcher the run is a dry run with zero effects.
import { createHash } from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const GSPOT_VERSION = 'uberbond.gspot.v1';
export const STAGES = Object.freeze(['DEMAND', 'QUALIFIED', 'PROOF', 'MESSAGE', 'READY_FOR_AUTHORIZATION', 'AUTHORIZED', 'DISPATCHING', 'DISPATCHED', 'RECONCILED']);
export const TERMINAL_HALTS = Object.freeze(['HALTED_HUMAN_REPLY', 'BLOCKED', 'UNCERTAIN_NEEDS_RECONCILIATION', 'SKIPPED_BY_LIMIT']);
const STORE_KEY = 'gspotRuns';
const sha = v => createHash('sha256').update(typeof v === 'string' ? v : JSON.stringify(v)).digest('hex');
const sorted = obj => Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)));

const REQUIRE = {
  QUALIFIED: e => e.qualification?.eligible === true && e.qualification?.outboundAuthority === 'NONE' ? [] : ['qualification-not-eligible'],
  PROOF: e => (e.proofRef && e.proofDigest ? [] : ['proof-lineage-missing']),
  MESSAGE: e => (e.messageDigest && e.offerId && e.messageValidated === true ? [] : ['message-not-validated']),
  READY_FOR_AUTHORIZATION: e => [
    ...(e.effectPackageState === 'READY_FOR_AUTHORIZATION' ? [] : ['effect-package-not-ready']),
    ...(e.senderId && e.senderHealthy === true && e.senderQuarantined !== true ? [] : ['sender-not-healthy']),
    ...(e.recipientHash ? [] : ['recipient-binding-missing']),
    ...(e.suppressed === false ? [] : ['suppression-unverified-or-hit'])
  ]
};

const tick = (item, stage, at, note) => { item.stage = stage; item.history.push({ stage, at, ...(note ? { note } : {}) }); };

export function createGspot({ store, now = () => Date.now(), isHalted = () => false } = {}) {
  if (!store?.getSettings || !store?.setSetting) throw new Error('GSPOT_STORE_REQUIRED');
  const iso = () => new Date(now()).toISOString();

  const load = async () => (await store.getSettings())[STORE_KEY] || {};
  const save = async (run) => {
    const all = await load();
    all[run.runId] = run;
    // keep the most recent 50 runs only
    const keep = Object.values(all).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50);
    await store.setSetting(STORE_KEY, Object.fromEntries(keep.map(r => [r.runId, r])));
    return run;
  };
  const get = async runId => (await load())[runId] || null;

  /** Idempotent: the same prospect set + inputs yields the same runId. */
  const plan = async ({ items = [], idempotencyKey }) => {
    const base = items.map(i => i.prospectId).sort();
    const runId = `gs_${sha({ idempotencyKey: idempotencyKey || null, base }).slice(0, 20)}`;
    const existing = await get(runId);
    if (existing) return { run: existing, reused: true };
    const at = iso();
    const run = {
      version: GSPOT_VERSION, runId, createdAt: at, mode: 'DRY_RUN', state: 'PLANNED', batch: null, authorization: null,
      items: items.map(i => ({ prospectId: i.prospectId, offerId: i.offerId || null, rank: i.rank ?? null, stage: 'DEMAND', history: [{ stage: 'DEMAND', at }], blocks: [], evidence: {}, effect: null }))
    };
    await save(run);
    return { run, reused: false };
  };

  /** Advance every item as far as its supplied evidence allows, one stage at a
   * time, never skipping. evidenceFor(prospectId) -> evidence object. */
  const advance = async (runId, evidenceFor) => {
    const run = await get(runId);
    if (!run) throw new Error('GSPOT_RUN_NOT_FOUND');
    if (run.authorization?.consumedAt) throw new Error('GSPOT_RUN_ALREADY_DISPATCHED');
    const at = iso();
    for (const item of run.items) {
      if (TERMINAL_HALTS.includes(item.stage)) continue;
      const e = { ...(item.evidence || {}), ...(await evidenceFor(item.prospectId) || {}) };
      item.evidence = e;
      if (isHalted(item.prospectId)) { tick(item, 'HALTED_HUMAN_REPLY', at); continue; }
      item.blocks = [];
      for (const next of ['QUALIFIED', 'PROOF', 'MESSAGE', 'READY_FOR_AUTHORIZATION']) {
        if (STAGES.indexOf(item.stage) >= STAGES.indexOf(next)) continue;
        const missing = REQUIRE[next](e);
        if (missing.length) { item.blocks = missing.map(m => `${next}:${m}`); break; }
        tick(item, next, at);
      }
    }
    run.state = 'ADVANCED';
    return save(run);
  };

  /** Freeze exactly what would be sent. Digest covers every effect-relevant field. */
  const prepareBatch = async (runId, { maxItems = 5, perSenderCap = {}, ttlMs = 30 * 60000 } = {}) => {
    const run = await get(runId);
    if (!run) throw new Error('GSPOT_RUN_NOT_FOUND');
    if (run.authorization?.consumedAt) throw new Error('GSPOT_RUN_ALREADY_DISPATCHED');
    const used = {}; const chosen = [];
    for (const item of run.items) {
      if (item.stage !== 'READY_FOR_AUTHORIZATION') continue;
      if (isHalted(item.prospectId)) { tick(item, 'HALTED_HUMAN_REPLY', iso()); continue; }
      const sender = item.evidence.senderId;
      const cap = perSenderCap[sender] ?? 0;
      if (chosen.length >= maxItems || (used[sender] || 0) >= cap) { item.blocks = ['BATCH:cap-reached']; continue; }
      used[sender] = (used[sender] || 0) + 1;
      chosen.push({ prospectId: item.prospectId, offerId: item.offerId, senderId: sender, recipientHash: item.evidence.recipientHash, messageDigest: item.evidence.messageDigest, proofDigest: item.evidence.proofDigest });
    }
    const batchDigest = sha(chosen.sort((a, b) => a.prospectId.localeCompare(b.prospectId)).map(sorted));
    run.batch = { batchDigest, items: chosen, preparedAt: iso(), expiresAt: new Date(now() + ttlMs).toISOString(), maxMessages: chosen.length };
    run.state = chosen.length ? 'AWAITING_OWNER_AUTHORIZATION' : 'NOTHING_TO_AUTHORIZE';
    run.authorization = null;
    await save(run);
    return run;
  };

  /** Owner authorization must name this exact digest. It is a record of
   * Mohamed's decision, never inferred or carried to another batch. */
  const authorize = async (runId, { batchDigest, authorizedBy }) => {
    const run = await get(runId);
    if (!run?.batch) throw new Error('GSPOT_NO_PREPARED_BATCH');
    if (authorizedBy !== 'MOHAMED') throw new Error('GSPOT_AUTHORIZER_MUST_BE_OWNER');
    if (batchDigest !== run.batch.batchDigest) throw new Error('GSPOT_BATCH_DIGEST_MISMATCH');
    if (Date.parse(run.batch.expiresAt) <= now()) throw new Error('GSPOT_BATCH_EXPIRED');
    if (run.authorization) throw new Error('GSPOT_ALREADY_AUTHORIZED');
    run.authorization = { batchDigest, authorizedBy, authorizedAt: iso(), maxMessages: run.batch.maxMessages, consumedAt: null };
    for (const b of run.batch.items) tick(run.items.find(i => i.prospectId === b.prospectId), 'AUTHORIZED', iso());
    run.state = 'AUTHORIZED';
    return save(run);
  };

  /** Crash recovery: an item left DISPATCHING may or may not have sent. Never retry. */
  const resume = async runId => {
    const run = await get(runId);
    if (!run) throw new Error('GSPOT_RUN_NOT_FOUND');
    for (const item of run.items) if (item.stage === 'DISPATCHING') { tick(item, 'UNCERTAIN_NEEDS_RECONCILIATION', iso(), 'crash-or-timeout-after-reservation'); }
    return save(run);
  };

  /** dispatchEffect(item) must go through existing governed dispatch. Absent => dry run. */
  const dispatch = async (runId, dispatchEffect) => {
    let run = await get(runId);
    if (!run?.authorization) throw new Error('GSPOT_NOT_AUTHORIZED');
    if (run.authorization.consumedAt) throw new Error('GSPOT_AUTHORIZATION_ALREADY_CONSUMED');
    if (typeof dispatchEffect !== 'function') return { run, dryRun: true, externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS } };
    if (Date.parse(run.batch.expiresAt) <= now()) throw new Error('GSPOT_BATCH_EXPIRED');
    // Single-use: consume BEFORE any effect so a replay cannot dispatch twice.
    run.authorization.consumedAt = iso();
    await save(run);
    let messages = 0;
    for (const b of run.batch.items) {
      run = await get(runId);
      const item = run.items.find(i => i.prospectId === b.prospectId);
      if (item.stage !== 'AUTHORIZED') continue;
      if (messages >= run.authorization.maxMessages) break;
      if (isHalted(item.prospectId)) { tick(item, 'HALTED_HUMAN_REPLY', iso(), 'halted-before-dispatch'); await save(run); continue; }
      const idempotencyKey = sha({ runId, prospectId: b.prospectId, messageDigest: b.messageDigest }).slice(0, 32);
      item.effect = { idempotencyKey, reservedAt: iso() };
      tick(item, 'DISPATCHING', iso());
      await save(run); // reservation is durable before the effect is attempted
      try {
        const receipt = await dispatchEffect({ ...b, idempotencyKey });
        run = await get(runId);
        const again = run.items.find(i => i.prospectId === b.prospectId);
        again.effect = { ...again.effect, receipt: receipt ?? null, settledAt: iso() };
        tick(again, 'DISPATCHED', iso());
        messages += 1;
      } catch (error) {
        run = await get(runId);
        const again = run.items.find(i => i.prospectId === b.prospectId);
        again.effect = { ...again.effect, error: String(error?.code || error?.message || 'ERROR').slice(0, 200) };
        tick(again, 'UNCERTAIN_NEEDS_RECONCILIATION', iso(), 'dispatch-outcome-unknown-no-blind-retry');
      }
      await save(run);
    }
    run = await get(runId);
    run.state = 'DISPATCHED_PENDING_RECONCILIATION';
    await save(run);
    return { run, dryRun: false, messages };
  };

  /** Reconcile from durable provider/outbound-event truth, never from our own record. */
  const reconcile = async (runId, observedFor) => {
    const run = await get(runId);
    for (const item of run.items) {
      if (item.stage !== 'DISPATCHED' && item.stage !== 'UNCERTAIN_NEEDS_RECONCILIATION') continue;
      const seen = await observedFor(item.effect?.idempotencyKey, item.prospectId);
      if (seen === 'ACCEPTED') tick(item, 'RECONCILED', iso(), 'provider-evidence');
    }
    run.state = run.items.every(i => i.stage === 'RECONCILED' || TERMINAL_HALTS.includes(i.stage) || i.stage === 'DEMAND' || i.stage === 'QUALIFIED' || i.stage === 'PROOF' || i.stage === 'MESSAGE' || i.stage === 'READY_FOR_AUTHORIZATION') ? 'RECONCILED_OR_IDLE' : 'AWAITING_RECONCILIATION';
    return save(run);
  };

  return { plan, advance, prepareBatch, authorize, dispatch, resume, reconcile, get, list: load };
}
