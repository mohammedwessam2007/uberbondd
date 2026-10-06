BEGIN;

-- Bind the already-reviewed Egypt company-only material-scope evidence to the
-- exact Powerhouse prospect only. This does NOT create a general cold-email
-- permission and does not alter named-person or ambiguous-contact policy.
UPDATE prospects
SET data = jsonb_set(
      data,
      '{preflightContext,senderSide}',
      jsonb_build_object(
        'legalAuthorityStatus', 'CLEARED_COMPANY_ONLY_MATERIAL_SCOPE',
        'resolutionRef', 'policy/outreach/global-policy-evidence.json#sender:EG:corporate-role-no-personal-data',
        'scopeRef', 'docs/receipts/GLOBAL_GREEN_LANE_ROUTER_20261003.md',
        'scopeClass', 'PUBLIC_COMPANY_ROLE_INBOX_NO_NATURAL_PERSON_DATA',
        'reviewedAt', '2026-10-06T10:45:00Z',
        'reviewBasis', 'current-main-policy-evidence'
      ),
      true
    ),
    updated_at = now()
WHERE id = 'pros_d8ced49c-38e1-4d70-8b3d-61a1a2533377'
  AND lower(domain) = 'mypowerhouse.group'
  AND data #>> '{contact,email}' = 'info@mypowerhouse.group'
  AND coalesce(data #>> '{recipient,namedPersonEvidence,status}', 'NONE') <> 'NAMED_PERSON';

INSERT INTO schema_migrations(version)
VALUES ('20261006_bind_powerhouse_company_only_scope')
ON CONFLICT DO NOTHING;

COMMIT;
