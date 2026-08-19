# Outreach OS Truth Reconstruction (Wave 0)

Bounded, completed search — not left open-ended. See
`docs/INSTANTLY_RECONCILIATION.md` for the full historical-artifact verdict.

## Current checkout

- Repository: `mohammedwessam2007/uberbondd`
- Branch: `claude/uberbond-overnight-shift-o73nrs`
- HEAD at the start of this wave: `194996c5afc0e473dedf4804bc8cec6d55a49e0f`
  (the Domain and Mailbox Readiness OS commit from the immediately prior wave
  tonight)
- `lite/`: untouched (`git status --short lite/` empty before and after)

## Repository list (accounts under this user)

| Repo | Visibility | Real content? |
|---|---|---|
| `mohammedwessam2007/uberbondd` | (this one) | Yes — the active UberBond codebase |
| `mohammedwessam2007/-uberbond-revenue-engine` | — | An earlier snapshot, same architecture/file layout, 2 commits total across all branches |
| `mohammedwessam2007/Uberbond-` | — | Effectively empty — README only, 1 commit |
| `mohammedwessam2007/Uberbond-repository-` | — | Near-empty — README + a 177-line generic `public/admin.html`/`admin.js` panel, 2 commits |

## Branch list

`uberbondd`: `main` + 22 other branches (`agent/omnia-v9-*` ×10,
`claude/*` ×5, `product/omnia-v9-*` ×5). All searched — see reconciliation
doc. Total commits reachable across every branch in all 4 repos: 189.

## Historical artifact search — commands and results

**Updated 2026-08-19, corrected**: the GitHub-side search (two bounded
passes: current repo, all local/remote branches, full git history,
dangling/unreachable git objects, GitHub-wide PR/commit/code search,
`/workspace`, `/tmp`) found zero matches — but the archive was never
pushed to GitHub at all, so that search could never have found it. The
owner then supplied `UBERBOND_LEAD_INTELLIGENCE_OUTREACH_COMPLETE_20260813.zip`
directly. It is real: valid, 380 files, own test suite passes (495/536, 41
skipped). Full account, exact provenance (traced to
`origin/claude/from-v9-complete-build-2026-08-10`, already in this repo's
git history, plus ~3 more days of never-pushed work), and the recovery
plan: `docs/INSTANTLY_RECONCILIATION.md`.

## What actually exists in the current repository (verified by reading code, not by trusting old reports)

The base UberBond product, pre-dating tonight's domain/mailbox work, is a
**real but narrow** audit-driven outbound lead-gen tool — not an
Instantly/Apollo/Clay-style general outreach platform:

| Concern | Real module | What it actually does |
|---|---|---|
| Prospect discovery | `src/discovery.mjs` + `src/discovery-runner.mjs` | Business discovery via the public OpenStreetMap Overpass API, bbox + category filtered. Lawful public source, no scraping. |
| Contact discovery/verification | `src/contacts.mjs` (34 lines) | Minimal: page-crawl-based email discovery + optional Hunter.io verification. Not a multi-provider waterfall. |
| Site auditing (the actual product hook) | `src/audit-rules.mjs`, `src/browser-crawler.mjs` | Real checks (e.g. missing structured data) that become the outreach's evidence/reason-to-contact. |
| Personalization | `src/copy.mjs` (17 lines), `src/dossier.mjs` (23 lines) | Template-based message/subject building keyed to the specific audit issue found. Not an evidence-confidence-scored, claim-validated generator (mission Wave 8's PASS/REVIEW/DENY evaluator does not exist yet). |
| Sending | `src/gmail.mjs` | **Real, working Gmail OAuth send/receive** — this is UberBond's actual, only working "provider adapter" today. Two fixed inbox slots (`accounts` collection, `A`/`B`), not an open mailbox registry. |
| Safety | `src/send-safety.mjs`, `src/deliverability-guard.mjs` | Real, tested: contact eligibility, business hours, country allowlist, suppression, sender-health pause. |
| Suppression / opt-out | `src/unsubscribe.mjs` | Real one-click unsubscribe token system. |
| Revenue | `src/payments.mjs`, `src/revenue.mjs`, `src/offer-compiler.mjs`, `src/opportunity-registry.mjs` | Real payment-truth classification and offer compilation — built in earlier waves this session, genuinely payment-proof-gated. |
| V9/OMNIA | `src/consequence-boundary.mjs` + `src/omnia-v9/` | Real, vendored, wired behind a default-off flag. |
| Domain/mailbox readiness | `src/sending-domain-registry.mjs`, `src/sending-mailbox-registry.mjs`, `src/dns-verification.mjs`, `src/provider-adapter-contract.mjs`, `src/warmup-orchestrator.mjs`, `src/domain-mailbox-circuit-breaker.mjs`, `src/live-activation-gate.mjs`, `src/domain-mailbox-gate.mjs`, `src/domain-mailbox-control-center.mjs` | **Built two waves ago tonight, real and tested.** This is the actual answer to most of this mission's Wave 1-4 asks — see the reconciliation section below for how it maps onto this mission's requested entity names. |

Explicitly absent, confirmed by reading the source tree, not by a filename
search: a unified inbox (Unibox equivalent), sequence branching beyond a
flat template, an ICP/account-search builder, a multi-provider enrichment
waterfall, and an ESP other than Gmail (no Instantly/Google Workspace
Admin/Microsoft 365 adapter).

## Duplicate implementations found this wave

None new. The 7-pair Prometheus economic-spine duplication from earlier
tonight was already fully reconciled (see
`docs/PROMETHEUS_PARALLEL_SPINE_RECONCILIATION.md`) before this mission
began. This wave's own new work maps onto entity names this mission
requests (`EmailProvider`, `DNSSnapshot`, `WarmupPlan`, `WarmupEvent`,
`MailboxHealthSnapshot`, `ProviderReceipt`, `DeliverabilityIncident`,
`OutreachAuthorization`) that already have a real, tested implementation
under different names from two waves ago — see
`docs/INSTANTLY_RECONCILIATION.md`'s entity-mapping table for the explicit
one-to-one reconciliation, so no duplicate model was created for those.

## Protected paths

`lite/` (never touched, verified via `git status --short lite/`), no DNS
mutation capability anywhere in `src/dns-verification.mjs` (no `dns.set*`
call exists in the module), no credential-shaped field accepted by
`src/sending-mailbox-registry.mjs` (structural rejection, tested).

## Tests (actually run, not quoted from an old report)

`npm run check` (syntax + full deterministic suite) at the start of this
wave: **589/589 pass**, 0 failures, 0 syntax errors. Re-run after this
wave's changes — see the final report.

## Current deployment state

Unchanged from every prior wave this session: 0 real deployments, `main`
untouched, no Vercel domain attachment exists or was added.

## Current commercial state

$0 real revenue, 0 real customers, 0 real cleared payments, 0 real cold
outreach ever sent by any session. Confirmed via `store.mjs`'s `orders`/
`subscriptions` collections having no live-provider-proof entries and via
the payment-truth policy (`src/payments.mjs`) requiring real provider event
proof for anything to count as revenue.

## Exact first missing invariant

**No configured outreach-sending provider exists beyond Gmail, and Gmail
itself has no native warm-up capability.** Every downstream capability this
mission asks for (mailbox registry population, DNS verification against a
real domain, warm-up activation) is technically ready and tested against a
real domain the moment one is registered, but converges on this same single
upstream gap. See `docs/OUTREACH_ACTIVATION_CARD.md`.
