# Claude implementation packet — MONEY-17 gate metadata

Status: `READY_FOR_SOFTWARE_FACTORY`  
Prepared: 2026-08-30  
Exact current `main`: `3856d3b5f1489eef342ce203bc2b2bcd3fb25cbc`

## Decision this affects

The mutation gate must distinguish a killed guard from a guard whose required runtime never ran. PR #240's controlled-runner receipt reports 93 mutations, 93 killed with PostgreSQL and Chromium present. The missing-runtime path remains the decision risk: `MONEY-17` points at `tests/payment-reconciliation-postgres-real.test.mjs` but its inventory entry does not declare `needsPostgres: true`; without PostgreSQL the suite self-skips and the harness can misclassify missing infrastructure as a surviving guard. This is a verification-integrity defect, not a claim that the webhook guard is absent. The committed artifact records 127/127 PostgreSQL while the PR body records 158/158; preserve that source contradiction. This lane's post-hotfix exact-current-main local rerun is NOT_PROVEN.

## UberBond already has

- `scripts/mutation-war.mjs` — bounded mutation registry and runtime-aware `SKIPPED_NEEDS_POSTGRES` / `SKIPPED_NEEDS_BROWSER` classification.
- `tests/payment-reconciliation-postgres-real.test.mjs` — real database duplicate-webhook proof.
- `tests/sovereignty-proof-closure.test.mjs` and `tests/canon-freshness.test.mjs` — current mutation identity/shape and canonical-count assertions.
- `src/billing-webhook-repository.mjs`, migration 101 and the canonical raw-body HMAC route — the behavior under attack.

Add only the missing metadata binding; do not build a payment worker, provider adapter, or new reconciliation system.

## Smallest primitive and contract

1. Add `needsPostgres: true` to the `MONEY-17` object in `scripts/mutation-war.mjs` (or derive it from the existing suite manifest if that is the repository's chosen single source of truth).
2. Extend the existing mutation registry assertion surface with a hostile assertion that every mutation whose suite requires `OMNIA_V9_TEST_DATABASE_URL` is explicitly marked `needsPostgres`, and that a missing runtime yields `SKIPPED_NEEDS_POSTGRES`, never `SURVIVED`.
3. Preserve existing counts and IDs; duplicate IDs, unknown suite paths, malformed booleans, or a missing runtime marker must fail closed.

No schema migration or durable business data is needed. The mutation object is the data model; its stable `id`, `file`, `find`, `replace`, `suites`, and runtime marker must remain deterministic.

## Authority, privacy, and effects

- Authority: local test-gate metadata only; it cannot approve code, payment, provider use, customer contact, deployment, DNS, KYC, or production writes.
- Privacy: no URLs, credentials, raw webhook bodies, payloads, event keys, or customer data in receipts or test output.
- External effects: exactly zero. Do not call PostgreSQL, Overpass, browsers, payment providers, Vercel, GitHub APIs, or customer systems from the new test.

## Failure/idempotency requirements

- Missing `OMNIA_V9_TEST_DATABASE_URL` => `SKIPPED_NEEDS_POSTGRES`, non-green and excluded from kill/survival totals.
- Present runtime plus a real suite => execute the mutation and report `KILLED` or `SURVIVED` from observed test behavior.
- Re-running the registry test is deterministic and side-effect free; no global state, retries, or network calls.
- An unknown runtime marker, a suite that cannot be found, or a mutation that declares a database need without a database suite must fail closed.

## Hostile tests

- Delete `needsPostgres` from MONEY-17: registry test fails before the war runs.
- Rename the marker or set it to a string/false value: registry test fails.
- Remove the database URL: MONEY-17 is skipped, never counted as killed or survived.
- Keep the URL but mutate the `ON CONFLICT` clause: the real PostgreSQL suite kills the mutation.
- Add a second mutation with the same ID or a nonexistent suite: registry test fails with the exact identity/path.

## Mutation target and acceptance gate

Likely files: `scripts/mutation-war.mjs` and the existing mutation registry test(s); no other source module should change. Acceptance is:

```text
npm run check:syntax
node --test tests/sovereignty-proof-closure.test.mjs tests/canon-freshness.test.mjs
npm run test:mutation-war                 # without runtimes: skips, no survival laundering
OMNIA_V9_TEST_DATABASE_URL=<throwaway> npm run test:mutation-war  # with runtime: MONEY-17 killed
```

PR #241/#242 changed the current main around rate-limit identity and canon freshness; this packet remains scoped to MONEY-17 metadata and must be tested against the exact main above. The final receipt must report the exact tested SHA, runtime presence/absence, counts, and any skip separately, and must not treat the PR #240 source receipt as a fresh local rerun. Merge/deploy only through the repository's current review and exact-head gates; this packet grants no promotion authority.
