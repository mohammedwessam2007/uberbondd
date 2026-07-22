BEGIN;

-- Approved inbound (read-only) Gmail accounts. Never touched by generic store writes (see
-- PROTECTED_COLLECTIONS in src/store.mjs) -- only the dedicated CAS methods in
-- src/inbound-accounts.mjs may mutate this table. Token material is stored only as an
-- AES-256-GCM ciphertext blob (iv/tag/data); the plaintext access/refresh token never has its
-- own column, and expiresAt/tokenVersion (needed for querying and CAS, not secret in themselves)
-- are the only token-related fields stored in the clear.
CREATE TABLE IF NOT EXISTS inbound_accounts (
  id text PRIMARY KEY,
  provider text NOT NULL DEFAULT 'gmail',
  account_identity text NOT NULL,
  approval_status text NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'revoked')),
  active boolean NOT NULL DEFAULT false,
  encrypted_tokens jsonb NOT NULL,
  token_expires_at timestamptz,
  token_version integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  data jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- One row per (provider, account_identity): re-approving the same mailbox updates the existing
-- row through the dedicated repository rather than creating a duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS inbound_accounts_provider_identity_idx
  ON inbound_accounts (provider, account_identity);

-- Supports the hot-path read: only approved, active accounts, without a full table scan.
CREATE INDEX IF NOT EXISTS inbound_accounts_approved_active_idx
  ON inbound_accounts (approval_status, active)
  WHERE approval_status = 'approved' AND active = true;

INSERT INTO schema_migrations(version) VALUES ('010_inbound_accounts') ON CONFLICT DO NOTHING;
COMMIT;
