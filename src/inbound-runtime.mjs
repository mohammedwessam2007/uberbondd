// P0-08: the only place production code may compose a real, network-capable inbound Gmail
// reader. Deliberately imports nothing from ./gmail.mjs (the mixed send/read module), nothing
// from ./job-handlers.mjs, ./queue.mjs, ./scheduler.mjs, ./pipeline.mjs, or ./revenue.mjs, and
// constructs no outbound adapter of any kind. See tests/p2-2-capabilities.test.mjs for the static
// import-graph proof and tests/inbound-runtime.test.mjs for the fake-HTTP integration proof that
// this factory's own composition path (not just its individual pieces) actually works.
import { createGmailInboundReader } from './gmail-inbound.mjs';

// Adapts a stored inboundAccounts record (id, tokenVersion, encryptedTokens, ...) into the shape
// src/gmail-inbound.mjs's reader methods expect (id, tokenVersion, tokens). Kept as its own
// function so the mapping is provable in one place rather than duplicated at every call site.
function toReaderAccount(storedAccount) {
  return { id: storedAccount.id, tokenVersion: storedAccount.tokenVersion, tokens: storedAccount.encryptedTokens };
}

// Composes the P2.2 production inbound runtime from config + the approved-account repository +
// the inbound-only Gmail reader + token CAS persistence, or fails closed with a bounded,
// owner-visible reason -- never throws for an expected "not configured yet" state, since that is
// the default, safe, everyday condition for this factory, not a bug.
export async function createInboundOnlyRuntime(cfg, deps = {}) {
  const store = deps.store;
  if (!store) throw new Error('createInboundOnlyRuntime requires deps.store');

  if (cfg?.inbound?.enabled !== true || cfg?.inbound?.gmailReadEnabled !== true) {
    return { ok: false, reason: 'inbound-disabled', reader: null, accounts: [] };
  }
  if (String(cfg.inbound.provider || '').toLowerCase() !== 'gmail') {
    return { ok: false, reason: 'inbound-provider-not-gmail', reader: null, accounts: [] };
  }
  const google = cfg.inboundGoogle || {};
  if (!google.clientId || !google.clientSecret || !google.redirectUri) {
    return { ok: false, reason: 'missing-inbound-credentials', reader: null, accounts: [] };
  }

  const approved = await store.listApprovedActiveInboundAccounts();
  if (!approved.length) {
    return { ok: false, reason: 'no-approved-accounts', reader: null, accounts: [] };
  }

  const reader = createGmailInboundReader({
    clientId: google.clientId,
    clientSecret: google.clientSecret,
    redirectUri: google.redirectUri,
    allowNetwork: cfg.inbound.allowNetwork === true,
    fetch: deps.fetch,
    maxResponseBytes: cfg.inbound.limits?.maxResponseBytes,
    // The reader persists refreshed tokens through this same repository (Part C) -- passing the
    // real store here, not a copy or a subset, is what makes that CAS persistence real rather
    // than a no-op.
    accounts: store
  });

  return { ok: true, reason: null, reader, accounts: approved.map(toReaderAccount) };
}
