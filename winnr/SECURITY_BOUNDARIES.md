# Winnr Security Boundaries

## Secrets never stored here

This directory must never contain:
- mailbox passwords;
- Winnr API tokens;
- Render admin tokens;
- `TOKEN_ENCRYPTION_KEY`;
- blind-tunnel bearer tokens;
- plaintext credential CSV;
- card/payment credentials;
- raw authenticated session material.

## Credential custody

Mailbox credentials belong only in protected runtime custody encrypted at rest.

The repository may preserve:
- hashes/digests;
- counts;
- nonsecret domain/provider identifiers;
- sanitized status receipts;
- source commit/deploy ids;
- evidence pointers.

## Blind tunnel boundary

The fixed-host relay exists only to overcome the Render -> Winnr TCP/465 network path.

It must remain:
- authenticated;
- fixed-host;
- port-restricted;
- blind to inner SMTP plaintext;
- unable to choose arbitrary destinations;
- unable to become a general-purpose proxy.

Render must continue to perform the inner TLS handshake and Winnr certificate validation.

## Authority

Transport capability does not authorize prospect outreach.

A prospect send additionally requires the existing UberBond legal/provider/suppression/sender-health/content/consequence gates.

No model, worker, relay, database or provider adapter may self-grant broader messaging or spend authority.
