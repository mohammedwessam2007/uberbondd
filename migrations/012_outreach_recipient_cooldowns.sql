BEGIN;

CREATE INDEX IF NOT EXISTS outbound_reservations_recipient_cooldown_idx
  ON outbound_reservations(recipient_email, reserved_at DESC)
  WHERE status IN ('reserved','dispatching','sent','uncertain');

CREATE INDEX IF NOT EXISTS outbound_reservations_business_domain_cooldown_idx
  ON outbound_reservations((COALESCE(NULLIF(data->>'businessDomain',''), split_part(recipient_email,'@',2))), reserved_at DESC)
  WHERE status IN ('reserved','dispatching','sent','uncertain');

INSERT INTO schema_migrations(version)
VALUES ('012_outreach_recipient_cooldowns')
ON CONFLICT DO NOTHING;

COMMIT;
