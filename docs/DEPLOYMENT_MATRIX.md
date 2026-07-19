# Deployment matrix

Status is based on demonstrated behavior, not planned code. The production Lite audit service and the acquisition system are separate deployment units.

## Deployment targets

| Target | Current state | Evidence / next boundary |
|---|---|---|
| Cash Engine Lite — `uberbondd-lite-private` | Working production system, owner-verified end-to-end | Vercel form → Neon queue → existing GitHub Actions browser audit → private report. This milestone did not modify or redeploy it. |
| Obsolete Vercel project — `uberbondd` | Ignored | Not a valid target; do not deploy to it. |
| Acquisition Web service | Not deployed | Provider-independent Web code and local tests exist; needs a separate HTTPS host, PostgreSQL, secrets, and owner authentication. |
| Acquisition persistent Worker | Not deployed | Worker code is tested locally; needs a separate runtime sharing the acquisition PostgreSQL database. |
| Acquisition GitHub Actions workers | Implemented locally, not published | Safe scheduled workflow contains no live-send job. Remote publication is blocked by GitHub write authentication. |
| Acquisition PostgreSQL | Test-proven, not provisioned for production | Migrations and PGlite/PostgreSQL behavior are tested; owner must provision `ACQUISITION_DATABASE_URL`. |

## Capability status

| Category | Capability | Demonstrated status |
|---|---|---|
| Fully operational | Cash Engine Lite audit flow | Owner-verified on `https://uberbondd-lite-private.vercel.app`; deliberately unchanged. |
| Fully operational | Deterministic local acceptance | `npm run acceptance` demonstrates 19 transitions from fixture discovery through one delivery task with assertions. |
| Fully operational | Campaign validation and safety invariants | Deterministic tests reject unknown/credential fields, invalid caps/windows, and unsafe activation combinations. |
| Operational in dry-run | Discovery, normalization, deduplication, import, crawl, audit, score, public contact extraction, evidence-locked drafting, owner approval, and cockpit projection | Local deterministic, integration, browser, probe, and acceptance tests pass; no production acquisition deployment exists yet. |
| Operational in dry-run | Gmail send, reply classification, follow-up stop, bounce/complaint/suppression logic, threading, and sender health | Test Gmail and deterministic reply fixtures pass; no real Gmail call occurs in CI or acceptance. |
| Operational in dry-run | Offer, checkout state, signed test webhook, paid order, and delivery task | Acceptance verifies raw-body HMAC, test mode, amount/currency linkage, idempotent paid state, and one delivery task. |
| Operational in dry-run | Scheduled acquisition workers | Bounded modes, queue leases, locks, timeouts, and privacy-safe summaries are tested; workflow is local until GitHub publication succeeds. |
| Blocked by Gmail authentication | Live Gmail OAuth, real sending, real reply synchronization, and live sender-health validation | Requires owner Google OAuth app, sender-domain SPF/DKIM/DMARC, controlled mailbox tests, and explicit live activation. |
| Blocked by payment-provider authentication | Live Lemon Squeezy checkout and webhook reconciliation | Requires owner store/products, live/test checkout URLs, webhook secret, and an authorized provider test-mode transaction before any live switch. |
| Optional paid enhancement | Hunter contact enrichment | Basic first-party website contact discovery works without it; guessed addresses never become verified. |
| Optional paid enhancement | OpenAI or Anthropic copy/audit enhancement | Rules-only operation works. AI output remains evidence-gated and cannot override deterministic findings. |
| Optional paid enhancement | External object storage | PostgreSQL artifacts support the initial architecture; external storage is a later scale option. |
| Intentionally disabled for safety | Live outbound and campaign auto-send | System disabled, dry-run true, provider test, independent live approval false. |
| Intentionally disabled for safety | Real email in tests/CI | Acceptance asserts one simulated call and zero real emails. |
| Intentionally disabled for safety | Automatic negotiation, proposal sending, payment request, or customer-site modification | Owner approval and explicit customer authorization remain mandatory. |
| Intentionally disabled for safety | Open pixels, deceptive tracking, LinkedIn scraping, purchased lists, CAPTCHA or anti-spam evasion | Not implemented and prohibited by policy. |

## Verification boundary

The acceptance harness proves local provider-independent behavior only. It does not establish deliverability, legal basis in a jurisdiction, remote workflow availability, Gmail account health, a real payment event, or a deployed acquisition service. Those remain owner-authentication and controlled-validation tasks in `docs/OWNER_AUTHENTICATION_CHECKLIST.md`.

The exact local and remote commit SHAs, test results, publication blocker, and recovery artifacts are maintained in `docs/night-shift/NIGHT_SHIFT_STATE.md`.
