BEGIN;

-- One owner-authorized frozen-effect provider call crossed the SMTP boundary on
-- 2026-10-04, then the post-dispatch ledger transaction rolled back because
-- outbound_events.provider_event_id did not exist. The provider acceptance
-- result and reference were lost. Preserve the only defensible production
-- truth: one provider call, customer delivery UNKNOWN_0_OR_1, no replay.
--
-- This migration does not infer ACCEPTED or REJECTED, does not create send
-- authority, and does not contact the recipient. It only reconciles the stale
-- durable DISPATCHING state left by the failed receipt transaction.

UPDATE settings
SET value = value || jsonb_build_object(
      'status', 'UNCERTAIN_RECONCILIATION_REQUIRED',
      'providerCallAttempted', true,
      'effectCapRemaining', 0,
      'reconciliationRequired', true,
      'automaticRetryAuthorized', false,
      'reconciliation', jsonb_build_object(
        'schemaVersion', 'uberbond.frozen-effect-reconciliation.v1',
        'truth', 'PROVIDER_CALL_RETURNED__ACCEPTANCE_UNKNOWN__DELIVERY_UNKNOWN',
        'providerCalls', 1,
        'customerMessages', 'UNKNOWN_0_OR_1',
        'smtpAcceptance', 'UNKNOWN',
        'providerReferenceId', NULL,
        'providerMessageId', NULL,
        'persistenceErrorAt', '2026-10-04T12:11:57.607011Z',
        'replayProhibited', true,
        'automaticRetryAuthorized', false,
        'evidenceRef', 'docs/receipts/FROZEN_PROSPECT_CANARY_RECONCILIATION_2026-10-04.md'
      )
    ),
    updated_at = now()
WHERE key = 'frozenProspectExecution:65b86bf22f1060ee307020ac8f304e55f788ccd88cba10d37108bae35c804347'
  AND COALESCE(value->>'effectDigest', '') = '65b86bf22f1060ee307020ac8f304e55f788ccd88cba10d37108bae35c804347'
  AND COALESCE(value->>'status', '') <> 'SENT';

UPDATE outbound_reservations
SET status = 'uncertain',
    completed_at = COALESCE(completed_at, now()),
    updated_at = now(),
    data = COALESCE(data, '{}'::jsonb) || jsonb_build_object(
      'status', 'uncertain',
      'provider', 'smtp-relay',
      'providerReferenceId', NULL,
      'providerMessageId', NULL,
      'effectDigest', '65b86bf22f1060ee307020ac8f304e55f788ccd88cba10d37108bae35c804347',
      'reconciliationState', 'UNKNOWN_DELIVERY_NO_RETRY',
      'automaticRetryAuthorized', false,
      'reconciliationRequired', true,
      'completedAt', COALESCE(data->>'completedAt', now()::text),
      'reconciledAt', now()::text
    )
WHERE idempotency_key = 'frozen-effect:65b86bf22f1060ee307020ac8f304e55f788ccd88cba10d37108bae35c804347'
  AND status IN ('reserved', 'dispatching');

-- Add a canonical prior-contact marker without claiming provider acceptance.
-- This prevents a later differently-digested "first touch" from treating the
-- same recipient as clean merely because the original event insert rolled back.
INSERT INTO outbound_events (
  id, inbox, event_type, prospect_id, recipient_email, occurred_at,
  created_at, updated_at, provider_event_id, data
)
SELECT
  'frozen-reconcile-65b86bf22f1060ee307020ac8f304e55',
  inbox,
  'send_uncertain',
  prospect_id,
  recipient_email,
  TIMESTAMPTZ '2026-10-04T12:11:57.607011Z',
  now(),
  now(),
  NULL,
  jsonb_build_object(
    'id', 'frozen-reconcile-65b86bf22f1060ee307020ac8f304e55',
    'inbox', inbox,
    'eventType', 'send_uncertain',
    'prospectId', prospect_id,
    'recipientEmail', recipient_email,
    'occurredAt', '2026-10-04T12:11:57.607011Z',
    'detail', jsonb_build_object(
      'effectDigest', '65b86bf22f1060ee307020ac8f304e55f788ccd88cba10d37108bae35c804347',
      'provider', 'smtp-relay',
      'providerReferenceId', NULL,
      'providerMessageId', NULL,
      'truth', 'DELIVERY_UNKNOWN_0_OR_1',
      'automaticRetryAuthorized', false,
      'evidenceRef', 'docs/receipts/FROZEN_PROSPECT_CANARY_RECONCILIATION_2026-10-04.md'
    ),
    'createdAt', now()::text,
    'updatedAt', now()::text
  )
FROM outbound_reservations
WHERE idempotency_key = 'frozen-effect:65b86bf22f1060ee307020ac8f304e55f788ccd88cba10d37108bae35c804347'
LIMIT 1
ON CONFLICT (id) DO NOTHING;

INSERT INTO schema_migrations(version)
VALUES ('20261004_reconcile_frozen_intelo_canary')
ON CONFLICT DO NOTHING;

COMMIT;
