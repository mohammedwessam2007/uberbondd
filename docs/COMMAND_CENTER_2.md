# UberBond Command Center 2.0

## Purpose

Command Center 2.0 is an owner-authenticated, evidence-first observer for the UberBond organism. It is intentionally not a source of execution authority. Its job is to make runtime/source/cached truth inspectable on an iPad without inventing telemetry when evidence is absent.

## First-party runtime contract

- Runtime telemetry comes from `GET /api/command-center`.
- `ADMIN_TOKEN` is required server-side. Missing auth configuration fails closed.
- The browser credential is held only in JavaScript memory by this console. It is not written to localStorage, sessionStorage, IndexedDB, URLs, the service worker, the manifest, logs, or the last-good snapshot.
- Lock or reload erases the in-memory credential.
- Authenticated API requests are `cache: no-store` and the service worker explicitly refuses `/api/*` and Authorization-bearing requests.

## Truth classes

The observer exposes these display states rather than a generic green dot:

- `RUNTIME_RECEIPT`: protected first-party status compiled now with full observed truth state.
- `RUNTIME_PARTIAL`: protected first-party status compiled now, but one or more expected receipts are stale/unavailable/invalid.
- `CACHED_LAST_GOOD`: sanitized previous telemetry is being shown because live runtime is unavailable. It is never called live.
- `CACHED_STALE`: the last-good snapshot exceeded the local cache age policy.
- `UNAVAILABLE` / `AUTH_FAILED` / `LOCKED`: no telemetry is promoted to runtime truth.

The source compiler already limits receipt inputs to fixed repository paths and marks freshness independently. The browser does not upgrade catalog presence, source evidence, cached evidence, or model discovery into callability/runtime proof.

## Resilience without secret persistence

The offline service worker caches only static command-center shell assets. The optional last-good telemetry snapshot is independently sanitized with recursive credential-like key removal and is schema/version/time labelled. API responses themselves are never service-worker cached.

## Synaptic Map explorer

The UI provides touch-first graph exploration, search/filtering, provenance inspection, relationship drill-down, timeline evidence and observability alerts. Client and source compiler both bound preview graph size. The client also removes edges whose endpoints are outside the bounded node set, preventing poisoned/orphan edges from consuming render work.

## Governed UI Evolution Loop

`src/command-center-ui-evolution.mjs` evaluates proposed UI candidates against four dimensions:

1. usability,
2. performance,
3. accessibility,
4. truth integrity.

Truth integrity has a hard floor of 1.0 and cannot regress. Accessibility has a hard floor and regression guard. Weighted score regression is rejected. An accepted candidate becomes only `ELIGIBLE_FOR_REVIEW_PR`; promotion authority is always `REVIEW_PR_ONLY`. Every eligible receipt includes baseline/candidate fingerprints and a rollback target. No UI candidate can self-deploy or grant itself production/customer/payment/DNS/credential/spend/merge authority.

## Verification evidence for PR #412

Source branch: `gpt/command-center-2-20260906`, stacked on PR #400 because the protected command-center compiler/API is not yet on main.

Declared deterministic hostile tests cover:

- missing/wrong bearer authentication,
- fail-closed missing `ADMIN_TOKEN`,
- no-store/framing/content-type/referrer headers,
- recursive secret stripping from last-good cache,
- stale-cache downgrade,
- oversized/poisoned Synaptic Map bounding,
- memory-only credential contract,
- no artifact-derived `innerHTML` assignment in the Command Center 2 client,
- service-worker API/Authorization cache refusal,
- iPad safe-area/touch/responsive/PWA contracts,
- truth-integrity regression rejection,
- review-only UI promotion plus rollback evidence.

### Current verification boundary

At the first PR head, GitHub Actions created the deterministic/browser/postgres jobs but all completed without any steps being allocated; the job log blob was absent. Vercel also created a preview deployment for the branch but recorded no build log events. Therefore this document does **not** claim tests executed, preview runtime success, live telemetry success, or deployment success. Those remain `INFRA_BLOCKER` until a runner executes the exact head.
