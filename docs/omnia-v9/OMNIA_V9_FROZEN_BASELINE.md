# OMNIA V9 Frozen Baseline

This document freezes OMNIA V9's core as of the second closure mission's final verified state, before any real-integration work begins. Machine-readable equivalent: [`artifacts/omnia-v9/frozen-baseline.json`](../../artifacts/omnia-v9/frozen-baseline.json).

## Canonical identity

- Canonical branch: `claude/omnia-v9-closure-verify-1iuar2`
- Closure-tested SHA (code that was actually executed and verified): `4e256c91de5d21f2f69027534ef45cd9876fdf2b`
- Closure report commit (adds the evidence, no executable change): `5dc1b082a3f8b8a9d437680021e87bb115673913`
- This is also the fork point for `product/omnia-v9-real-integration`.
- Closure command: `node scripts/verify-v9-closure.mjs` — last result: `OMNIA_V9_FINAL_CLOSURE_VERIFIED`

## Bindings

- Constitution digest: `e0a38ea42ce17ed6f18f1e465c4465fc47cf9183396e008838414e5e473508bd`
- Source-set digest: `ffbbdedd61db246d1472a22357faa2cb1250020ab5ef964707cd22b2ea6bd67b`
- Policy digest: `9ccecfff9cae4b82b7a896495a434100752201597c80cd85cb691c50401cb98b`
- Cedar package/runtime: `@cedar-policy/cedar-wasm` 4.12.0 / 4.12.0

## Database

- PostgreSQL at closure: 16.13 (Ubuntu), pgcrypto 1.3
- Migrations: 001–008 (see `frozen-baseline.json` for the full list)

## Test totals at freeze time

- V9 grand total: 174 tests, 174 pass, 0 fail, 0 skipped
- Full repository regression: 267 tests, 267 pass, 0 fail

## What is frozen

The P0–P9 admission kernel, proof store, constitution/policy binding, Cedar adapter, execution-receipt and authorization-binding stores, and the authority-transition ledger — 14 source files and 4 migrations, plus the two canonical verification scripts. Full list with SHA-256 digests (computed over raw file bytes at the closure-tested SHA) is in `frozen-baseline.json` under `frozenCoreFiles`.

## What is explicitly NOT frozen

- `src/omnia-v9/outbound-shadow.mjs` and `src/omnia-v9/final-admission-shadow.mjs` — these are the pre-existing shadow-observation adapters. They already contain an injectable hook seam (`outboundFinalAdmissionShadowFn` in `Pipeline`) designed for exactly this kind of extension. They are integration glue, not kernel.
- `src/omnia-v9/integrations/**` — new in this mission. This is the integration layer itself.

## Amendment protocol

Any future change to a frozen core file must answer, in the commit message or an accompanying doc:

1. **Which real operational defect required the change?** (Not "would be nice," not "more correct in theory" — an actual reproduced failure.)
2. **What measured failure showed the need?** (A failing test, a reproduced bug, a real integration blocker — not speculation.)
3. **What invariant changes?** (Say exactly what behavior is different and why that's still safe.)
4. **What regression test was added?** (Proving the fix, and guarding against the defect recurring.)

Changes that cannot answer all four should not touch the frozen core. This is the mechanism that keeps V9 from becoming sacred, unquestionable architecture in one direction, and from becoming casually mutable scope-creep in the other.

## Known limitations carried forward

- PostgreSQL used for closure verification is a native local install, not the Docker `postgres:16` image CI uses (same major version and extension).
- Mutation testing is thorough (ten named critical protections across two passes) but not exhaustive.
- The browser test suite cannot run in the verification sandbox (pre-existing Playwright browser-revision mismatch, unrelated to V9).
- **No real Cedar-backed policy or owner-issued approval exists in production yet.** This is the most important limitation for the integration work that follows: V9's admission decisions against real UberBond data will be evidence-limited (mostly `REVIEW`/incomplete) until real approvals are issued through an owner key-management flow that does not exist yet. This is stated here so the replay/shadow results that follow are read in the right light — they measure the plumbing and the decision logic, not a fully-provisioned authority chain.
