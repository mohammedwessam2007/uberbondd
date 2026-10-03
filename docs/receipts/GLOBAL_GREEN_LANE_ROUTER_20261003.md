# Global Green-Lane Router — software closure receipt, 2026-10-03

Truth class: `INTERNAL_SOFTWARE_CLOSURE__NO_EXTERNAL_PROOF`. Base: `1e600fd193fa2ca0d7590bbb0751150d1a3e8363` (main). Machine receipt: [`artifacts/outreach/global-green-lane-router-20261003.json`](../../artifacts/outreach/global-green-lane-router-20261003.json).

Mission: make UberBond global by default — for each economic objective and prospect, choose the lowest-friction **lawful** commercial route or abstain. This is constraint arbitrage, never rule evasion. GREEN means "policy and evidence prerequisites are met"; it is **never** send authority.

## What now exists (and where)

| Organ | Module | Notes |
|---|---|---|
| Router | `src/global-green-lane-router.mjs` | `INVITED_GREEN`, `CORPORATE_GREEN`, `US_CANSPAM_GREEN`, `PERMISSIONED_GREEN`, `CONSPICUOUS_PUBLICATION_GREEN`, `CONDITIONAL`, `CONSENT_REQUIRED`, `DO_NOT_SEND`, `UNKNOWN_FAIL_CLOSED`. `sendReady` is constant `false`. Reports sender-side law as its own gate, never lifts a sender-side hold. |
| Law logic | `src/uberoutbound-recipient-eligibility.mjs` (extended, not duplicated) | New `evaluationScope: RECIPIENT_SIDE_ONLY`, `namedPerson`, SG source/hold, more role-inbox local parts. The router owns no legal rule of its own. |
| Policy evidence | `src/global-policy-evidence.mjs`, `policy/outreach/global-policy-evidence.json`, `scripts/global-policy-evidence.mjs` | 16 catalogued rules. Authority types `LAW / REGULATOR_GUIDANCE / PROVIDER_POLICY / UBERBOND_CONSERVATIVE_POLICY / OWNER_AUTHORITY` stay separate; `OWNER_AUTHORITY` satisfies no rule. Freshness: provider 30d, regulator 180d, law 365d, conservative 365d. Missing/stale/revoked evidence → `POLICY_REFRESH_REQUIRED` with exact rule ids and seed source URLs and a visible provisional class. |
| Registry adapter | `src/company-registry-adapter.mjs`, `src/companies-house-adapter.mjs` | Provider-neutral, zero-cost only (a paid adapter is refused). Exact-name match only; same-name → `AMBIGUOUS`; 550/5min budget; 429 never retried; digest-checked cache; credential never in output; no key → `CREDENTIAL_MISSING` (fail closed). |
| UK legal form | `src/corporate-legal-form-verifier.mjs` | Website claims never verify. Needs registry FOUND + number/exact-name equality + active + corporate-mapped type + domain reconciliation + evidence ≤7 days old. Sole traders / unknown forms never become corporate. |
| Inbox / invitation / source | `src/recipient-address-classifier.mjs`, `src/invited-contact-classifier.mjs`, `src/contact-source-verifier.mjs` | Generic role inbox vs named person vs system vs personal vs guessed. A generic Contact page is not an invitation; prompt-injection text is rejected as evidence; an invitation raises priority only, not legal consent. |
| Tournament / economics | `src/global-route-tournament.mjs`, `src/global-route-economics.mjs` | Only permitted routes rank; unknown cost ≠ 0 (penalty, `costKnown:false`); no send-volume term; priors labelled `ESTIMATED_PRIOR_NOT_MEASURED`; cleared payments only from provider-reconciled truth; no route split invented without a stamp. |
| One-button truth | `src/green-lane-activation-truth.mjs` | Displays `GREEN ROUTE FOUND` / `POLICY REFRESH REQUIRED` / state, with every gate (suppression, history, identity, sender, provider, effect, authorization) separately read; unreported gates are `UNKNOWN`, never `PASS`. |
| Lead generator | `src/green-lane-discovery.mjs`, `src/lead-generation.mjs`, `src/prospect-preflight-handoff.mjs` | `GREEN_LANE_ONLY` mode: evaluates every corpus prospect, returns only green rows, reports `INSUFFICIENT_GREEN_SUPPLY` instead of filling. A clean-route prospect outranks a nominally superior unresolved one. |
| Preflight | `src/prospect-preflight.mjs`, `src/prospect-effect-package.mjs`, `src/prospect-verification-intake.mjs` | Canonical preflight extended (no second preflight): global jurisdiction intake, registry lookup, router, route gate, US cold envelope, tournament, effect package. New states `BLOCKED_ROUTE`, `BLOCKED_POLICY_REFRESH`. Route binding is part of the final effect digest; `verifyRouteEffectBinding` detects any post-approval mutation. |
| HTTP / UI | `server-core.mjs`, `public/admin.html`, `public/prospect-preflight-ui.js` | `GET /api/outreach/green-lane/status`, `GET /api/prospect-preflight/candidates?mode=GREEN_LANE_ONLY`, `routeEconomics` on `/api/outreach/economics`. All admin-authenticated, read-only. |

## Honest current state

* The committed policy-evidence bundle is **empty**. Outbound egress to regulator hosts is blocked in the build environment and no fake evidence was written. Every permissive route therefore reports `POLICY_REFRESH_REQUIRED` today, including the Powerhouse fixture's US route. This is the correct fail-closed answer, not a defect.
* The provider governance gate still refuses `PUBLIC_BUSINESS_CONTACT` on `smtp-relay`; cold-v1 is US-only and inert. Governed dispatch wiring was deliberately **not** done.
* No jurisdiction is claimed solved. UK, US, CA, AU have encoded permissive logic (fresh evidence required); SG, UAE, EG are representable but never green; DE/SA need consent; UNKNOWN fails closed.

## Verification

* New focused suites: router (UK canary fixtures A–F, hostile war, freshness law, matrix, binding invalidation), policy evidence, evidence script, Companies House adapter, legal-form verifier, inbox classifier, invitation classifier, contact-source verifier, tournament, economics, activation truth, discovery, preflight global route, HTTP routes, static zero-cost/no-authority invariants.
* Mutation war guards `GGL-01` … `GGL-25`: every one individually KILLED (UNKNOWN→GREEN, unverified/sole-trader→corporate, registry mismatch/staleness, suppression, no-solicitation, guessed contact, identity/postal/unsubscribe, quarantined sender, stale policy, green-as-authority, digest binding, provider terms, unreported-gate-as-PASS, unknown cost as zero, paid adapter, credential-missing, ambiguity).
* Full deterministic suite compared with the exact main baseline — see the machine receipt for counts and the identical-failing-set check.
* `npm run outreach:drift-doctor` ok; reachability audit regenerated: the thirteen new modules are `PRODUCTION_REACHABLE`.

## External / owner-only remainder (not software)

1. Record live policy evidence (one retrieval per rule, from a host with egress): `npm run outreach:green-lane:doctor`, then `npm run outreach:green-lane:record -- --rule <id> --authority <type> --source-url <url> --evidence-file <retrieved text>`. The hash is computed from the file bytes; non-authoritative hosts are refused.
2. Provide a **free** `COMPANIES_HOUSE_API_KEY` to the web service (UK legal-form verification). Absent: UK fails closed.
3. Final publishable sender identity and sender/controller-jurisdiction legal determination (unchanged; Egypt sender hold remains conservative policy).
4. Owner decision to wire governed cold dispatch (cold-v1 and `smtp-relay` governance) — a separate, human-authorized change.

## Zero-effect ledger

New recurring software cost: **$0**. Prospect messages sent: **0**. Provider/DNS/credential mutations: **0**. Winnr Startup: not purchased. Cold sending: not enabled. Authority widened: **no** (router `sendReady` constant false; `OWNER_AUTHORITY` satisfies no rule; effect package still requires founder-signed authorization through governance).
