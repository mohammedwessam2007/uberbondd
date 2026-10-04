BEGIN;

-- The protected businessIdentity row already contains the owner-supplied legal
-- identity and postal address. The founder explicitly authorized publication of
-- that stored mailing address in commercial-email footers on 2026-10-03.
-- Record only the authorization bit and provenance here: no identity/address
-- values are copied into source control.
UPDATE settings
SET value = value
  || jsonb_build_object(
    'footerUseAuthorized', true,
    'footerAuthorizationSource', 'founder-explicit-2026-10-03'
  ),
  updated_at = now()
WHERE key = 'businessIdentity'
  AND jsonb_typeof(value) = 'object'
  AND length(btrim(coalesce(value->>'legalName', ''))) >= 2
  AND length(btrim(coalesce(value->>'postalAddress', ''))) >= 12
  AND coalesce(value->>'footerUseAuthorized', 'false') <> 'true';

-- The legacy owner identity endpoint replaces the JSON object and historically
-- omitted footerUseAuthorized. Preserve an existing explicit TRUE only when a
-- later update omits that key. An explicit FALSE remains a valid revocation and
-- is never overwritten by this trigger.
CREATE OR REPLACE FUNCTION preserve_business_identity_footer_authorization()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.key = 'businessIdentity'
     AND TG_OP = 'UPDATE'
     AND NOT (NEW.value ? 'footerUseAuthorized')
     AND coalesce(OLD.value->>'footerUseAuthorized', 'false') = 'true' THEN
    NEW.value := NEW.value || jsonb_build_object(
      'footerUseAuthorized', true,
      'footerAuthorizationSource', coalesce(
        OLD.value->>'footerAuthorizationSource',
        'founder-explicit-2026-10-03'
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS settings_preserve_business_identity_footer_authorization ON settings;
CREATE TRIGGER settings_preserve_business_identity_footer_authorization
BEFORE UPDATE ON settings
FOR EACH ROW
EXECUTE FUNCTION preserve_business_identity_footer_authorization();

INSERT INTO schema_migrations(version)
VALUES ('20261005_preserve_owner_footer_authorization')
ON CONFLICT DO NOTHING;

COMMIT;
