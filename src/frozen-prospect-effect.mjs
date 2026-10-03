// Durable preparation is separate from execution validation. This module never
// signs send authority, queues a job, or calls a provider. Original receipt and
// unsubscribe bytes stay frozen; current exact safety reads remain mandatory.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { EFFECT_PACKAGE_VERSION } from './prospect-effect-package.mjs';

const canonical = x => Array.isArray(x) ? x.map(canonical) : x && typeof x === 'object'
  ? Object.fromEntries(Object.keys(x).sort().filter(k => x[k] !== undefined).map(k => [k, canonical(x[k])])) : x;
const sha = x => createHash('sha256').update(JSON.stringify(canonical(x))).digest('hex');
const key = digest => `frozenProspectEffect:${digest}`;
const seal = (x, secret) => createHmac('sha256', secret).update(JSON.stringify(canonical(x))).digest('hex');
const requireSecret = secret => { if (typeof secret !== 'string' || secret.length < 32) throw new Error('frozen-effect-secret-unavailable'); };
const deny = code => ({ ok: false, state: 'FROZEN_EFFECT_INVALID', blockerCodes: [code], readOnly: true, sendAuthority: false, externalEffects: 0 });
function authentic(snapshot, secret) {
  try {
  if (!snapshot || snapshot.version !== 'uberbond.frozen-prospect-effect.v1') return false;
  const { signature, ...base } = snapshot;
  const expected = seal(base, secret);
  return /^[a-f0-9]{64}$/.test(signature || '') && timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex')) &&
    sha({ version: EFFECT_PACKAGE_VERSION, participants: snapshot.result.effectPackage.participants }) === snapshot.digest;
  } catch { return false; }
}

export async function validateFrozenProspectEffect({ store, digest, secret, run, now = new Date(), identity, campaign } = {}) {
  requireSecret(secret);
  if (!/^[a-f0-9]{64}$/.test(digest || '')) return deny('frozen-effect-digest-invalid');
  const snapshot = (await store.getSettings())[key(digest)];
  if (!authentic(snapshot, secret) || snapshot.digest !== digest) return deny('frozen-effect-snapshot-unavailable-or-tampered');
  if (!Number.isFinite(Date.parse(snapshot.result.effectPackage.expiresAt)) || Date.parse(snapshot.result.effectPackage.expiresAt) <= +new Date(now)) return deny('effect-expired');
  if (identity && (identity.legalName !== snapshot.input.identity.legalBusinessSenderName || identity.postalAddress !== snapshot.input.identity.authorizedPublicPostalAddress || identity.senderName !== snapshot.input.identity.displaySenderName || identity.company !== snapshot.input.identity.company)) return deny('protected-identity-changed');
  if (campaign === null || (campaign && (campaign.id !== snapshot.input.campaign.campaignId || (campaign.offerId && campaign.offerId !== snapshot.result.offerId)))) return deny('campaign-lineage-changed');
  const participants = snapshot.result.effectPackage.participants;
  const current = await run(structuredClone(snapshot.input), {
    now, prepareEffect: true, includeEffectParticipants: true,
    frozenHistoryReceiptDigest: participants.contactHistoryReceiptDigest,
    unsubscribe: { unsubscribeUrl: participants.footerAndUnsubscribe.unsubUrl, oneClickUnsubscribeUrl: participants.footerAndUnsubscribe.oneClick },
    unsubscribeFactory: null
  });
  if (current.state !== 'READY_FOR_AUTHORIZATION') return { ...current, ok: false, validation: { valid: false, frozenEffectDigest: digest, materialChange: current.blockerCodes }, sendAuthority: false };
  if (current.globalRoute?.governanceGate?.refused !== false) return deny('provider-route-not-permitted');
  if (current.effectPackage.finalEffectDigest !== digest) return deny('material-effect-binding-changed');
  return { ...current, ok: true, frozenEffect: { digest, expiresAt: snapshot.result.effectPackage.expiresAt, maxEffects: 1, stored: true }, validation: { valid: true, frozenEffectDigest: digest, immutableArtifactsReused: true, checkedAt: new Date(now).toISOString() }, readOnly: true, sendAuthority: false };
}

export async function prepareFrozenProspectEffect({ store, input, secret, run, now = new Date(), identity, campaign } = {}) {
  requireSecret(secret);
  const request = structuredClone(input);
  delete request.freezeEffect;
  delete request.frozenEffectDigest;
  request.prepareEffect = true;
  const requestKey = `frozenProspectRequest:${sha(request)}`;
  const prior = (await store.getSettings())[requestKey];
  if (prior) return validateFrozenProspectEffect({ store, digest: prior, secret, run, now, identity, campaign });
  const result = await run(request, { now, prepareEffect: true, includeEffectParticipants: true });
  if (result.state !== 'READY_FOR_AUTHORIZATION' || !result.effectPackage?.finalEffectDigest) return result;
  if (result.globalRoute?.governanceGate?.refused !== false) return deny('provider-route-not-permitted');
  if (!result.effectPackage.expiresAt || result.effectPackage.maxEffects !== 1) return deny('frozen-effect-expiry-or-cap-invalid');
  const digest = result.effectPackage.finalEffectDigest;
  const base = { version: 'uberbond.frozen-prospect-effect.v1', digest, input: request, result, preparedAt: new Date(now).toISOString(), sendAuthority: false };
  const snapshot = { ...base, signature: seal(base, secret) };
  // Serialize equivalent preparation requests. Postgres advisory lock and the
  // JSON store's transaction mutex both prevent competing tokens/snapshots.
  const storedDigest = await store.transaction(async tx => {
    if (tx.pool) await tx.pool.query('SELECT pg_advisory_xact_lock(hashtext($1))', [requestKey]);
    const existing = (await tx.getSettings())[requestKey];
    if (existing) return existing;
    await tx.setSetting(key(digest), snapshot);
    await tx.setSetting(requestKey, digest);
    return digest;
  });
  if (storedDigest !== digest) return validateFrozenProspectEffect({ store, digest: storedDigest, secret, run, now, identity, campaign });
  return { ...result, frozenEffect: { digest, expiresAt: result.effectPackage.expiresAt, maxEffects: 1, stored: true }, readOnly: false, preparationMutation: 'SEALED_IMMUTABLE_SNAPSHOT_ONLY', sendAuthority: false };
}
