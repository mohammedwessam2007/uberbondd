BEGIN;

-- PR #7 repair, finding C-P0-003: a single content hash over the FULL approved recipient set
-- cannot ever match a per-recipient eligibility check computed over one recipient at a time --
-- migration 008's campaign_activation_approvals alone was structurally unable to authorize
-- individual members of a cohort. This table materializes the frozen cohort as exactly N
-- individually-claimable member rows: "one 100-company approval authorizes only those 100
-- members" becomes literally true because exactly 100 rows exist, each claimable at most once.
CREATE TABLE IF NOT EXISTS campaign_cohort_members (
  id text PRIMARY KEY,
  approval_id text NOT NULL REFERENCES campaign_activation_approvals(id) ON DELETE CASCADE,
  organization_domain text NOT NULL,
  recipient_email text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  first_touch_reservation_id text REFERENCES outbound_reservations(id) ON DELETE SET NULL,
  created_at timestamptz,
  updated_at timestamptz,
  data jsonb NOT NULL
);

-- Exactly one member row per organization per approval -- this IS the "at most one first touch
-- per member" guarantee; a second attempt to insert the same (approval, org) pair is rejected at
-- the schema level, not merely by application convention.
CREATE UNIQUE INDEX IF NOT EXISTS campaign_cohort_members_org_unique
  ON campaign_cohort_members(approval_id, organization_domain);
CREATE UNIQUE INDEX IF NOT EXISTS campaign_cohort_members_recipient_unique
  ON campaign_cohort_members(approval_id, recipient_email);
CREATE INDEX IF NOT EXISTS campaign_cohort_members_status_idx
  ON campaign_cohort_members(approval_id, status);

INSERT INTO schema_migrations(version)
VALUES ('009_canon_cohort_repair')
ON CONFLICT DO NOTHING;

COMMIT;
