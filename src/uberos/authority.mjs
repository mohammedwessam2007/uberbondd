import crypto from 'node:crypto';

export const UBEROS_AUTHORITY_VERSION = 'uberos.authority.v1';

const clean = (value, max = 512) => {
  const text = String(value ?? '').trim();
  return text && text.length <= max ? text : null;
};
const uniq = values => [...new Set((Array.isArray(values) ? values : []).map(v => clean(v, 160)).filter(Boolean))].sort();
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

function fail(status, reasonCodes, extra = {}) {
  return {
    ok: false,
    status,
    reasonCodes: uniq(reasonCodes),
    consequenceAuthority: 'NONE',
    ...extra
  };
}

export function createAuthorityRoot({
  authorityId = 'uberos-root',
  epoch = 1,
  scopes = [],
  effects = [],
  expiresAt = null,
  provenanceRef = null
} = {}) {
  const id = clean(authorityId, 160);
  const prov = clean(provenanceRef, 1200);
  const numericEpoch = Number(epoch);
  if (!id || !Number.isSafeInteger(numericEpoch) || numericEpoch < 1) {
    return fail('AUTHORITY_ROOT_INVALID', ['authority-id-and-positive-epoch-required']);
  }
  if (!prov) return fail('AUTHORITY_ROOT_INVALID', ['authority-provenance-required']);
  const normalizedScopes = uniq(scopes);
  const normalizedEffects = uniq(effects);
  if (!normalizedScopes.length) return fail('AUTHORITY_ROOT_INVALID', ['at-least-one-scope-required']);
  if (expiresAt != null && !Number.isFinite(Date.parse(expiresAt))) {
    return fail('AUTHORITY_ROOT_INVALID', ['valid-expiry-required']);
  }
  const core = {
    authorityId: id,
    epoch: numericEpoch,
    scopes: normalizedScopes,
    effects: normalizedEffects,
    expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    provenanceRef: prov,
    parentAuthorityId: null,
    depth: 0,
    revoked: false
  };
  return {
    ok: true,
    status: 'AUTHORITY_ROOT_READY',
    authority: { ...core, digest: `sha256:${hash(core)}` },
    consequenceAuthority: 'NONE'
  };
}

export function delegateAuthority(parent, {
  authorityId,
  scopes = [],
  effects = [],
  expiresAt = null,
  provenanceRef = null
} = {}) {
  if (!parent?.authorityId || parent?.revoked === true) {
    return fail('AUTHORITY_DELEGATION_BLOCKED', ['live-parent-authority-required']);
  }
  const id = clean(authorityId, 160);
  const prov = clean(provenanceRef, 1200);
  if (!id || !prov) return fail('AUTHORITY_DELEGATION_BLOCKED', ['child-id-and-provenance-required']);
  const requestedScopes = uniq(scopes);
  const requestedEffects = uniq(effects);
  const parentScopes = new Set(parent.scopes || []);
  const parentEffects = new Set(parent.effects || []);
  const wideningScopes = requestedScopes.filter(scope => !parentScopes.has(scope));
  const wideningEffects = requestedEffects.filter(effect => !parentEffects.has(effect));
  const reasons = [];
  if (wideningScopes.length) reasons.push('scope-expansion-forbidden');
  if (wideningEffects.length) reasons.push('effect-expansion-forbidden');
  const parentExpiry = parent.expiresAt ? Date.parse(parent.expiresAt) : null;
  const childExpiry = expiresAt ? Date.parse(expiresAt) : parentExpiry;
  if (expiresAt && !Number.isFinite(childExpiry)) reasons.push('valid-child-expiry-required');
  if (parentExpiry != null && childExpiry != null && childExpiry > parentExpiry) {
    reasons.push('expiry-extension-forbidden');
  }
  if (reasons.length) {
    return fail('AUTHORITY_DELEGATION_BLOCKED', reasons, {
      wideningScopes,
      wideningEffects,
      law: 'DELEGATION_MAY_ONLY_ATTENUATE_AUTHORITY'
    });
  }
  const core = {
    authorityId: id,
    epoch: parent.epoch,
    scopes: requestedScopes,
    effects: requestedEffects,
    expiresAt: childExpiry != null ? new Date(childExpiry).toISOString() : null,
    provenanceRef: prov,
    parentAuthorityId: parent.authorityId,
    parentDigest: parent.digest || null,
    depth: Number(parent.depth || 0) + 1,
    revoked: false
  };
  return {
    ok: true,
    status: 'AUTHORITY_DELEGATED',
    authority: { ...core, digest: `sha256:${hash(core)}` },
    law: 'DELEGATION_MAY_ONLY_ATTENUATE_AUTHORITY',
    consequenceAuthority: 'NONE'
  };
}

export function revokeAuthority(authority, { reason, revokedAt = new Date().toISOString() } = {}) {
  const why = clean(reason, 600);
  const at = Date.parse(revokedAt);
  if (!authority?.authorityId || !why || !Number.isFinite(at)) {
    return fail('AUTHORITY_REVOCATION_INVALID', ['authority-reason-and-time-required']);
  }
  const revoked = {
    ...authority,
    revoked: true,
    revokedAt: new Date(at).toISOString(),
    revocationReason: why
  };
  return {
    ok: true,
    status: 'AUTHORITY_REVOKED',
    authority: { ...revoked, digest: `sha256:${hash(revoked)}` },
    propagation: 'DESCENDANTS_MUST_TREAT_REVOKED_ANCESTOR_AS_REVOKED',
    consequenceAuthority: 'NONE'
  };
}

export function authorityIsUsable(authority, { now = new Date(), ancestorRevoked = false } = {}) {
  if (!authority?.authorityId) return false;
  if (authority.revoked === true || ancestorRevoked) return false;
  if (authority.expiresAt && Date.parse(authority.expiresAt) <= new Date(now).getTime()) return false;
  return true;
}
