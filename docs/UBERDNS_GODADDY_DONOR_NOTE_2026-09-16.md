# UberDNS GoDaddy donor note — 2026-09-16

Current official GoDaddy Domains API documentation exposes account-scoped DNS management and a v3 zone API using bearer Personal Access Tokens. UberBond should treat GoDaddy as a replaceable DNS supplier, not authority root. The sovereign interface is UberDNS; provider adapters translate an exact mutation plan into provider calls and return evidence receipts. No provider credential is stored in source.

Source references:
- https://developer.godaddy.com/en/docs/api-users/domains
- https://developer.godaddy.com/en/docs/api-users/domains/manage/dns

Implementation rule: no DNS write without an exact plan digest, explicit owner mutation authorization, a runtime credential with DNS-update scope, an idempotency key, and post-write public-DNS verification. Provider acceptance is not equivalent to external propagation.
