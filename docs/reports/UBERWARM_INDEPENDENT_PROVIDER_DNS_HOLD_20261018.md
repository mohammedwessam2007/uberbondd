# UberWarm 1–6: provider DNS hold without Winnr paid warming

Date: 2026-10-18. Truth class: source candidate, pending exact-head hosted verification and live deployment.

The Winnr API's ordinary inbox sending capability is separate from its optional paid warming add-on. `src/uberwinnr-adapter.mjs` already implements one protected HTTPS inbox-send; `zeroPaidRouteDenial` prevents paid warming/billing routes. This release does not purchase, send or enable the add-on.

The existing 53-mailbox read-only sovereign observer now cross-checks the **provider-reported** per-domain `dns_status` (`complete`, `ready`, `verified`) before aggregating its mathematical reputation decisions. Unknown, missing or adverse DNS status causes `SOVEREIGN_CONTROL_PROVIDER_DNS_HOLD`; affected mailboxes are counted as `QUARANTINED`, and the observer continues to report `admittedToSend=0`. A healthy reported DNS status still leaves the mailbox `BLOCKED` until independently verified sender authentication, local holds, signed transport scope and recipient approval exist. Provider DNS status is neither cryptographic proof of DKIM/DMARC alignment nor evidence of a delivered message.

The operational PostgreSQL journal allowlists counts only: DNS-ready domains, DNS-unready domains and affected mailbox count. It does not persist individual mailbox or recipient addresses. Adverse or absent provider DNS status cannot be interpreted as a permission to send. Existing protected one-shot approval, suppression, ledger and receiver evidence gates are unchanged.

Source verification: isolated `npm ci --ignore-scripts --no-audit --no-fund` succeeded (21 packages, no lifecycle scripts). `node --test tests/uberwarm2-*.test.mjs`: **232 total, 230 passed, 0 failed, 2 skipped**. `node --test tests/canon-freshness.test.mjs`: 6 passed. `git diff --check`: clean. Real Railway runtime and PostgreSQL readback after the merge must be verified separately; no new send proof is inferred from passing source tests.

Known real owner/provider gates: an actual signed current sender-specific hold/transport/DNS alignment verdict, authenticated opt-in for the precise recipient and approved immutable single-message batch, one-one-shot provider Message-ID and recipient-side Inbox/Spam observation. As of the inspection, the connected Gmail inbox contains the opt-in request, **not an affirmative response**. Winnr support need not be contacted again; its public API docs document included ordinary mailbox sending. No external message is transmitted by this change.
