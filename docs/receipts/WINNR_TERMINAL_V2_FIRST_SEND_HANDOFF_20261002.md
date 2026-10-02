# WORK_FIRST_SEND_HANDOFF — Terminal Execution Constitution V2 — 2026-10-02

Truth class: SOURCE RECONCILIATION + GATE MAPPING. No message was sent. No production state was read or changed from this session.

## Highest verified level

LEVEL 2 — CURRENT MAIN GREEN (PR #1165 reconciled onto main `f1da60a` and merged; see merge receipt below).
Levels 3+ (production SHA, live sender state, identity, prospect, approval, send) were **not** verified in this session.

## PR #1165 disposition

- "Not mergeable" was stale topology only: main's three newer commits (`59231d5`, `2c76e1d`, `f1da60a`) touch prompt docs, `CLAUDE.md`, `00_OUTREACH_NOW.md` and `winnr/README.md`. `git merge-tree` against main was clean.
- Reconciled by merging main into the PR branch (merge commit; no rebase or force-push on the codex branch).
- Behavior unchanged: `smtp-relay` is accepted by the canary approval endpoint only when `selectFleetMailbox` confirms the exact sender slot already stored on the draft. Missing, paused, disconnected, unauthorized and IMAP-only senders are refused, and no other sender is substituted.
- Focused suite on the reconciled head: 38/38 pass across 11 files (approval handler, smtp-relay governance, pipeline fleet, uberfleet, live canary, operator, governed dispatch, SMTP submission adapter, reply-canary verifier, launch gate, provider events).
- Mutation evidence:
  - removing the fleet-allocation check fails 1/3 handler tests;
  - removing `smtp-relay` from the provider allow-list fails 3/3.
- Full deterministic suite (1,183 files): 8,692 pass / 34 fail / 54 skipped. The identical 34 fail on unmodified main `f1da60a` (16 files: stale canon/constitution/genome receipts, reachability/coverage ratchets, three fixture files with pre-existing syntax errors, OpenRouter/Opus/ghost-agent suites). Classification: PRE-EXISTING BASELINE, none introduced by this change; full suite not claimed green.

## Production lane — frozen (environment, not source)

- Production runtime per repo canon: Render, `https://uberbond-control-plane.onrender.com`, build `npm install --omit=dev`.
- This cloud session's network policy denies CONNECT to `*.onrender.com` (proxy 403). The session also holds no `ADMIN_TOKEN` or Render credential.
- Result: deployed SHA, sender registry, quarantine, caps, saved identity and campaign state are **UNKNOWN from this session**. They were not inferred.
- Vercel `api-deployments-free-per-day` affects previews only; it does not decide production.

## Binding finding — current source refuses cold first touch on every provider

`src/outreach-governance.mjs` `providerRoutePolicy`: `gmail-api`, `postal` and `smtp-relay` each accept only `SOLICITED_APPLICATION`, `EXPLICIT_CONSENT` and `REQUESTED_INFORMATION`. A `PUBLIC_BUSINESS_CONTACT` (cold B2B) route returns `smtp-relay-cold-route-requires-separate-provider-and-legal-evidence`. PR #1165's own test asserts that refusal.

So even with identity, a green sender and an approved payload, the offer-quartet cold first touch **cannot** be approved by current code. Widening that policy is an authority and legal decision. Under the "capability never creates authority" and "never weaken a guard" laws it was **not** changed here.

Lawful routes the current code already supports:

1. `SOLICITED_APPLICATION` — a public posting that asks for contractor or proposal submissions by email. Precedent exists in `data/opportunity-factory/seed-register.json`, but those entries expired in August 2026. A bounded fresh search on 2026-10-02 found no fitting current posting.
2. `REQUESTED_INFORMATION` / `EXPLICIT_CONSENT` — someone who has asked for the artifact, for example by inbound reply or form.

## Identity gate — exact field set (OWNER_FACT_REQUIRED)

There are two layers; both need owner-supplied truth:

- **Runtime approval layer** (`server-core.mjs` `saveOwnerBusinessIdentity`, admin form `#owner-identity-form` → `POST /api/owner/business-identity`):
  - `legalName` (≥2 chars)
  - `postalAddress` (≥12 chars, physical)
  - optional `senderName` and `company`
- **Launch-facts layer** (`src/uberpostal-identity.mjs`):
  - `legalName`
  - `line1`, `city`, `country`
  - `ownerAuthorized=true`
  - `publicFooterAuthorized=true`
  - a non-placeholder `postalEvidenceRef`

No authorized publishable address exists in the repository. None was invented.

## Owner queue (max 3)

1. **Decision — cold route authority.** Either keep solicited/consented-only, or authorize a bounded `PUBLIC_BUSINESS_CONTACT` route for `smtp-relay`. That needs a named jurisdiction (for example US under CAN-SPAM), recipient type (business role address), the current Winnr terms reference, and a cap. Without it, no quartet cold email can be approved. Cost: $0. Consequence: defines legal exposure.
2. **Fact — publishable identity.** Open `/admin` on the control plane, find the Owner identity form, enter a legal/business name and a physical address you authorize for public email footers (a business PO box or virtual office is acceptable if real), then save. About 2 minutes, $0.
3. **Environment — optional.** Add `uberbond-control-plane.onrender.com` to this cloud environment's allowed network domains, and provide an admin credential through environment secrets, so a future session can read live sender, caps and identity state instead of handing it off.

## Automatic continuation after the owner acts

- **After (2):** run the launch-facts doctor and confirm `UBERPOSTAL_IDENTITY_READY`.
- **After (1), or once a solicited/consented recipient exists:**
  1. re-research one recipient;
  2. bind the route evidence (sourceUrl, excerpt digest, jurisdiction, ≤7-day expiry);
  3. confirm the stored sender is ordinal 1 or 2 (ordinal 3 stays quarantined);
  4. call `POST /api/outbound/approve-prospect` for exactly one prospect;
  5. send exactly one message;
  6. reconcile it as `SMTP_ACCEPTED`, `BOUNCED`, `REPLIED` or `UNKNOWN_AFTER_EFFECT`.

## Effects ledger

New spend $0 · prospect messages 0 · owner seed messages 0 · credential changes 0 · production mutations 0 · quarantine changes 0.
