-- Private encrypted receiver credentials; does not grant consent to transmit mail.
CREATE TABLE IF NOT EXISTS public.uberwarm2_receiver_bindings (
  receiver_email text PRIMARY KEY,
  provider_user_id text NOT NULL,
  credential_json jsonb NOT NULL,
  authorization_ref text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
COMMENT ON TABLE public.uberwarm2_receiver_bindings IS
  'AES-256-GCM protected receiving credentials; enabled means authorized read access only, never seed-send consent.';
