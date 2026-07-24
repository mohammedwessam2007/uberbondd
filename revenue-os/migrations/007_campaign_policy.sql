-- 24/7 Continuous Revenue Core, section 7: bounded owner authority. The owner approves one policy
-- per campaign (not one approval per message) -- this table is that policy, and it is structurally
-- incapable of being unlimited or permanent: expires_at is NOT NULL and campaign-policy.mjs itself
-- refuses to construct a policy whose duration exceeds its own maximum.
CREATE TABLE IF NOT EXISTS ros_campaign_policies (
  id text PRIMARY KEY,
  campaign_name text NOT NULL,
  offer_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','expired')),
  provider text NOT NULL DEFAULT 'test',
  budget_ceiling_cents integer NOT NULL DEFAULT 0 CHECK (budget_ceiling_cents >= 0),
  max_prospects integer NOT NULL CHECK (max_prospects > 0),
  max_daily_sends integer NOT NULL CHECK (max_daily_sends > 0),
  outbound_enabled boolean NOT NULL DEFAULT false,
  dry_run boolean NOT NULL DEFAULT true,
  live_send_approval boolean NOT NULL DEFAULT false,
  reviewed_by text,
  reviewed_at timestamptz,
  start_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at > start_at),
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ros_campaign_policies_status_idx ON ros_campaign_policies (status);
