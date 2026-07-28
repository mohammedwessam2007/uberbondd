# UberBond Revenue OS V2 — PR #6 Repair Report

Branch: `claude/uberbond-full-automation-841k2f` (same branch as the original PR #6, repaired in
place per `01_CLAUDE_CODE_PR6_REPAIR_MISSION.md` -- no second architecture, no new PR).

Produced against `00_PR6_ADVERSARIAL_AUDIT.md`'s nine merge blockers. Every blocker below has a
concrete repair, a code location, and a test that would have failed against the pre-repair code.

## 1. Missing telemetry could falsely pass readiness

`tenOfTenReadiness` (`src/revenue-os.mjs`) is rebuilt around 17 explicit evidence gates
(`deterministicChecks`, `browserChecks`, `migrationChecks`, `previewAuditable`, `importAtomicity`,
`concurrencySafety`, `auditCompleteness`, `duplicateRate`, `hardBounceRate`, `complaintRate`,
`evidenceCoverage`, `positiveReplyRate`, `paidPilots`, `collectedRevenue`,
`positiveContributionMargin`, `recurringClients`, `ownerActionsPerDay`). Every gate returns
`'pass' | 'fail' | 'unknown'`; rate gates require an explicit `{numerator, denominator}` object and
a minimum sample size (20-60 depending on the gate); a missing or under-sampled metric is
`'unknown'`, which blocks `ready` exactly like `'fail'` -- it can never look like a pass. Tests:
`tests/revenue-os.test.mjs` (7 new tests, including the empty-metrics-object and
below-minimum-sample cases).

## 2. Imports were not atomic

`commercial-intelligence-import.mjs` now wraps every opportunity / owner-gate / message-variant /
partner-route / offer / rejection write in exactly one `store.transaction()`: validate-and-compute
happens first, all writes (evidence, the record itself, policy decision where applicable, audit
event) happen together inside the transaction, and any error rolls back the whole record. Source-
evidence unique-constraint conflicts are caught and resolved to the existing row rather than
aborting the batch. Tests: `tests/commercial-intelligence-concurrency.test.mjs` (real Postgres via
PGlite: sequential-duplicate rejection, a genuine mid-transaction failure with a real orphan-check
on `source_evidence`; JsonStore: two and ten genuinely concurrent `Promise.all`-fired imports of the
identical record each produce exactly one canonical row) plus a JsonStore-parity orphan-rollback
test in `tests/commercial-intelligence-import.test.mjs`.

A real, previously-undetected bug surfaced by writing the first real-Postgres test for this
importer: `buildOpportunityRow` never set `probabilityBps`, and `opportunities.probability_bps` is
`NOT NULL`. JsonStore has no such constraint, so this was invisible until tested against a real
schema. Fixed by setting it to its own column default (`0`) explicitly, since `store.mjs`'s
`postgresValues()` always sends every mapped column, and an explicit `NULL` is not "use the
DEFAULT."

## 3. `dryRun` was misleading

Replaced with `mode: 'preview' | 'commit'` (`importCommercialIntelligenceBatch`,
`scripts/import-commercial-intelligence.mjs`). Preview is the default and performs every
validation/normalization/scoring/policy-evaluation step but writes **zero** durable business
records -- no opportunity, evidence, policy decision, gate, message variant, partner route, offer,
or rejection row, and no per-record audit-log entry. Commit requires an explicit `mode: 'commit'`
(`--commit` on the CLI). One disclosed, deliberate exception: a single batch-level
`commercial_intelligence_import_preview` audit-log row is written even in preview mode -- proof a
preview ran, not a commercial-intelligence business record, and the only way the readiness gate
`previewAuditable` can ever have evidence. Tests: `tests/commercial-intelligence-import.test.mjs`
(preview writes zero opportunity/evidence/policy rows; preview writes exactly the one disclosed
audit row; commit persists the real rows; an unknown `mode` value throws rather than defaulting).

## 4. Reason-code registry was violated

New `src/policy-reason-codes.mjs`, transcribed verbatim from `05_POLICY_REASON_CODES.json` (30
codes). `evaluateOpportunityPolicy` (`revenue-os.mjs`) now maps `contactEligibility`'s raw reason
vocabulary through an explicit, exhaustive `canonicalizeContactReason` table (the old code emitted
`contact-${contactResult.reason}` directly, producing `contact-contact-domain-mismatch` --
double-prefixed and absent from the registry, since `contactEligibility` already returns the
canonical-shaped `'contact-domain-mismatch'`) and asserts every final reason code against the
registry before returning, throwing `UnknownReasonCodeError` on anything unregistered. Tests:
`tests/policy-reason-codes.test.mjs` (registry completeness; every real `contactEligibility()`
failure reason maps to a canonical code, exercised against the live function, not a hardcoded
list) plus `tests/revenue-os.test.mjs`'s canonical-code assertions.

## 5. Identity integrity was not enforced

`validateCommercialIntelligenceRecord` now requires `organization_domain` / `service_lane` /
`source.url` to agree exactly (after normalization) with `idempotency_inputs`' own copies of the
same three concepts, rejecting `identity-domain-mismatch` / `identity-service-lane-mismatch` /
`identity-source-url-mismatch` before returning anything. The returned `idempotencyInputs` is then
always derived from the canonical top-level fields, never re-read from the raw copies -- so even
after validation, nothing downstream can accidentally use a disagreeing pair. Tests:
`tests/commercial-intelligence-import.test.mjs` (3 mismatch-rejection tests, 1 derivation test).

## 6. Rejected opportunities remained discoverable

Opportunities are now stored with `stage: 'ready_for_message'` (policy pass) or
`stage: 'policy_rejected'` (policy reject) -- never the ambiguous `'discovered'` a not-yet-evaluated
opportunity would carry. Migration 006 adds a `CHECK` constraint on `opportunities.stage` so an
invalid value can't be persisted at all. `listQueueableOpportunities(store)` is the one supported
way to find opportunities ready for outreach; the import report separates `acceptedCount` /
`policyRejectedCount` / `rejectedDuplicateCount` / `rejectedStaleCount` / `rejectedInvalidCount`.
Tests: a policy-rejected opportunity is excluded from `listQueueableOpportunities`; a mixed batch's
queue contains only the accepted record; the Postgres stage `CHECK` constraint test in
`tests/postgres-schema.test.mjs`.

## 7. Message variants didn't preserve content

`message_variant` records now require explicit `subject` / `body` / `opportunity_id` fields
(schema-permitted extras -- `04_COMMERCIAL_INTELLIGENCE_SCHEMA.json` has no
`additionalProperties: false`), plus optional `experiment_id` / `prohibited_claims`. The body hash
is computed from the normalized `subject + body`, not from `signalKey`. Migration 006 adds
`message_variants.opportunity_id` and `.body` columns. A `message_variant` referencing an
opportunity that was never imported (in the store, or previewed earlier in the same batch) is
rejected. Tests: real content + real sha256 hash persisted and read back; identical content under
different experiments both persist with matching hashes; identical content under the *same*
experiment is correctly rejected as a duplicate (the real unique index's intended behavior);
unknown-opportunity rejection.

## 8. Owner-gate contract was unsafe

`owner_gate` records now require explicit `gate_type` / `opportunity_id` / `action` fields (not a
reused `service_lane`), plus optional `evidence_required`. `buildOwnerGate` (`revenue-os.mjs`) now
enforces, itself, as a pure constructor: `opportunityId` must be present (an out-of-policy gate with
no link cannot be constructed), `expectedValueCents >= 25000` (USD 250, currency-blind -- the same
approximation this codebase's other policy defaults already use), `ownerMinutes <= 20`,
`expiresAt` present and in the future, a supported `gateType`, and a non-empty `action` -- throwing
`OwnerGatePolicyError` with a specific `code` on any violation instead of silently clamping. The
importer additionally verifies the referenced opportunity actually exists (a store-dependent check
`buildOwnerGate` itself can't make) before calling it. Tests: `tests/revenue-os.test.mjs` (7 new
`buildOwnerGate` tests covering every bound); `tests/commercial-intelligence-import.test.mjs`
(unknown-opportunity rejection, below-floor-value rejection, same-batch preview linkage).

## 9. Audit completeness was missing

Ten canonical audit event types (`CANONICAL_AUDIT_EVENTS` in `commercial-intelligence-import.mjs`):
import preview, import committed, accepted, policy rejected, duplicate rejected, stale rejected,
invalid rejected, transaction rolled back, owner gate created, message variant imported. Every
commit-mode outcome logs exactly one. Test: a batch exercising every outcome (accept, policy-reject,
stale, invalid, gate, message-variant, one preview call, one duplicate re-import) asserts all ten
event types are present in `auditLog`; the Postgres rollback test separately asserts a real
`transaction_rolled_back` event exists.

## Integration gap: partner routes / offers / rejections

Migration 006 (`migrations/006_pr6_repair.sql`) adds real, queryable `partner_routes`, `offers`, and
`rejections` tables (id, idempotency_key UNIQUE, organization_domain, service_lane, and
type-appropriate value/geography/evidence-link columns), replacing the pre-repair
audit-log-only "partial persistence." `PARTIAL_PERSISTENCE_RECORD_TYPES` no longer exists as a
concept -- every one of the six `record_type`s is now fully persistable. Tests: full persistence
into their own collections; duplicate rejection by idempotency key.

## CI status

Both automated checks that were failing on the pre-repair commit (`Vercel – uberbondd`,
GitHub Actions `deterministic`/`browser`) were independently investigated and confirmed
pre-existing/infrastructure-level, unrelated to this diff -- see the PR comment on #6
(`https://github.com/mohammedwessam2007/uberbondd/pull/6#issuecomment-5107319020`) for the full
findings (Vercel project misconfiguration predating this PR by months; GitHub Actions
runner-provisioning failure, same pattern on unrelated prior PRs). This repair does not change
either root cause -- both remain outside this repair's diff and outside owner-authorized scope.

## Test results (all run independently this session)

```
$ npm run check:syntax                # clean, no errors
$ npm run test:deterministic          # 192 pass, 0 fail
$ node --test tests/postgres-schema.test.mjs                    # 14 pass, 0 fail
$ node --test tests/commercial-intelligence-concurrency.test.mjs # 5 pass, 0 fail (run 3x for flakiness)
```

`npm run test:browser` remains unverifiable in this sandbox: `npx playwright install` cannot reach
`cdn.playwright.dev` from this container (`403 request rejected: host not permitted`), the same
disclosed, pre-existing, environment-only limitation reported in the original
`UBERBOND_REVENUE_OS_V1_IMPLEMENTATION_REPORT.md`. This repair does not touch
`src/browser-crawler.mjs` or `tests/browser.test.mjs`. Real CI provisions the browser itself
(`npx playwright install --with-deps chromium` in `.github/workflows/ci.yml`) and should not
reproduce this.

## Concurrency evidence (real, not simulated)

`tests/commercial-intelligence-concurrency.test.mjs` documents, in its header comment, a genuine
finding from building this repair: two Promise.all-fired application-level transactions
(`store.transaction()` → real `BEGIN`/`COMMIT`) against a *single* `@electric-sql/pglite` instance
corrupt each other's transaction state ("current transaction is aborted") rather than cleanly
interleaving, because PGlite is a single embedded backend, not a multi-connection cluster. This was
verified empirically, not assumed. The concurrency proof therefore runs against `JsonStore`
(two and ten genuinely concurrent `Promise.all` calls, exercising `store.mjs`'s real internal
transaction queue) -- which is also the realistic scenario for this codebase, since its own
server/worker processes always call this importer from within a single Node process. Real-Postgres
coverage is sequential (duplicate rejection, mid-transaction rollback), each a single, non-overlapping
transaction, backed independently by `tests/postgres-schema.test.mjs`'s raw-SQL unique-constraint
tests.

## Remaining limitations, disclosed

- `OWNER_GATE_MIN_EXPECTED_VALUE_CENTS` (25000) is compared against `expectedValueCents` directly,
  regardless of the gate's `currency` field -- no FX conversion. This is the same currency-blind
  approximation `revenue-os.mjs`'s other policy defaults (`minExpectedValueCents`) already use; not
  introduced or worsened by this repair, but not fixed either.
- No dedicated queue/claim mechanism exists for `ready_for_message` opportunities beyond
  `listQueueableOpportunities`'s filtered read -- there is no `claimOpportunities`-style atomic
  claim (unlike `prospects`/`jobs`, which do have one). Out of scope for this repair; not named in
  the audit's merge blockers.
- `npm run test:browser` unverifiable in this sandbox (see above).
- Real ChatGPT Work batch data has still never been imported through this path -- every test uses
  synthetic `.invalid`/`.example` fixtures. `07_CLAUDE_CODE_MERGE_MISSION.md`'s "validate all
  JSONL... import in dry-run mode" step, once a real batch arrives, is the next concrete milestone.
