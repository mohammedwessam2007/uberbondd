# UberWarm 1–6: rotating authenticated DNS spotcheck on existing included API

Date: 2026-10-19 (Africa/Cairo). Truth class: source implementation, with deployment and live-provider findings to be separately recorded after release.

## Purpose

Build on the production sovereign no-paid-warmup fleet monitor, rather than ask Winnr to sell or waive a warming add-on. Before this change the five-minute monitor trusted domain-list `dns_status` for aggregate risk holds and a sender-targeted detailed DNS GET was only available via a manual `--email` option. This patch makes a single authenticated provider DNS detail GET routine on every eligible five-minute monitor invocation, rotating across available unique domains by time slot, independent of provider list ordering.

## Implemented

- `src/uberwarm2-provider-dns-spotcheck.mjs`: deterministic one-domain-per-run read-only caller of injected `getDnsStatus` for a whole, unique DNS domain inventory. Rejects missing/duplicate/mismatched provider identity, missing response digest, incomplete MX/SPF/DKIM/DMARC setup, missing `ns_status`, invalid clock and exceptions. Returned fields are ONLY aggregate; no domain names, IDs or provider credentials in output. No send methods, paid endpoints or recipient interaction.
- `scripts/uberwarm2-live-read-doctor.mjs`: attaches one `providerDnsSpotcheck` to existing authenticated full-account GET inventory and accounts for the extra provider GET; previous optional sender-specific diagnostics remain available.  `status=...REPORTED_READY` means Winnr reports setup of these exact four DNS record categories, NOT an independent proof of signed delivery, domain alignment or recipient consent.
- `src/uberwarm2-operational-journal.mjs`: stores only the redacted bounded spotcheck counters in the existing PostgreSQL operational receipt; absence or bad result never becomes send approval.
- `Dockerfile.uberwarm-read-monitor`: copies precisely the new import dependency into the existing production image. No new service, billable provider, domain, credential or database schema.

## Evidence and truth

Focused suite: 13 pass, 1 skipped, no failures (`tests/uberwarm2-provider-dns-spotcheck.test.mjs` + preexisting operational image/journal tests). Full `node --test tests/uberwarm2-*.test.mjs`: **239 tests, 237 pass, 0 fail, 2 skipped** with a source-only embedded PostgreSQL fixture. `npm ci --ignore-scripts --no-audit --no-fund` succeeds in isolated clean checkout. `git diff --check` clean.

All mailboxes remain gated on independently real sender-specific permission/holds and exact owner-controlled recipient approval. This read-only GET does **not** warm accounts, send mail, claim a delivery, issue a signature, bypass third-party billing or exercise the `POST /inbox/send` endpoint. Existing sender cap and one-shot ledger remain as implemented. Production status requires exact SHA Railway deployment and observed logs, not code/test evidence alone.
