# UberBond Revenue OS V2 — PR #6 Second-Pass Hardening Report

Branch: `claude/uberbond-full-automation-841k2f` (same branch/PR as before -- repaired in place, no
second architecture, no new PR). This pass follows the first PR #6 repair (commit `f2f621d`) and
fixes seven further, more subtle defects a follow-up hardening review found in that repair itself.

## 1. Unsafe source-evidence conflict recovery

The first repair's fix for duplicate source evidence caught a Postgres unique-constraint violation
and then ran a `SELECT` to find the existing row -- inside the same transaction. That's unsafe:
once one statement in a Postgres transaction errors, the whole transaction is aborted and every
subsequent statement fails with `current transaction is aborted, commands ignored until end of
transaction block` (25P02), so the recovery `SELECT` never actually ran. Verified directly: an
earlier attempt at a "two opportunities share evidence" concurrency test failed with exactly this
error under real load.

Fixed with a new `store.mjs#findOrCreate(key, item, uniqueColumns)`, implemented as a single atomic
`INSERT ... ON CONFLICT (...) DO UPDATE ... RETURNING data, (xmax = 0) AS inserted` statement for
Postgres (the `xmax = 0` idiom distinguishes a genuine insert from a conflict-triggered no-op) and
an equivalent find-then-add on the already-serialized JsonStore transaction queue. This is a single
statement that never raises on a conflict at all, so there is nothing to recover from.
`src/commercial-intelligence-import.mjs#resolveSourceEvidence` now calls this instead of the old
catch-then-query pattern.

**Test**: `tests/commercial-intelligence-concurrency.test.mjs` -- "two distinct opportunities,
imported concurrently, that reference the identical evidence snapshot resolve to exactly one
shared source_evidence row" (real Postgres via PGlite, genuine `Promise.all` concurrency, re-run 5x
with no failures before relying on it) and "store.findOrCreate never throws on a genuine conflict,
even under real concurrency (10x Promise.all)". A source-scan regression guard confirms no
catch-then-query pattern exists anywhere in the file.

## 2. Gates and message variants could link to non-ready opportunities

Existence of an opportunity id was previously sufficient for an owner_gate or message_variant to
link to it -- a policy-rejected opportunity (which still exists in the store, just with
`stage: 'policy_rejected'`) could still receive a gate or message.

Fixed: `requireOpportunityReadyForMessage` now checks `stage === 'ready_for_message'`, not mere
existence, in both preview and commit mode. Preview mode tracks accepted and policy-rejected
opportunity ids in two separate sets (`previewAcceptedIds` / `previewRejectedIds`) so a same-batch
gate/variant can only resolve against the accepted set.

**Tests**: "a policy-rejected opportunity cannot receive an owner gate, even though the opportunity
id exists in the store" and the equivalent for message variants, in both commit and preview mode,
plus a positive control proving an accepted opportunity still can.

## 3. Readiness gates: restored + full evidence provenance

The first repair's `tenOfTenReadiness` grew from the true original 14 gates to 17 by *replacing*
three business-facing slots with unrelated technical gates (`importAtomicity`, `concurrencySafety`,
`auditCompleteness`). This pass restores all 14 original gates unchanged and adds the five gates
this audit explicitly named as missing: `revenueAttribution`, `acceptedPaidDelivery`,
`suppressionTesting`, `killSwitchTesting`, `incidentRecovery` -- 19 core gates. Disclosed rather
than silently asserted: no document available to this repair enumerates "the exact original 17" by
name, so 14 restored + 5 added (19) is reported honestly, not forced to match an unverifiable
count. The three technical gates remain as clearly-separated *additional* gates (`additionalGateCount:
3`), per "technical gates may remain as additional gates" -- `ready` still requires all 22 to pass.

Every gate now also requires full evidence provenance -- `evidenceRef`, `source`,
`measurementWindow`, `timestamp` -- alongside its value; a bare `true`/number with no provenance is
`'unknown'`, identical in effect to no evidence at all.

**Tests**: `tests/revenue-os.test.mjs` -- gate-count assertions (`coreGateCount: 19`,
`additionalGateCount: 3`, `total: 22`), the five new gates exist and fail closed, provenance-missing
evidence is `'unknown'`, and the additional technical gates still block `ready` when unknown.

## 4. Fake content_hash

`content_hash` was computed from `signalKey` or the record's own id -- neither reflects the
evidence's actual content, so it carried no real identity information and risked either false
collisions or (after this repair's own item 1 fix) failing to recognize two records that legitimately
observed the same snapshot.

Fixed: `computeEvidenceContentHash` hashes the real content fields (url, source type, excerpt,
capturedAt, official, confidence). `signalKey` is now stored in its own new column
(`migrations/007_pr6_repair_2.sql`), never conflated with content identity. Because `capturedAt` is
part of the hash, a genuinely fresher re-crawl (different excerpt/capture time) always gets its own
new evidence row -- evidence history is preserved, never silently overwritten.

**Test**: "fresh evidence (different excerpt and capture time) never reuses an older snapshot's
source_evidence row -- both are preserved as history" -- two opportunities from the same domain but
different crawl times get two separate evidence rows, each with its own preserved `capturedAt`.

## 5. Partner/offer/rejection bypassed evidence and policy checks

`partner_route`/`offer`/`rejection` records previously skipped every acceptance check opportunities
get: freshness, official-source, supported-lane, suppression, contact provenance/prohibited-mailbox.
Also, `rejection` records reused `risks` (a free-text concerns list) as if it were a reason-code
vocabulary.

Fixed: `commonEvidenceReasonCodes` (freshness checked separately, same bucket semantics as
opportunities; the rest -- lane, official source, contact eligibility, suppression -- checked and
every code asserted against the canonical registry) now gates all three record types before
persistence. `rejection` records require their own explicit, non-empty `reason_codes` field
(schema-permitted extra field), every entry validated against `isCanonicalReasonCode` at
schema-validation time -- `risks` is never read as a reason code again.

**Tests**: stale-evidence rejection, unofficial-source rejection, contact-mismatch rejection, and
suppression rejection for `partner_route`/`offer`; `rejection`-specific reason_codes validation
(missing, empty, non-canonical, mixed) and a persistence test proving `risks` never leaks into the
`reasonCodes` column.

## 6. Currency-unsafe owner-gate threshold

`buildOwnerGate`'s USD-250-cent floor compared raw `expectedValueCents` against the threshold
regardless of currency -- 500 JPY would have satisfied a USD 250 floor.

Fixed: the safer of the two options the audit offered -- `buildOwnerGate` now requires
`currency === 'USD'` outright (throwing `OwnerGatePolicyError('currency-not-usd', ...)` for
anything else), since no FX-conversion source exists in this version. Documented inline as a
disclosed limitation, not a completed FX system.

**Tests**: "an owner_gate in a non-USD currency is rejected outright, not evaluated against the USD
threshold" (EUR at 10x the floor value still rejected) and a USD positive control.

## 7. Preview wrote a batch-level audit row

The first repair's "zero-write preview" had one disclosed exception: a single batch-level
`commercial_intelligence_import_preview` audit-log entry. This pass removes that exception entirely
-- preview mode now writes absolutely nothing to the store, including its own audit trail. All
evidence a preview run establishes lives in the function's return value; a caller who wants a
durable trace of a preview run makes that choice themselves. `IMPORT_PREVIEW` remains defined in
`CANONICAL_AUDIT_EVENTS` as the reserved name for that caller-side choice, but
`importCommercialIntelligenceBatch` itself never writes it.

**Tests**: "preview mode writes zero audit-log entries -- not even a batch-level one" (JsonStore)
and "preview mode against a PGlite-backed store still writes zero records of any kind, including
audit" (real Postgres).

## Migration status

`migrations/007_pr6_repair_2.sql` applied and tested -- adds `source_evidence.signal_key`.
Verified against a real embedded Postgres engine (`@electric-sql/pglite`) layered on top of
migrations 001-006 unmodified. `node --test tests/postgres-schema.test.mjs`: **14/14 pass**.

## Test results (all run independently this session, against this commit)

```
$ npm run check:syntax                                          # clean, no errors
$ npm run test:deterministic                                    # 213 pass, 0 fail
$ node --test tests/postgres-schema.test.mjs                    # 14/14 pass
$ node --test tests/commercial-intelligence-concurrency.test.mjs # 23/23 pass, re-run for flakiness
```

`npm run test:browser` remains unverifiable in this sandbox: `npx playwright install` cannot reach
`cdn.playwright.dev` from this container (`403 request rejected: host not permitted`) -- the same
disclosed, pre-existing, environment-only limitation reported in every prior report in this repo.
This repair does not touch `src/browser-crawler.mjs` or `tests/browser.test.mjs`.

## Zero-live-send confirmation

Unchanged and re-verified: no email/HTTP-outbound import exists anywhere in
`commercial-intelligence-import.mjs`, `revenue-os.mjs`, `store.mjs`, or either script.
`zeroLiveSend` is `true` in every mode.

## Remaining limitations, disclosed

- The "exact original 17" readiness gates could not be verified against any source available to
  this repair; 19 core + 3 additional (22 total) is the honest reconstruction, not a claimed exact
  match to an unseen document.
- Owner gates are USD-only; no FX-conversion path exists yet for other currencies.
- No dedicated queue/claim mechanism exists for `ready_for_message` opportunities beyond the
  filtered `listQueueableOpportunities` read.
- Browser tests remain unverifiable in this sandbox.
- No real ChatGPT Work batch has been imported yet -- every test uses synthetic
  `.invalid`/`.example` fixtures.
