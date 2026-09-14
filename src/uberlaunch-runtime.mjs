import crypto from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { compileUberLaunchManifest, pressUberLaunchButton } from './uberlaunch-one-button.mjs';
import { PostalEffectAdapter, postalProviderEffectIdentity } from './omnia-v9/integrations/providers/postal-effect-adapter.mjs';

export const UBERLAUNCH_RUNTIME_VERSION = 'uberbond.uberlaunch-runtime.v1';
const MAX_PACKET_AGE_MS = 5 * 60 * 1000;
const PRESS_TTL_MS = 5 * 60 * 1000;

const text = (value, max = 2000) => String(value ?? '').trim().slice(0, max);
const hash = value => crypto.createHash('sha256').update(String(value ?? '')).digest('hex');
const hmac = (secret, value) => crypto.createHmac('sha256', String(secret || '')).update(String(value ?? '')).digest('hex');

function parseJson(value) {
  try { return JSON.parse(String(value || '')); }
  catch { return null; }
}

export function readUberLaunchPacket(env = process.env, now = new Date()) {
  const packet = parseJson(env.UBERLAUNCH_PACKET_JSON);
  const reasons = [];
  if (!packet || typeof packet !== 'object') reasons.push('uberlaunch-runtime-packet-required');
  const observedAt = packet?.observedAt ? Date.parse(packet.observedAt) : NaN;
  const nowMs = new Date(now).getTime();
  if (!Number.isFinite(observedAt)) reasons.push('uberlaunch-runtime-observed-at-required');
  else if (observedAt > nowMs + 60_000 || nowMs - observedAt > MAX_PACKET_AGE_MS) reasons.push('uberlaunch-runtime-packet-stale');
  const expectedCommit = text(env.UBERBOND_SOURCE_COMMIT || env.GITHUB_SHA || env.VERCEL_GIT_COMMIT_SHA, 80);
  const packetCommit = text(packet?.sourceCommit, 80);
  if (expectedCommit && packetCommit !== expectedCommit) reasons.push('uberlaunch-runtime-source-commit-mismatch');
  if (!text(packet?.idempotencyKey, 500)) reasons.push('uberlaunch-idempotency-key-required');
  if (!packet?.dispatchAuthorization || !packet?.message) reasons.push('uberlaunch-effect-packet-incomplete');
  return { ok: reasons.length === 0, packet, reasonCodes: reasons, observedAt: Number.isFinite(observedAt) ? new Date(observedAt).toISOString() : null, expectedCommit: expectedCommit || null };
}

function previewOwnerAuthorization(now = new Date()) {
  return {
    authorized: true,
    receiptId: 'PREVIEW_ONLY_NOT_EFFECT_AUTHORITY',
    expiresAt: new Date(new Date(now).getTime() + PRESS_TTL_MS).toISOString()
  };
}

export function compileUberLaunchPreflight({ packetRead, adminSecret, now = new Date() } = {}) {
  if (!packetRead?.ok) return { ok: false, state: 'WAIT_EXTERNAL_EVIDENCE', reasonCodes: packetRead?.reasonCodes || ['runtime-packet-unavailable'], pressable: false };
  if (!text(adminSecret, 500)) return { ok: false, state: 'REFUSED', reasonCodes: ['admin-auth-secret-required'], pressable: false };
  const packet = packetRead.packet;
  const manifest = compileUberLaunchManifest({
    sourceReadiness: packet.sourceReadiness,
    discovery: packet.discovery,
    substrate: packet.substrate,
    launchInputs: packet.launchInputs,
    ownerAuthorization: previewOwnerAuthorization(now),
    now
  });
  const packetDigest = hash(JSON.stringify(packet));
  const expiresAt = new Date(new Date(now).getTime() + PRESS_TTL_MS).toISOString();
  const nonce = hmac(adminSecret, `${packetDigest}:${expiresAt}`);
  return {
    ok: true,
    state: manifest.state === 'READY_TO_PRESS' ? 'READY_FOR_FOUNDER_PRESS' : manifest.state,
    pressable: manifest.state === 'READY_TO_PRESS',
    manifestId: manifest.manifestId,
    packetDigest,
    nonce,
    expiresAt,
    qualifiedProspectCount: manifest.qualifiedProspectCount,
    hardStopReasonCodes: manifest.hardStopReasonCodes,
    waitReasonCodes: manifest.waitReasonCodes,
    selfHost: manifest.selfHost,
    truthBoundary: 'READY_FOR_FOUNDER_PRESS means all supplied non-founder gates are green on fresh runtime evidence. It creates no effect authority until an authenticated founder press is separately validated.'
  };
}

export function validateFounderPress({ preflight, suppliedNonce, adminSecret, now = new Date() } = {}) {
  const reasons = [];
  if (preflight?.state !== 'READY_FOR_FOUNDER_PRESS' || preflight?.pressable !== true) reasons.push('launch-not-ready-for-founder-press');
  if (!text(suppliedNonce, 200)) reasons.push('press-nonce-required');
  if (!preflight?.expiresAt || Date.parse(preflight.expiresAt) <= new Date(now).getTime()) reasons.push('press-nonce-expired');
  const expected = preflight?.packetDigest && preflight?.expiresAt ? hmac(adminSecret, `${preflight.packetDigest}:${preflight.expiresAt}`) : '';
  const a = Buffer.from(text(suppliedNonce, 200));
  const b = Buffer.from(expected);
  if (!a.length || a.length !== b.length || !crypto.timingSafeEqual(a, b)) reasons.push('press-nonce-invalid');
  return { ok: reasons.length === 0, reasonCodes: [...new Set(reasons)] };
}

export function createPostalGovernedTransport({ env = process.env, fetchImpl = globalThis.fetch, now = () => new Date() } = {}) {
  const baseUrl = env.UBERPOSTAL_BASE_URL || env.POSTAL_BASE_URL;
  const apiKey = env.UBERPOSTAL_API_KEY || env.POSTAL_API_KEY;
  const fromAddress = env.UBERPOSTAL_FROM_ADDRESS || env.POSTAL_FROM_ADDRESS;
  const messageIdDomain = env.UBERPOSTAL_MESSAGE_ID_DOMAIN || env.POSTAL_MESSAGE_ID_DOMAIN;
  const adapter = new PostalEffectAdapter({ baseUrl, apiKey, fromAddress, messageIdDomain, fetchImpl, now });
  return {
    provider: 'SELF_HOSTED_POSTAL',
    async send(input = {}) {
      const executionId = `ublaunch_${hash(JSON.stringify({ idempotencyKey: input.idempotencyKey, launchDecisionId: input.launchDecisionId, authorizationReceiptId: input.authorizationReceiptId, to: input.to, campaignId: input.campaignId }))}`;
      const prepared = await adapter.prepare({
        businessKey: `${text(input.campaignId, 240)}:${text(input.to, 320).toLowerCase()}`,
        executionId,
        providerEffectIdentity: postalProviderEffectIdentity(executionId, messageIdDomain),
        effectPayload: {
          to: input.to,
          from: input.from || fromAddress,
          subject: input.subject,
          body: input.body,
          ...(input.listUnsubscribe ? { listUnsubscribe: input.listUnsubscribe } : {})
        }
      });
      const outcome = await adapter.dispatch(prepared);
      return {
        confirmed: outcome?.classification === 'ACCEPTED' && Boolean(outcome?.providerReferenceId),
        providerReceiptId: outcome?.providerReferenceId || null,
        classification: outcome?.classification || 'UNCERTAIN'
      };
    }
  };
}

function safeKey(value) { return hash(value).slice(0, 48); }
export function createFilePressLedger({ directory } = {}) {
  const root = text(directory, 1000);
  if (!root || !path.isAbsolute(root)) throw new Error('absolute-press-ledger-directory-required');
  return {
    async acquire(idempotencyKey) {
      await mkdir(root, { recursive: true, mode: 0o700 });
      const file = path.join(root, `${safeKey(idempotencyKey)}.json`);
      try {
        await writeFile(file, JSON.stringify({ state: 'RESERVED', idempotencyKeyDigest: hash(idempotencyKey), reservedAt: new Date().toISOString() }), { flag: 'wx', mode: 0o600 });
        return { acquired: true, file };
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error;
        let prior = null;
        try { prior = JSON.parse(await readFile(file, 'utf8')); } catch {}
        return { acquired: false, file, prior };
      }
    },
    async record(file, result) {
      await writeFile(file, JSON.stringify({ state: 'FINALIZED', finalizedAt: new Date().toISOString(), result }, null, 2), { mode: 0o600 });
    }
  };
}

export async function executeUberLaunchPress({ packetRead, adminSecret, suppliedNonce, ledger, transportAdapter, now = new Date() } = {}) {
  const preflight = compileUberLaunchPreflight({ packetRead, adminSecret, now });
  const validation = validateFounderPress({ preflight, suppliedNonce, adminSecret, now });
  if (!validation.ok) return { ok: false, state: 'BIG_BUTTON_REFUSED', reasonCodes: validation.reasonCodes, providerCalls: 0, messagesSent: 0 };
  if (!ledger || typeof ledger.acquire !== 'function' || typeof ledger.record !== 'function') return { ok: false, state: 'BIG_BUTTON_REFUSED', reasonCodes: ['durable-press-ledger-required'], providerCalls: 0, messagesSent: 0 };
  const packet = packetRead.packet;
  const reservation = await ledger.acquire(packet.idempotencyKey);
  if (!reservation.acquired) return { ok: false, state: 'DUPLICATE_PRESS_REFUSED', reasonCodes: ['idempotency-key-already-reserved'], providerCalls: 0, messagesSent: 0, prior: reservation.prior || null };
  const pressAt = new Date(now);
  const ownerAuthorization = {
    authorized: true,
    receiptId: `ubpress_${hash(`${preflight.packetDigest}:${pressAt.toISOString()}`)}`,
    expiresAt: new Date(pressAt.getTime() + PRESS_TTL_MS).toISOString()
  };
  const manifest = compileUberLaunchManifest({
    sourceReadiness: packet.sourceReadiness,
    discovery: packet.discovery,
    substrate: packet.substrate,
    launchInputs: packet.launchInputs,
    ownerAuthorization,
    now: pressAt
  });
  const result = await pressUberLaunchButton({
    manifest,
    ownerAuthorization,
    dispatchAuthorization: packet.dispatchAuthorization,
    message: packet.message,
    transportAdapter,
    idempotencyKey: packet.idempotencyKey,
    now: pressAt
  });
  await ledger.record(reservation.file, result);
  return result;
}
