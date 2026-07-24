# Reuse vs. Replace Decisions

One decision per reusable subsystem found during forensics, and why.

## Reused as-is (imported unmodified from `../../src/`)

- **`src/queue.mjs`'s `DurableQueue`** — generic job-lifecycle infrastructure (leases, heartbeats,
  retries, dead-letter, singleton/dedupe keys, stale-job recovery). Workstream 15's scheduler
  needs exactly this, and re-deriving it would be duplicate, riskier code for no benefit. Requires
  `revenue-os/src/store.mjs` to implement the same generic collection interface `src/store.mjs`
  does (`add`/`get`/`list`/`patch`/`transaction`/`recoverStaleJobs`/`log`) — confirmed by reading
  `queue.mjs`'s store usage before committing to this reuse.
- **`src/store.mjs`'s `ConflictError`** — `DurableQueue.enqueue()` does `error instanceof
  ConflictError` against its own imported class; this package's store must raise the same class
  (via `extends`) or duplicate-job detection silently breaks. (This exact bug class was found and
  fixed in a sibling mission this session — see that mission's commit history for the failure
  mode; avoided here from the start.)

## Pattern reused, code written fresh (not imported — different package, different scope)

- **CSV parsing + formula-injection guard**: `src/csv.mjs` parses CSV but has *no*
  formula-injection escaping at all (confirmed by reading the file in full). This mission's
  `revenue-os/src/csv.mjs` writes its own parser plus a `csvEscape` guard (the same `=+-@`/tab/CR
  apostrophe-prefix technique used in this session's other missions), since the root file cannot
  be safely relied upon for hostile agency-supplied CSV without that guard, and modifying
  `src/csv.mjs` itself is out of this mission's scope (touching shared root infrastructure other
  live branches depend on is a bigger blast radius than this mission should take on unasked).
- **Archive-safety (zip-slip/zip-bomb) checks**: no such module exists anywhere on `main`. Written
  fresh in `revenue-os/src/archive-safety.mjs`, following the same entry-metadata-only approach
  (no ZIP-parsing dependency in this repo) proven in this session's other missions.
- **Store dual-backend shape (JsonStore + PostgresStore)**: `src/store.mjs`'s pattern is followed
  for `revenue-os/src/store.mjs`'s `JsonStore` (transactions, `_xDirect`/public-wrapper split to
  avoid the nested-transaction bug class found in a sibling mission). A full `PostgresStore` mirror
  is intentionally **not** built this session (see `EXTERNAL_BLOCKERS`/honest-completion notes) —
  the SQL migrations are Postgres-compatible and written to the same shape `src/store.mjs`'s own
  Postgres path expects, but only the JSON backend is implemented and tested here, to keep the
  20-workstream scope achievable in one session. This is a deliberate, disclosed scope reduction,
  not an oversight.

## Explicitly NOT reused

- **`src/gmail.mjs`** (real Gmail OAuth/send/read) — this mission's outbound handoff and reply
  import must stay provider-neutral with real sending permanently disabled; `revenue-os/` defines
  its own fake/replay email and reply-import contracts rather than wiring to the real Gmail client,
  even in a "not enabled" state, to keep zero accidental live-send surface area.
- **`src/payments.mjs`** (Lemon Squeezy webhook verification) — a real webhook-signature verifier
  for one specific provider is the opposite of this mission's "provider-neutral, evidence-based,
  manual-report reconciliation" requirement (workstream 9 explicitly lists fake/replay + manual
  bank/PayPal/Payoneer evidence + a generic contract, never a live webhook). `revenue-os/`'s
  `payment-verification.mjs` is written fresh against that different contract.
- **`src/revenue.mjs`'s `RevenueEngine`** — scoped to the existing campaign/lead data model, not
  this mission's opportunity/funnel model; the funnel-stage tracking this mission needs
  (`revenue-os/src/funnel.mjs`) is a different, smaller, purpose-built shape.
- **`lite/`** — never read into, imported from, or depended on, per the mission's protected-path
  instruction. Confirmed zero diff throughout (see `ZERO_LITE_PROOF`).

## Migration numbering

Root migrations run `001`-`004`. `revenue-os/migrations/` is a **separate directory** (not the
root `migrations/`), numbered independently from `001`, since this package's schema is entirely
new and does not alter or extend the root schema. Every table is `ros_`-prefixed to guarantee zero
collision even against a shared `DATABASE_URL`.
