import { DatabaseSync } from 'node:sqlite';
import { semanticHash, canonical, exactObligationKey } from './crown-closure.mjs';

const money = n => Number.isSafeInteger(n) && n >= 0;
const validId = s => typeof s === 'string' && s.length > 0 && s.length <= 500;
const fail = reason => ({ ok: false, status: 'QUEUE_NO_DOWNGRADE', reasonCodes: [reason] });

// Local durable control substrate; a distributed host must use equivalent
// serializable transactions. This does not confer spend or promotion authority.
export class InfiniteOpusStore {
  constructor(path = ':memory:') {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS months(month TEXT PRIMARY KEY, cap INTEGER NOT NULL, escrow INTEGER NOT NULL, daily INTEGER NOT NULL, authorization_ref TEXT, crown_routes TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS calls(id TEXT PRIMARY KEY, month TEXT NOT NULL, day TEXT NOT NULL, role TEXT NOT NULL, ceiling INTEGER NOT NULL, actual INTEGER, status TEXT NOT NULL, binding TEXT NOT NULL, receipt TEXT);
      CREATE UNIQUE INDEX IF NOT EXISTS calls_task_once ON calls(json_extract(binding,'$.taskId'));
      CREATE TABLE IF NOT EXISTS cache(key TEXT PRIMARY KEY, body TEXT NOT NULL, digest TEXT NOT NULL, created INTEGER NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS demand(key TEXT PRIMARY KEY, obligation TEXT NOT NULL, status TEXT NOT NULL, result TEXT);
      CREATE TABLE IF NOT EXISTS consumers(id TEXT PRIMARY KEY, key TEXT NOT NULL, deadline TEXT NOT NULL, stakes TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS capital(id TEXT PRIMARY KEY, body TEXT NOT NULL, digest TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, body TEXT NOT NULL);
    `);
  }
  close() { this.db.close(); }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  event(kind, body) { this.db.prepare('INSERT INTO events(kind,body) VALUES(?,?)').run(kind, canonical(body)); }
  configureMonth({ month, capMicros = 30_000_000, escrowMicros = 15_000_000, dailySoftMicros = 1_000_000, authorizationRef = null, crownRoutes = [] }) {
    if (!/^\d{4}-\d{2}$/.test(month) || !money(capMicros) || capMicros > 30_000_000 || !money(escrowMicros) || escrowMicros < 15_000_000 || escrowMicros > capMicros || !money(dailySoftMicros) || !Array.isArray(crownRoutes) || !crownRoutes.every(validId) || (authorizationRef !== null && (!validId(authorizationRef) || !crownRoutes.length))) return fail('valid-frozen-month-policy-required');
    return this.transaction(() => {
      const previous = this.db.prepare('SELECT * FROM months WHERE month=?').get(month);
      if (previous) return fail('monthly-policy-already-frozen');
      this.db.prepare('INSERT INTO months VALUES(?,?,?,?,?,?)').run(month, capMicros, escrowMicros, dailySoftMicros, authorizationRef, canonical(crownRoutes));
      return { ok: true, month, paidAuthorized: authorizationRef !== null };
    });
  }
  summary(month, day) {
    const policy = this.db.prepare('SELECT * FROM months WHERE month=?').get(month);
    if (!policy) return fail('month-policy-required');
    const rows = this.db.prepare('SELECT * FROM calls WHERE month=?').all(month);
    let spent = 0, reserved = 0, crownUsed = 0, today = 0;
    for (const row of rows) {
      const amount = row.status === 'SETTLED' ? row.actual : row.ceiling;
      if (row.status === 'SETTLED') spent += amount; else reserved += amount;
      if (row.role === 'CROWN') crownUsed += amount;
      if (row.day === day && row.status === 'SETTLED') today += amount;
    }
    const remaining = policy.cap - spent - reserved;
    const protectedRemaining = Math.max(0, policy.escrow - crownUsed);
    const overrun = rows.some(row => row.actual !== null && row.actual > row.ceiling);
    const state = remaining <= 0 || overrun ? 'BLACK' : remaining <= protectedRemaining ? 'RED' : today >= policy.daily || remaining < policy.cap / 4 ? 'YELLOW' : 'GREEN';
    return { ok: true, state, month, day, monthlyCapMicros: policy.cap, dailySoftMicros: policy.daily, todaySpendMicros: today, monthSpendMicros: spent, reservedMicros: reserved, crownEscrowRemainingMicros: protectedRemaining, remainingMicros: remaining, paidAuthorized: Boolean(policy.authorization_ref), pendingReconciliation: rows.filter(row => row.status === 'UNCERTAIN').length, qualityDowngradeAuthorized: false };
  }
  reserve({ callId, day, role, ceilingMicros, model, provider, taskId, qualityClass, priceExpiresAt, now }) {
    const month = day?.slice(0, 7);
    if (!validId(callId) || !/^\d{4}-\d{2}-\d{2}$/.test(day) || !['CROWN', 'WORKER'].includes(role) || !money(ceilingMicros) || !ceilingMicros || ![model, provider, taskId, qualityClass].every(validId) || !Number.isFinite(Date.parse(now)) || day !== now.slice(0, 10) || !Number.isFinite(Date.parse(priceExpiresAt)) || Date.parse(priceExpiresAt) <= Date.parse(now)) return fail('complete-current-reservation-required');
    const binding = canonical({ day, role, ceilingMicros, model, provider, taskId, qualityClass, priceExpiresAt });
    return this.transaction(() => {
      if (this.db.prepare('SELECT id FROM calls WHERE id=?').get(callId)) return fail('call-already-reserved-or-reconciled');
      if (this.db.prepare("SELECT id FROM calls WHERE json_extract(binding,'$.taskId')=?").get(taskId)) return fail('task-already-dispatched-no-blind-retry');
      const budget = this.summary(month, day);
      if (!budget.ok || !budget.paidAuthorized) return fail('explicit-month-spend-authorization-required');
      const routes = JSON.parse(this.db.prepare('SELECT crown_routes FROM months WHERE month=?').get(month).crown_routes);
      if ((role === 'CROWN') !== routes.includes(provider + ':' + model)) return fail('role-does-not-match-admitted-crown-route');
      if (budget.pendingReconciliation || this.db.prepare("SELECT id FROM calls WHERE status='UNCERTAIN' LIMIT 1").get()) return fail('uncertain-provider-cost-blocks-paid-dispatch');
      if (budget.state === 'BLACK' || ceilingMicros > budget.remainingMicros || (role !== 'CROWN' && budget.remainingMicros - ceilingMicros < budget.crownEscrowRemainingMicros)) return fail('monthly-cap-or-crown-escrow-protected');
      this.db.prepare('INSERT INTO calls VALUES(?,?,?,?,?,NULL,?,?,NULL)').run(callId, month, day, role, ceilingMicros, 'RESERVED', binding);
      this.event('RESERVE', { callId, ...JSON.parse(binding) });
      return { ok: true, callId, ceilingMicros };
    });
  }
  reconcile({ callId, actualMicros = null, receiptRef }) {
    if (!validId(receiptRef) || (actualMicros !== null && !money(actualMicros))) return fail('valid-provider-receipt-required');
    return this.transaction(() => {
      const call = this.db.prepare('SELECT * FROM calls WHERE id=?').get(callId);
      if (!call) return fail('reserved-call-required');
      if (call.status === 'SETTLED') return call.actual === actualMicros && call.receipt === receiptRef ? { ok: true, status: 'ALREADY_SETTLED' } : fail('contradictory-cost-receipt');
      this.db.prepare('UPDATE calls SET actual=?,status=?,receipt=? WHERE id=?').run(actualMicros, actualMicros === null ? 'UNCERTAIN' : 'SETTLED', receiptRef, callId);
      this.event('RECONCILE', { callId, actualMicros, receiptRef });
      // Even an overrun is recorded in full, never erased to preserve the cap.
      return { ok: true, status: actualMicros === null ? 'RECONCILIATION_REQUIRED' : actualMicros > call.ceiling ? 'PROVIDER_OVERRUN_STOP' : 'SETTLED', summary: this.summary(call.month, call.day) };
    });
  }
  cacheGet(request, nowMs) {
    const key = cacheKey(request);
    const row = this.db.prepare('SELECT * FROM cache WHERE key=?').get(key);
    let value = null;
    try { value = row ? JSON.parse(row.body) : null; } catch { /* poisoned entries miss */ }
    const hit = value !== null && request.freshnessClass !== 'LIVE' && row && Number.isFinite(nowMs) && nowMs >= row.created && nowMs < row.expires && semanticHash(value) === row.digest;
    this.event(hit ? 'CACHE_HIT' : 'CACHE_MISS', { key, nowMs });
    return hit ? { ok: true, status: 'HIT', value, ageMs: nowMs - row.created, ttlRemainingMs: row.expires - nowMs, key } : { ok: true, status: 'MISS', key };
  }
  cachePut(request, value, nowMs, ttlMs) {
    const key = cacheKey(request);
    if (request.freshnessClass === 'LIVE' || !Number.isSafeInteger(nowMs) || !Number.isSafeInteger(ttlMs) || ttlMs <= 0 || ttlMs > 86_400_000 || !Number.isSafeInteger(nowMs + ttlMs)) return fail('cache-freshness-or-ttl-refused');
    const body = canonical(value);
    this.db.prepare('INSERT INTO cache VALUES(?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET body=excluded.body,digest=excluded.digest,created=excluded.created,expires=excluded.expires').run(key, body, semanticHash(value), nowMs, nowMs + ttlMs);
    return { ok: true, key };
  }
  invalidateCache(key) { this.db.prepare('DELETE FROM cache WHERE key=?').run(key); this.event('CACHE_INVALIDATE', { key }); }
  demand(task, { consumerId, deadline, stakes }) {
    const key = exactObligationKey(task);
    if (!validId(consumerId) || !Number.isFinite(Date.parse(deadline)) || !['KNOWN_LOW', 'KNOWN_HIGH', 'UNKNOWN'].includes(stakes)) return fail('typed-consumer-debt-required');
    return this.transaction(() => {
      const old = this.db.prepare('SELECT * FROM consumers WHERE id=?').get(consumerId);
      if (old && (old.key !== key || old.deadline !== deadline || old.stakes !== stakes)) return fail('consumer-obligation-conflict');
      this.db.prepare("INSERT OR IGNORE INTO demand VALUES(?,?,'QUEUED',NULL)").run(key, canonical(task));
      this.db.prepare('INSERT OR IGNORE INTO consumers VALUES(?,?,?,?)').run(consumerId, key, deadline, stakes);
      const consumers = this.db.prepare('SELECT * FROM consumers WHERE key=?').all(key);
      return { ok: true, key, consumerCount: consumers.length, mandatoryReview: consumers.some(c => c.stakes !== 'KNOWN_LOW'), earliestDeadline: consumers.map(c => c.deadline).sort((a,b) => Date.parse(a)-Date.parse(b))[0], status: 'QUEUED' };
    });
  }
  putCapital(asset) {
    if (!validId(asset?.id) || !['DECISION_FRANCHISE', 'NEGATIVE_KNOWLEDGE', 'VERIFIER', 'SOLVER_SPEC', 'TASK_COMPILER', 'EVIDENCE_GRAPH'].includes(asset.kind)) return fail('typed-capital-required');
    const body = canonical(asset), digest = semanticHash(asset);
    return this.transaction(() => {
      const previous = this.db.prepare('SELECT digest FROM capital WHERE id=?').get(asset.id);
      if (previous && previous.digest !== digest) return fail('immutable-capital-id-conflict');
      this.db.prepare('INSERT OR IGNORE INTO capital VALUES(?,?,?)').run(asset.id, body, digest);
      return { ok: true, digest, promotionAuthority: 'NONE' };
    });
  }
}

export function cacheKey(request) {
  const required = ['model', 'route', 'requestBody', 'toolSchema', 'systemInstructions', 'generationParameters', 'semanticStateHash', 'dependencyHash', 'qualityContract', 'crownRevision', 'freshnessClass', 'tenantScope'];
  if (!request || required.some(k => !Object.hasOwn(request, k)) || !['IMMUTABLE', 'BOUNDED', 'LIVE'].includes(request.freshnessClass)) throw new Error('complete-cache-fingerprint-required');
  return semanticHash(request);
}
