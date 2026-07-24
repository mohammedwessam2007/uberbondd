-- Revenue OS core entities: organizations (covers organization/agency/partner/buyer via `kind`),
-- websites (portfolio items / client sites), offers (service catalog + version). Postgres-
-- compatible schema written to the same shape ../../src/store.mjs's own Postgres path expects;
-- only the JSON backend is implemented and tested this session (see docs/
-- REUSE_VS_REPLACE_DECISION.md) -- this file documents the intended relational shape.
CREATE TABLE IF NOT EXISTS ros_organizations (
  id text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('organization','agency','partner','buyer')),
  name text NOT NULL,
  domain text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ros_organizations_kind_idx ON ros_organizations (kind);
CREATE INDEX IF NOT EXISTS ros_organizations_domain_idx ON ros_organizations (domain);

CREATE TABLE IF NOT EXISTS ros_websites (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES ros_organizations(id),
  domain text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, domain)
);

CREATE TABLE IF NOT EXISTS ros_offers (
  id text PRIMARY KEY,
  service_key text NOT NULL,
  version int NOT NULL DEFAULT 1,
  price_cents int NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ros_offers_service_key_idx ON ros_offers (service_key);
