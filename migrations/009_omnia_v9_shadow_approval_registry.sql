-- Reality-shadow-only registry. This table grants nothing: it carries no
-- operation, resource, effect-class, cost, or blast-radius columns, so it
-- structurally cannot be read as an authority grant by any real admission
-- path. It only records that a given OWNER_APPROVAL object (already stored,
-- content-bound and immutable, in the frozen omnia_v9_objects table) is
-- restricted to reality-shadow validation and must never be treated as
-- production external-action authority. shadow_only can only ever be TRUE:
-- the row can be deleted, but never flipped to grant anything.
-- No FK to omnia_v9_objects: its primary key is (object_type, object_id), not
-- object_id alone, so referential integrity is enforced at the application
-- layer (the issuance module requires the OWNER_APPROVAL object to already
-- exist before registering it here).
CREATE TABLE IF NOT EXISTS omnia_v9_shadow_approval_registry (
  approval_id text PRIMARY KEY,
  tenant_id text NOT NULL,
  shadow_only boolean NOT NULL DEFAULT true CHECK (shadow_only = true),
  purpose_restriction text NOT NULL,
  registered_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_omnia_v9_shadow_approval_registry_tenant
  ON omnia_v9_shadow_approval_registry(tenant_id, registered_at DESC);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO schema_migrations(version) VALUES ('009_omnia_v9_shadow_approval_registry') ON CONFLICT DO NOTHING;
