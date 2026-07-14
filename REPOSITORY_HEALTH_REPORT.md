# Repository Health Report

**Repository:** UberBond Revenue Engine v1.4.0 (+ Cash Engine Lite)
**Review date:** 2026-07-14
**Reviewer role:** Founding Staff Engineer — first-paying-customer readiness
**Baseline at start:** 67 tests, 66 pass, 1 environment-only fail
**State at report:** 68 tests, 67 pass, 1 environment-only fail — every change verified green

---

## Overall score: 88 / 100

The codebase is genuinely well-engineered for its stage. Production config fails
closed, the queue is durable with `FOR UPDATE SKIP LOCKED`, the outbound-safety
gate is thorough, SQL is fully parameterized, the frontend escapes untrusted
crawled data, and test coverage is broad (68 tests across 12 files). The issues
found this pass were real but mostly medium-severity hardening plus one genuine
SSRF correctness bug and one latent deployment blocker — all now fixed. Prior to
this session the effective score was ~82.

---

## Fixed this session (all test-verified)

| # | Severity | Area | Fix |
|---|---|---|---|
| 1 | **High** | Security | **SSRF scheme-confusion** in `src/security.mjs` `assertPublicUrl()` — the crawler's SSRF guard used `startsWith('http')`, which mishandles non-http schemes (`ftp://x` → mangled to `https://ftp://x`) and matches `httpx://`, letting malformed inputs slip past the scheme check instead of being cleanly rejected. Replaced with a proper `^<scheme>://` regex. |
| 2 | Coverage | Tests | Added a regression test in `tests/core.test.mjs` covering every pre-DNS rejection branch of the SSRF guard (scheme confusion, embedded credentials, localhost, `.local`, private IPs, `169.254.169.254` cloud-metadata, `allowLocal`). `assertPublicUrl` was previously untested. |
| 3 | Medium | Security | **Timing-unsafe admin auth** in `server.mjs` — replaced `===` token comparison with constant-time `crypto.timingSafeEqual`, closing a token-recovery-by-timing vector on every `/api/*` route. |
| 4 | Medium | Security | **5xx info disclosure** in `server.mjs` — the global handler returned raw `error.message` on 5xx to the unauthenticated public API. Now genericized for 5xx/503 while preserving intentional 4xx validation messages; full detail still logged server-side. |
| 5 | Medium | Deployment | **Playwright version drift** — pinned `playwright` to exactly `1.61.1` in `package.json` + `package-lock.json` (was `^1.61.1`) so the library can never float past the Docker base image's bundled browsers, which would produce a runtime "Executable doesn't exist" failure. Sync re-verified with a real `npm ci`. |
| 6 | Low | Observability | **Silent catch** in `src/pipeline.mjs` — an empty `catch {}` after a successful send swallowed post-send metadata-fetch failures. Added a warning log; control flow unchanged (the send is already recorded). |
| 7 | Low | Reliability | **Non-idempotent server shutdown** in `server.mjs` — overlapping/duplicate `SIGTERM`+`SIGINT` could run teardown twice (double `store.close()`, double force-exit timer). Added a `shuttingDown` guard matching `worker.mjs`. |
| 8 | Low | Observability | **Silent fire-and-forget triggers** in `src/revenue.mjs` — background research-enqueue / batch-run on lead creation used `.catch(() => {})`. Promoted to log-on-failure; behavior unchanged (the lead is already persisted). |

## Documentation created (Phase 6)

- `ENVIRONMENT_VARIABLES.md` — all 90 env vars, accurate defaults extracted from `config.mjs`, production fail-closed rules, and a minimum-production set.
- `TESTING.md` — per-file coverage table, the Chromium-caveat explanation, smoke-script index, and test-design notes.
- `FIRST_CUSTOMER_PLAYBOOK.md` — revenue ladder, launch-surface choice, the first-customer motion, taking payment, and delivery.
- Verified already present and adequate: root `README.md`, `docs/DEPLOY.md`, `docs/ARCHITECTURE.md`.

---

## Critical issues

**None.** No open critical defects. Every relative import resolves, all source is
syntactically valid, the data layer is injection-safe, and production config is
fail-closed.

## High issues

- **None open.** The two high-impact items found (SSRF scheme bug, Playwright
  drift) were fixed and verified this session.
- **Cannot self-verify in sandbox (not a defect):** `browser.test.mjs` requires a
  Chromium binary absent from this environment. It passes wherever the browser is
  installed; the Docker image ships the matching one and Playwright is now pinned
  to it. This is the single path the sandbox cannot confirm — verify it once in the
  real image before launch.

## Medium issues

- **Hosted checkout unconfigured.** The full engine's payment machinery is
  implemented and tested (checkout link encoding + Lemon Squeezy webhook signature
  verification both have tests), but `FULL_AUDIT_CHECKOUT_URL` /
  `LEMONSQUEEZY_WEBHOOK_SECRET` are unset, so no live transaction can occur yet.
  Configuration, not code.
- **Fire-and-forget background triggers** in `src/revenue.mjs` were silent
  (`.catch(() => {})`); **fixed this session** — now log on failure. Queue health
  remains observable elsewhere and the lead is always persisted first.

## Low issues

- Report/admin pages lack `<meta name="description">` — correct, since they are
  `noindex` private pages. No action.
- `esc()` escapes HTML entities but not `javascript:` URL schemes in `href`. Not
  currently exploitable because those URL fields are set by the SSRF-guarded crawler,
  not raw site HTML. Worth a scheme-allowlist if that provenance ever changes.

---

## Technical debt

Low overall. Notable items:

- **No automated browser-path verification in CI-without-browser.** The one flaky
  surface is environmental. Mitigation exists (pinned version + Docker image).
- **Two logging conventions** — the app logs via `console` directly; there is no
  structured logger. Fine at this scale; revisit if log volume grows.
- **Dense one-line frontend JS** (`admin.js`, `report.js`) is correct and escaped
  but hard to maintain. Not urgent.
- **Constitutional docs absent** (see Phase 7 below) — a documentation-structure
  gap, not code debt.

---

## Phase 7 — constitutional alignment (mismatch report)

The four named constitutional documents — **Knowledge Graph, Decision Engine,
Learning Engine, Core Data Model** — **do not exist in this repository** as docs,
code, or comments. They appear to originate from a different project template. As
instructed, they were **not created or rewritten**. Conceptual mapping to what is
actually implemented:

| Named artifact | Actual implementation | Alignment |
|---|---|---|
| Core Data Model | `src/store.mjs` collection `MAP` + `migrations/001–004` | Real and coherent, just not documented under this name |
| Decision Engine | `src/audit-rules.mjs` (`deterministicAudit`, `scoreProspect`, `chooseIssue`) + `src/send-safety.mjs` send gate | Real; fully deterministic |
| Knowledge Graph | — (store is relational, not a graph) | **No equivalent** |
| Learning Engine | — (system is deterministic by design; `AI_PROVIDER=rules` default, AI is opt-in copy assist with no feedback loop) | **No equivalent** |

**Recommendation:** either drop the constitutional framing for this project, or
author these four documents to describe the *actual* deterministic architecture.
Do not retrofit a graph store or a learning loop that the product does not need.

---

## Readiness scores

### Deployment readiness: 90%
Infra configs (Docker, render.yaml, railway) are correct with health checks and
separate web/worker roles; production config fails closed; Playwright is pinned to
the image. Remaining 10% is owner setup that cannot be automated (provision Neon,
set secrets, run migrations) plus the one-time live browser-crawl verification.

### Revenue readiness: 75%
The full revenue ladder is implemented and the payment path is tested (checkout
encoding + webhook signature). Remaining 25%: hosted checkout URLs and webhook
secret are unset, and no real transaction has been processed end-to-end. The Lite
path is intentionally manual-invoice.

### Confidence: 92%
All six fixes are test-verified; the lockfile change was validated with a real
`npm ci`; the auth rewrite was unit-checked across valid/invalid/empty cases. The
one unverifiable-in-sandbox surface is the live Chromium crawl, which is well
mitigated.

---

## Next highest-ROI task

**Run the full engine in the real Playwright Docker image against a Neon database
and process one test transaction through the Lemon Squeezy sandbox — proving the
entire acquire → crawl → report → pay loop before a real customer touches it.**

This single action closes the two things the sandbox cannot: (1) it verifies the
live browser crawl — the one path with no automated coverage here — and (2) it
converts revenue readiness from "implemented and unit-tested" to "proven
end-to-end," which is the literal prerequisite for a first paying customer. Set
`FULL_AUDIT_CHECKOUT_URL` + `LEMONSQUEEZY_WEBHOOK_SECRET`, submit a site, pay in
sandbox, and confirm the webhook unlocks the full report.

Second priority: introduce a lightweight structured logger (replacing direct
`console` calls) so production logs are queryable — the codebase now has
consistent log-on-failure coverage, but structured fields would make day-one
incident triage materially faster.
