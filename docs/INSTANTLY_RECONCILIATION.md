# Instantly Reconciliation

Direct answer to the mission's own required question: **did the historical
Instantly-like code exist, and where?**

**Yes — corrected 2026-08-19, after the user supplied the archive
directly.** Two bounded GitHub-side search passes (documented below, left
intact for the record) found nothing, because they searched for the wrong
filenames and because the archive was never pushed to any branch this
session could reach via git or the GitHub API. The user then uploaded
`UBERBOND_LEAD_INTELLIGENCE_OUTREACH_COMPLETE_20260813.zip` directly (a
different name from either originally-requested filename, and the actual
carrier of the same content). It is real: valid zip (sha256
`6dee168b8094327e41568909678680975092339f4462c5f2f798044fdcd7f605`), 380
files, and — critically — **its own bundled test suite genuinely passes**
when run in isolation: `npm run check:syntax` clean, `npm run
check:outreach`/`check:leadgen`/`check:lead-intelligence` all pass (26/26,
8/8), and the full `npm run test:deterministic` reports **495 pass, 0
fail, 41 skipped** (536 total — the skips match this repo's own pattern of
Postgres-live tests skipped without a live database). This is not
"impressive-looking but broken" — it is real, working, tested code.

**Exact provenance, traced via git, not guessed:** the archive's
`src/opportunity-factory.mjs` and `src/outreach-governance.mjs` (among
others) are byte-identical in lineage to files already reachable in this
repository's own git history on `origin/claude/from-v9-complete-build-2026-08-10`
(confirmed via `git cat-file -e <branch>:<path>`). That branch has the full,
un-stripped OMNIA-V9 closure implementation (`kernel.mjs`, `cedar-adapter.mjs`,
`proof-store.mjs`, `execution-receipt-store.mjs`, a 20-file
`integrations/` tree) that the current branch's vendored `src/omnia-v9/`
only ever had a stripped 3-file subset of. The archive is that branch's
lineage **plus roughly three more days of real, substantial work**
(2026-08-10 to 2026-08-13) that was packaged as a deliverable and handed to
the owner directly — matching exactly the "generated as a chat deliverable,
never committed" hypothesis in this document's original version, now
confirmed rather than merely inferred.

## Search classification (per the mission's required taxonomy) — corrected

| Artifact | Classification | Evidence |
|---|---|---|
| `UBERBOND_LEAD_INTELLIGENCE_OUTREACH_COMPLETE_20260813.zip` (the real carrier, supplied directly by the owner) | `FOUND_AND_READ` | sha256 `6dee168b...`, 380 files, extracted and inventoried in full, own test suite run in isolation: 495/536 pass, 0 fail, 41 skipped (Postgres-live). |
| `UBERBOND_INSTANTLY_PARITY_AND_SUPERSTACK_V1_1_REPAIRED.zip` / `UBERBOND_OUTREACH_INSTANTLY_PARITY_COMPLETE_2026-08-13_FINAL.zip` (the two originally-requested exact filenames) | `NOT_FOUND_AFTER_BOUNDED_SEARCH`, but superseded — the archive that exists under a different name (above) contains the same substantive content (the parity ledger, comparison doc, outreach workbench) | Neither exact filename exists anywhere GitHub-side; the content they'd contain is confirmed present in the differently-named archive instead. |
| `public/outreach.html` workbench | `FOUND_AND_READ` | Real, 34,068 bytes, at `uberbondd-v9-closure/public/outreach.html` inside the archive, alongside `public/outreach.js` (99,393 bytes) and `public/outreach.css` (28,483 bytes). |
| "Instantly parity" implementation code and comparison docs | `FOUND_AND_READ` | `docs/outreach/INSTANTLY_PARITY_LEDGER_2026-08-12.md` and `docs/outreach/INSTANTLY_FULL_COMPARISON_AND_UPGRADE_PLAN_2026-08-12.md`, both read in full — see summary below. |
| Campaign/Unibox/lead/enrichment/warm-up capabilities as a cohesive system | `FOUND_AND_READ` | `src/outreach-workbench.mjs` (59,580 bytes), `src/outreach-operator.mjs` (58,681 bytes), `src/lead-intelligence-v3.mjs` (31,636 bytes), `src/lead-operations.mjs` (35,744 bytes), `src/lead-generation.mjs` (35,787 bytes), `src/outreach-automation.mjs`, `src/outreach-provider-events.mjs`, `src/outreach-upgrades.mjs`, `src/opportunity-factory.mjs` — real, syntax-clean, tested. |
| The full un-stripped OMNIA-V9 closure (kernel, Cedar policy adapter, proof store, execution receipts, ~20-file `integrations/` tree) | `FOUND_AND_READ` | Matches this repo's own `origin/claude/from-v9-complete-build-2026-08-10` branch, already in git history — the vendored `src/omnia-v9/` on the current branch (`canonical.mjs`/`schema.mjs`/`kernel.mjs` only) is a deliberately-stripped 3-file subset of this. |
| The one `.zip` that exists in a *different* repo (`UberBond_v1.4_ONE_AGENT_TONIGHT_LAUNCH.zip`, in `-uberbond-revenue-engine`) | `FOUND_BUT_CORRUPT` | Unrelated to the real archive above; different, older, and its central directory is genuinely truncated. Not pursued further. |

## Search commands run (both passes, for reproducibility)

```
git branch -a
git log --all --oneline | wc -l
git grep -liE "instantly|warm.?up|mailbox.?pool|sender.?pool|..." <each-branch>
git log --all --diff-filter=A --name-only --pretty=format: | grep -iE "parity|outreach\.html|instantly|superstack"
git log --all --grep="parity" --grep="instantly" --grep="superstack" -i --oneline
git fsck --full --unreachable --dangling
find /workspace /tmp -iname "*instantly*" -o -iname "*parity*" -o -iname "*outreach*"
mcp__github__search_pull_requests / search_code / search_commits (org:mohammedwessam2007)
```

All four other UberBond-named repos on the account were attached, cloned in
full (unshallowed), and searched the same way as the primary repo.

## Why the contradiction happened — confirmed, not inference

Every filename referenced (`_IPAD.md` files, `ONE_AGENT_TONIGHT_LAUNCH`,
`MISSION_*_REPORT.md`) pointed to a workflow where earlier sessions
generated deliverables and reports as chat artifacts or downloadable files
rather than committed code. That hypothesis is now confirmed: the archive's
`PACKAGE_MANIFEST.md` states it was "Packaged: 2026-08-13" and explicitly
lists what it intentionally excludes (`node_modules/`, `.git/`, local
runtime state, credentials) — the language of a deliberate one-time export,
not a git push. A session cannot reach a file that only exists on the
user's own device without the user supplying it directly, which is exactly
what happened here.

## Second archive supplied: `UBERBOND_OUTREACH_INSTANTLY_PARITY_COMPLETE_20260813_FINAL.zip`

The owner supplied a second archive (sha256
`7ef3c7f0eb73d6134e42789e236d4c7acf8f61e7e35ea50e84db6041215d91d2`, 357
files) — the literal artifact originally asked about, filename match
confirmed (`_2026-08-13_` vs. the archive's own `20260813`). Verified valid
zip. Diffed file-by-file against the first archive rather than assumed:

- **File list**: every file in archive 2 also exists in archive 1, save one
  runtime-state file (`data/db.json`, not source). Archive 1 additionally
  has 23 files archive 2 lacks — all of them the Lead Generation V2 / Lead
  Intelligence V3 layer (`src/lead-generation.mjs`, `src/lead-intelligence-v3.mjs`,
  `src/lead-operations.mjs`, `src/lead-generation-benchmark.mjs`, migrations
  016/017, the QA-diagnostic-offer docs).
- **Content of the 13 files present in both**: diffed directly
  (`diff -rq`, then line-count comparison on the five "spine" files). Total
  lines *removed* going from archive 2 to archive 1: 5 lines across
  `store.mjs`, `pipeline.mjs`, `prospect-import.mjs`, and `server.mjs`
  combined (`config.mjs`: zero). Everything else in those files is
  addition. This is a clean, non-regressive continuation, not a divergent
  fork.

**Conclusion: archive 1 already is "both of them together."** Archive 2 is
archive 1's own direct ancestor snapshot — packaged right at the point the
outreach workbench itself was declared "Instantly parity complete," three
days before the owner kept going and added the lead-generation layer on
top of the identical codebase. There is no reconciliation needed *between*
the two archives; the recovery plan below targets archive 1 alone, and
archive 2 is preserved in `historical-archive/` purely for provenance (it
is the literal file matching the mission's original two requested
filenames most closely).

## Recovery and reconciliation plan (not yet executed — this is the plan, not the merge)

The archive is real and its own tests pass, but merging 380 files against
a current branch that has since diverged with its own substantial,
non-overlapping real work (the entire Prometheus economic spine, and
tonight's domain/mailbox readiness OS — neither exists in the archive,
which predates both) is a multi-pair reconciliation at roughly 10x the
scale of this session's earlier 7-pair Prometheus reconciliation. Doing it
carelessly risks exactly the mistake this mission's own rule warns against
("do not blindly copy files... do not overwrite current work"). The
responsible sequence, not yet executed:

1. **OMNIA-V9 closure**: the archive's full `src/omnia-v9/` (kernel, Cedar
   adapter, proof store, execution receipts, ~20-file `integrations/`
   tree) is strictly more complete than the current branch's stripped
   3-file vendor copy. This is very likely the single highest-value,
   lowest-risk recovery — it extends rather than conflicts with anything
   currently in place, since the current branch's `consequence-boundary.mjs`
   already treats the stripped copy as intentionally minimal.
2. **Outreach workbench / operator / lead-intelligence-v3 / lead-operations
   / lead-generation / opportunity-factory**: real, tested, substantial —
   but built against the pre-Prometheus, pre-domain-mailbox-readiness data
   model (e.g. `opportunity-factory.mjs` vs. the current branch's later
   `opportunity-registry.mjs`; the archive's own sender/warm-up concepts
   vs. tonight's `sending-domain-registry.mjs`/`sending-mailbox-registry.mjs`).
   Each needs the same compare-behavior/compare-tests/compare-safety/
   choose-canonical discipline as the Prometheus reconciliation, module by
   module — not a directory copy.
3. **`public/outreach.html`/`outreach.js`/`outreach.css`**: a real,
   substantial static UI (mission explicitly forbids new website/Vercel
   work, but this is an owner-only local operator surface, not a public
   site — same category as the existing `public/admin.html`). Needs to be
   re-pointed at whichever backend routes survive step 2's reconciliation
   before it can be trusted to render real data.
4. Only after 1-3: reconcile the 17 archive migrations against the current
   branch's schema, and the ~40 archive-only tests against the current
   branch's 590.

This plan is recorded so the next wave can execute it deliberately instead
of re-discovering the archive's shape from scratch. The archive itself is
preserved read-only at the path noted in this session's tool output for
that next wave to use.

## Recovery execution report (this wave)

The plan above was executed through step 1 and (with an explicit scope
adjustment) step 2, following the same discipline as the earlier Prometheus
reconciliation: self-containment checked before every copy, isolated test
runs before combined runs, additive-only merges into files that had
independently diverged, and nothing wired into a live path unless its
safety could be proven from the source rather than assumed.

### Sub-wave A: OMNIA-V9 closure — DONE

The full `src/omnia-v9/` kernel + `integrations/` tree (36 files), Cedar
policy (`policy/omnia-v9/`), integration config (`config/omnia-v9/`),
migrations 005-011, and `artifacts/omnia-v9/` were recovered verbatim from
the archive. `canonical.mjs`/`schema.mjs`/`kernel.mjs` were already present
and byte-identical, so were not re-copied. All 36 `tests/omnia-v9*.test.mjs`
files were recovered **except** `omnia-v9-integration-pipeline.test.mjs`,
which requires the AUTHORITATIVE gate wiring described below and was
deliberately excluded.

One new dependency was added: `@cedar-policy/cedar-wasm`.

**Live-path wiring — deliberately partial.** `src/omnia-v9/final-admission-shadow.mjs`'s
`observeOutboundFinalAdmission()` is structurally incapable of blocking or
altering a send (every path is try/catch-wrapped and degrades to a
harmless logged `NO_HOOK`/`REVIEW`/`SHADOW_ERROR` observation on any
failure — provable from the source and confirmed by its own tests). This
non-authoritative shadow observer is now wired into `src/pipeline.mjs`
(called right after `markOutboundReservation(..., 'dispatching')`) and,
mode-gated via `resolveOmniaV9Mode(process.env)` (default `'off'`, and the
resolver can never escalate past its allowlist of
`off|shadow|compare|canary_null`), into both `worker.mjs` and `server.mjs`
via `resolveOutboundFinalAdmissionHook({ mode, store })`.

The AUTHORITATIVE `outbound-consequence-gate.mjs` + `GmailEffectAdapter`
live-send wiring that the archive's own `worker.mjs` also carried
(`createAuthoritativeOutreachConsequenceGate`) was **not** ported. Wiring an
authoritative gate into the live send path is a materially different, much
higher-risk decision than wiring a non-blocking observer, and doing it
correctly requires reconciling it against this branch's own later,
non-overlapping work (the Prometheus economic spine, domain/mailbox
readiness OS) that did not exist when the archive's wiring was written.
This is recorded as an explicit open decision, not an oversight.

`src/capability-graph.mjs`'s `omnia-v9-kernel` entry was updated from
`MISSING` to `TEST_VERIFIED` to reflect this; `tests/capability-graph.test.mjs`
was updated in the same commit (the old test asserted the kernel was
still a stranded, off-branch lineage — that assertion is no longer true,
so the test was rewritten to check the new truth, and a replacement
"still-stranded" assertion was pointed at `canon-v3-acquisition-cycle`,
which genuinely is still off this branch).

### Sub-wave B: outreach / lead-generation module family — DONE, self-contained scope

`src/outreach-governance.mjs`, `outreach-workbench.mjs`, `outreach-operator.mjs`,
`outreach-automation.mjs`, `outreach-provider-events.mjs`, `outreach-upgrades.mjs`,
`opportunity-factory.mjs`, `lead-generation.mjs`, `lead-generation-benchmark.mjs`,
`lead-intelligence-v3.mjs`, `lead-operations.mjs` (plus their 11 test files,
`data/opportunity-factory/seed-register.json`, and
`scripts/opportunity-factory-dry-run.mjs`) were recovered after confirming
each module's import graph has zero coupling to any file that differs
between this branch and the archive. `src/gmail.mjs` and
`src/prospect-import.mjs` were replaced with the archive's strict supersets
(additive fields only; existing callers' signatures unaffected).

`src/store.mjs` gained 10 new first-class collections (`providerEvents`,
`leadLists`, `replyDrafts`, `automationPlans`, `automationRuns`,
`leadSearches`, `leadSignals`, `leadEnrichmentRuns`, `leadIntakeEvents`,
`leadFieldResults`, `leadTasks`) plus their uniqueness constraints and
migrations 012-017 — additive-only, confirmed safe because the base 20
collections were byte-identical between branch and archive and
`PostgresStore.migrate()` is generic/migration-file-driven.

`src/config.mjs` gained the archive's `outbound.launchPhase`, `provider`,
`useEffectAdapter` (defaulted `false`, diverging from the archive's `true`
— nothing consumes it yet), `messageIdDomain`, `approvalSecret`,
`webhookSecret`, `webhookMaxAgeSeconds`, `approverId` (defaulted `''`, not
hardcoded to a name), `canaryDailyCap`, `canaryHourlyCap`,
`canaryMinGapSeconds`, `routeEvidenceMaxAgeDays`, `recipientCooldownDays`,
`domainCooldownDays`, and a new `leadCapture` block — all additive, all
explicitly commented as recovered-but-not-yet-consulted config surface.
The archive's stricter `validateConfig` live-outbound checks were **not**
ported (this branch has its own separate live-outbound validation logic
that would need its own careful review).

`docs/outreach/`, `docs/opportunities/`, `docs/lead-generation/` (17 files
total, dated 2026-08-12/2026-08-13) were recovered verbatim — zero filename
collisions with this branch's existing flat `docs/OUTREACH_*.md` files.
They are historical planning/comparison documents from the archive's own
period, not live-state claims about this branch; `INSTANTLY_PARITY_LEDGER_2026-08-12.md`
in particular already carries its own explicit "not a claim that UberBond
is an Instantly API-compatible replacement" disclaimer, consistent with
this mission's rule against unproven superiority claims.

`src/capability-graph.mjs` gained 11 new entries for this module family,
each honestly noting what is and is not yet wired to a live path.

`docs/LIMITATIONS.md` differed between branch and archive (this branch's
copy has evolved further since); it was **not** overwritten.

### Sub-wave C: HTTP route surface + operator UI — DEFERRED, not executed this wave

The archive's `server.mjs` (2061 lines) adds roughly 53 new `/api/outreach/*`
and `/api/leadgen/*` routes against this branch's independently-evolved,
501-line `server.mjs` (50 routes). This is not a small additive merge: it
is a route-by-route reconciliation at a scale comparable to the entire
rest of this recovery wave combined, several of the new routes are
public/unauthenticated surfaces (`/api/public/lead-capture`) that need
their own rate-limiting and input-validation review before being exposed,
and the archive's `worker.mjs`/`server.mjs` wiring for these routes
predates and does not account for this branch's later Prometheus/domain-
mailbox work. Attempting it in the same pass as Sub-waves A/B would be
exactly the "blindly copy files" failure mode this mission's own rules
warn against.

`public/outreach.html`/`outreach.js`/`outreach.css` (161KB combined) are
100% dependent on those same routes — every fetch call in `outreach.js`
targets an endpoint that does not exist on this branch yet. Recovering the
UI without the routes would ship a non-functional control surface, which
would itself be a form of the fabrication this mission explicitly forbids.
It was left uncopied.

`src/job-handlers.mjs` needed no action: the archive's version is an
11-line stub with no outreach/lead-gen job types (this branch's own
393-line version, built for the Prometheus economic spine, is strictly
more developed). There was nothing to recover.

Sub-wave C is recorded as the next well-scoped unit of work, not as
something abandoned. It should be executed as its own reconciliation pass
(compare, choose canonical route shapes, add security review for public
endpoints, then re-point the UI at whatever survives) rather than folded
into this one.

## Entity-mapping table (this mission's Wave 1 names vs. what already exists)

Built two waves ago tonight, real and tested (589/589 passing before this
wave began). Rather than create a second model under the new names, each
requested entity is mapped onto its existing canonical implementation:

| This mission's requested entity | Canonical implementation | Notes |
|---|---|---|
| `SendingDomain` | `src/sending-domain-registry.mjs` | Exact 13-state machine already matches this mission's list verbatim. |
| `SendingMailbox` | `src/sending-mailbox-registry.mjs` | Extended this wave with `hourlyCap` and `warmupAgeDays` (were missing) — see changed files. |
| `EmailProvider` | `src/provider-adapter-contract.mjs` | The provider capability manifest + `resolveProviderAdapter()` *is* the EmailProvider record; not a separate collection. |
| `DNSSnapshot` | `sending_domain_event` records of kind `DNS_VERIFIED` (via `src/dns-verification.mjs` + `recordDomainDnsVerification()`) | Each verification is its own immutable receipt in the domain's event history — a snapshot by construction. |
| `WarmupPlan` | `plannedWarmupCapForDay()` in `src/warmup-orchestrator.mjs` | A pure function, not a stored plan record — the ramp schedule is deterministic from `warmupStartTime` alone, so persisting a separate plan would be a redundant, driftable second source of truth. |
| `WarmupEvent` | `sending_mailbox_event` records of kind `WARMUP_STATUS_CHANGED` | Already a full event history. |
| `MailboxHealthSnapshot` | `sending_mailbox_event` records of kind `AUTHENTICATION_CHECKED` / `PROVIDER_HEALTH_CHECKED` | Same pattern. |
| `ProviderReceipt` | `redactProviderReceipt()` output, persisted inside the above events | Never stored raw; always redacted before persistence. |
| `DeliverabilityIncident` | `src/domain-mailbox-circuit-breaker.mjs`'s `evaluateCircuitBreaker()` triggers, persisted via `recordMailboxPause()`/`recordDomainPause()` | Each trigger already carries reasonCode/scope/evidenceRefs/safeRecoveryAction/ownerRequired exactly as this mission's incident record would need. |
| `OutreachAuthorization` | `recordOutreachAuthorized()` in `src/sending-domain-registry.mjs` | The only event kind that can move a domain to `READY_FOR_LIMITED_OUTREACH`. |

This reconciliation follows the mission's own "Canonical Architecture Rule":
compare, choose one, document the rejected approach (a second, literally-named
set of collections), avoid duplication.

## DNS status vocabulary reconciliation

This mission's Wave 3 requests `GREEN_CONFIGURED` / `YELLOW_PROPAGATING` /
`RED_MISSING` / `RED_CONTRADICTORY` / `UNKNOWN_PROVIDER_REQUIREMENT` /
`EXTERNAL_CHECK_REQUIRED`. The existing, tested `src/dns-verification.mjs`
already uses a semantically equivalent, shorter vocabulary (`GREEN` /
`YELLOW` / `RED` / `BLOCKED`) with the exact same distinctions (configured /
propagating-or-transient / missing-or-contradictory / provider-requirement-unknown).
**Decision: keep the existing vocabulary as canonical.** Renaming four enum
values across a tested module, its 13 DNS-specific hostile tests, and every
caller would be pure churn with zero new capability — exactly the kind of
duplicate-naming risk the mission's own architecture rule warns against.
This is a recorded, deliberate reconciliation decision, not an oversight.
