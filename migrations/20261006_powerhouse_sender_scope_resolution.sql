BEGIN;

-- Exact-prospect, narrow sender-side scope resolution. This does not grant send
-- authority. It records the already-reviewed material-scope classification for
-- the Powerhouse company-only generic role inbox so the canonical effect
-- compiler can consume it. Every other prospect remains unchanged.
UPDATE prospects
SET data = jsonb_set(
      data,
      '{preflightContext}',
      coalesce(data->'preflightContext', '{}'::jsonb)
      || jsonb_build_object(
        'senderSide',
        jsonb_build_object(
          'resolved', true,
          'operatorLocation', 'EG',
          'senderEntityJurisdiction', 'EG',
          'controllerJurisdiction', 'EG',
          'resolutionRef', 'docs/receipts/POWERHOUSE_EG_COMPANY_ONLY_SCOPE_20261006.md',
          'resolutionScope', 'FOREIGN_COMPANY_GENERIC_ROLE_INBOX_NO_NATURAL_PERSON_DATA',
          'sendAuthority', false
        )
      ),
      true
    ),
    updated_at = now()
WHERE id = 'pros_d8ced49c-38e1-4d70-8b3d-61a1a2533377'
  AND lower(domain) = 'mypowerhouse.group'
  AND lower(coalesce(data#>>'{contact,email}', '')) = 'hello@mypowerhouse.group'
  AND lower(coalesce(data#>>'{preflightRecord,recipient,email}', '')) = 'hello@mypowerhouse.group'
  AND upper(coalesce(data#>>'{preflightRecord,recipient,jurisdiction}', data#>>'{preflightRecord,hqCountry}', '')) = 'US'
  AND coalesce((data#>>'{preflightRecord,recipient,namedPersonEvidence,present}')::boolean, false) = false;

INSERT INTO schema_migrations(version)
VALUES ('20261006_powerhouse_sender_scope_resolution')
ON CONFLICT DO NOTHING;

COMMIT;
