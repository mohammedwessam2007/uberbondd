# UberWarm 1–6: no-paid provider-DNS hold control

Date: 2026-10-18. Evidence class: source tests only until exact Railway deployment and readback.

## Scope and reasoning

Winnr's normal inbox-read/send API is included in the existing account (official API introduction at https://winnr.app/help/api-mcp/api-intro.html). The separate paid warming network is optional. This change purchases nothing, sends zero emails, and contacts no provider. It strengthens UberWarm's owned *read-only* control plane rather than outsourcing reputation decisions.

The existing live `GET /domains?limit=100` returns `dns_status=complete` for the 11 presently observed domains. Previously the mathematical fleet observer checked exact email/domain membership and status=active, but could not quarantine a previously active mailbox when its provider domain later reported `dns_status=pending/failed/unknown`. The corrected observer separately records the number of DNS-ready and DNS-unready domains, counts affected mailboxes exactly once, sets affected mailbox state to QUARANTINED and emits `SOVEREIGN_CONTROL_PROVIDER_DNS_HOLD`. The operational journal allowlists these aggregate fields; raw mailbox addresses, tokens and individual domain names do not enter the journal.

Strict distinction: `dns_status=complete` is **Winnr provider-reported DNS status**, not independent authentication, message-level DKIM/SPF/DMARC alignment, sender permission, recipient consent or Inbox placement. Those require the existing trusted signed readers, owner-controlled recipient opt-in, expiring exact-batch approval, atomic PostgreSQL one-shot reservation, provider Message-ID and separately observed receipt. This change cannot grant external send authority, raise daily caps, enable paid warming or synthesize engagement.

## Verification before release

- `node --test tests/uberwarm2-*.test.mjs`: 232 tests, 230 passed, 0 failed, 2 skipped (including configured real PostgreSQL integration unavailable locally).
- `node --test tests/canon-freshness.test.mjs`: 6 passed, 0 failed.
- `node --test tests/uberwarm2-sovereign-live-observer.test.mjs`: 8 passed, 0 failed.
- `git diff --check`: no whitespace errors.
- Hostile cases: unavailable, malformed or negative DNS status; mixed known/unknown domains; current Active mailboxes on a failed domain; aggregate receipt without addresses; and non-promotion of real sending rights.

Source test success is not actual provider sending. The previously active Railway monitor at SHA `fa6b2d66e8257c7a29040d1abe8238f7ab81c154` remains read-only: 53 provider-reported Active mailboxes, 11 domains, zero provider sends, zero PostgreSQL claims and missing current recipient consent. Do not enable the Winnr warming add-on, invent its subscribers, simulate replies, send prospect mail, or issue fake signatures.
