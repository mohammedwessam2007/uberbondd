# PHOENIX / UberWarm⁵: protect the actual UberReach capacity computation

Date: 2026-10-12
Truth class: COMMITTED DRAFT SOURCE + INDEPENDENT V8 BEHAVIOR CHECK, NOT DEPLOYED AND NOT LIVE INBOX PROOF.
Founder instruction: upgrade hard until the alternative is provably better; no unnecessary warming SaaS cost. No user decision menu required.

## Major new integration

Previous UberWarm⁴ receiver circuit-breaker and per-recipient dispatch guard were advisory library modules. The existing `src/uberreach-control-plane.mjs` built numerical outreach-capacity plans from `compileUberWarmFleet()` without requiring this more recent receiver/incident state. A historical scenario test could claim a 1,000/day **planning ceiling**, even if no complete receiving-provider incident ledger existed.

Current draft PR #1403 now adds:

- `src/uberwarm5-capacity-bridge.mjs`: restrictive overlay on the existing historical warm fleet. A missing/stale/future, unverified, malformed or duplicate receiving report sets nominal sender caps **to 0**. Uses a 15-minute freshness ceiling, server-injected independent report verifier, matching sender roster and blocked provider-group/domain set. Historical quarantine cannot be cleared. Caps can never be increased and are capped at 20 per sender at this advisory tier.
- `src/uberreach-control-plane.mjs`: its existing **numeric `capacityInputs` route** now calls the bridge before `compileQualityPreservingOutreachCapacity()`. Missing receiver protection leads to zero quality-preserving planning capacity; active network holds reduce the affected sender cap before any aggregate number is advertised. Preview calls without `capacityInputs` retain their historical advisory meaning and do not gain external send authority.
- `tests/uberwarm5-capacity-bridge.test.mjs`: 10 hostile cases (missing evidence, stale/forged evidence, duplicate sender identifiers, unknown hold state, active domain hold, missing roster sender, historical quarantine, no incremental cap, no external effects).
- `tests/uberreach-capacity-integration.test.mjs`: replaces historical optimistic 1000/day-on-unsupported-data assertion with zero, plus fixtures demonstrating true verified-history -> bounded nominal 1000/day and provider-hold -> zero.
- Does NOT modify production SMTP/IMAP, DNS, GitHub main, payment, recipient consent, legal checks or money movement.

## Tests and truth boundaries

- `tests/uberwarm5-capacity-bridge.test.mjs` 10/10 PASS in fetched **latest GitHub branch** ESM-transformed V8 behavior harness.
- `tests/uberreach-capacity-integration.test.mjs` 3/3 PASS against latest fetched `uberreach-control-plane.mjs`, real current quality-capacity code and protective bridge, with unrelated external UberReach dependencies replaced by test stubs; not actual `node --test` or production.
- **13/13 new integration-focused behavioral cases** on this new PR head.
- Previous phase: 46/46 UberWarm³/⁴ V8 behavioral tests against earlier PR head. Cannot claim one exact-head all-green Node CI by summing independent historical test runs.
- Original GitHub Actions remain unable to actually execute jobs (all latest workflow jobs had no run steps and failed). Independent fork successfully ran historical tested SHA earlier but has not tested THIS PR head. Real PostgreSQL/SMTP receiver-integrity integration and exact-head CI remain open.
- Live receiving network mail delivery superiority vs Winnr: UNKNOWN. Genuine $0 incremental add-on *purchase decision* stands on cost and absence of independent paid warming uplift evidence, not measured technical superiority.
- Still no protected real provider ingestion client wiring or persistent real user suppression reconciliation for UberWarm⁴. Production dispatch continues to be separately governed; source-only capacity reduction is not proof of live rollout.

## Minimum sufficient next gates

1. Run Node 22 actual `node --test tests/uberwarm5-capacity-bridge.test.mjs tests/uberreach-capacity-integration.test.mjs` and full trusted PR suite in an authorized free runner.
2. Bind protected receiver/incident ledger verification and fresh receiving MX group mapping from the actual runtime before deploying the UberReach capacity change; stale or missing input must be rejected, not bypassed.
3. Obtain real consenting independent recipient-provider folder evidence and official SPF/DKIM/DMARC/Postmaster read access to monitor genuine sending reputation.
4. Compare against any paid alternative with genuinely eligible, authenticated matched real recipients and allowed traffic; no fake engagement, no deliverability promises or unauthorized purchases.
5. Merge to main only with verified exact-head tests and owner consequence authority; no production launch or payment without approval.

## No-drop identity and economics

UberWarm⁵ is a contained capability organ of UberBond and Sovereign Cognitive Continuum; does not displace any original founder-moonshot-0001..0890 stable identity, provenance or GENESIS >890 donor. North star is *risk-adjusted cleared contribution profit per founder minute*, not emails/day, badge counts, mathematical inevitability or SaaS cloning volume.

The publicly documented free baseline is authentic sender compliance, low complaint rates, strict suppression, provider-specific received evidence, gradual lawful delivery and independent performance measurement. Competing warm-up network vendors are not inherently fraudulent, nor is paid warming universally useless. The correct current buying decision is not to pay for optional warming absent credible incremental ROI.
