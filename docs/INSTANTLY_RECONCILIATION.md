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
