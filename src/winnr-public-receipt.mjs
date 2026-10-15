// The only receipt a fleet run may commit or publish. A raw run keeps per-account rows, digests, provider id maps and
// error messages in its private workdir. This builder removes those keys by name, rebuilds the header from fixed
// values, and then runs the artifact guard over the whole receipt. Anything the guard finds refuses the whole receipt.
//
// Two layers, on purpose: the producer returns aggregates only, and this builder is the backstop. Neither layer alone
// is trusted, so a future phase that accidentally returns a row still cannot reach a committed file.

import { assertPublicSafe } from './winnr-public-artifact-guard.mjs';

export const WINNR_PUBLIC_RECEIPT_SCHEMA = 'uberbond.winnr-fleet-integration-receipt.v2';

// Keys that may hold identities, digests or raw failure text. Removed at any depth, whatever their value.
export const WINNR_PUBLIC_RECEIPT_DENY_KEYS = Object.freeze(new Set([
  'perAccount',
  'slotDigest',
  'error',
  'rows',
  'providerMailboxIdsByEmail',
  'providerDomainIdsByDomain',
  'providerDomainRecordsByDomain',
  'ownerAttestationRef',
  'baseCommit'
]));

function stripDenied(value) {
  if (Array.isArray(value)) return value.map(stripDenied);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      if (!WINNR_PUBLIC_RECEIPT_DENY_KEYS.has(key)) out[key] = stripDenied(item);
    }
    return out;
  }
  return value;
}

// generatedAt is an ISO timestamp. baseCommit is shortened to 12 hex characters, which is enough to identify the commit
// and too short to trip the opaque-token check. ownerAttestation is a fixed descriptor, not the long reference string.
export function toPublicFleetReceipt({ generatedAt = '', baseCommit = '', ownerAttestation = null, phases = {} } = {}) {
  if (!ownerAttestation || typeof ownerAttestation !== 'object') {
    throw Object.assign(new Error('owner attestation descriptor required'), { code: 'OWNER_ATTESTATION_DESCRIPTOR_REQUIRED' });
  }
  const receipt = {
    schemaVersion: WINNR_PUBLIC_RECEIPT_SCHEMA,
    generatedAt: String(generatedAt || ''),
    baseCommitShort: String(baseCommit || '').slice(0, 12),
    ownerAttestation: {
      kind: String(ownerAttestation.kind || ''),
      mission: String(ownerAttestation.mission || ''),
      dated: String(ownerAttestation.dated || '')
    },
    phases: stripDenied(phases)
  };
  assertPublicSafe(receipt);
  return receipt;
}
