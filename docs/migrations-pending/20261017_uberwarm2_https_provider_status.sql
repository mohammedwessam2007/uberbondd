-- Additive compatibility step for installations that already applied
-- 20261012_uberwarm2_seed_one_shot.sql before HTTPS provider support.
-- NOT wired into automatic startup migration. Requires owner-authorized
-- schema runner on the exact authoritative PostgreSQL primary.
-- Data and existing claims are preserved; no email is sent.
BEGIN;
DO $guard$
BEGIN
  IF to_regclass('public.uberwarm2_seed_probe_claims') IS NULL THEN
    RAISE EXCEPTION 'uberwarm2 primary one-shot claims table must exist before HTTPS status upgrade';
  END IF;
END;
$guard$;
ALTER TABLE public.uberwarm2_seed_probe_claims
  DROP CONSTRAINT IF EXISTS uberwarm2_seed_probe_claims_submitted_state_check;
ALTER TABLE public.uberwarm2_seed_probe_claims
  ADD CONSTRAINT uberwarm2_seed_probe_claims_submitted_state_check
  CHECK (submitted_state IN (
    'RESERVED',
    'SMTP_ACCEPTED_PLACEMENT_UNKNOWN',
    'PROVIDER_ACCEPTED_PLACEMENT_UNKNOWN',
    'SUBMISSION_OUTCOME_UNCERTAIN'
  ));
COMMIT;
