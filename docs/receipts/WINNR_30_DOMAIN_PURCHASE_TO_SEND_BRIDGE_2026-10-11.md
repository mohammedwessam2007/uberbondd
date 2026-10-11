# Winnr 30-domain / 50-mailbox purchase-to-send bridge | 2026-10-11

**Status:** `SOURCE_FIX_VERIFIED_LOCALLY__PR_PENDING__NO_PURCHASE__NO_SEND`. This is an incremental correction to the existing UberBond domain/fleet planner, not a new outreach product or permission to contact clients.

## What actually exists, not two domains

The authoritative source is [`src/outreach-domain-fleet.mjs`](../../src/outreach-domain-fleet.mjs) and [`artifacts/outreach/godaddy-domain-fleet-2026-09-20.json`](../../artifacts/outreach/godaddy-domain-fleet-2026-09-20.json). The authenticated September 20 GoDaddy portfolio observation recorded **30 owned domains**: 2 original canonical roots (`uberbond.agency`, `uberbond.cloud`) and **28 owned outreach-fleet domains**. The 28 names are reproduced exactly in the existing fleet registry. Source records are dated registrar evidence, not present-tense proof that all domains are DNS/mail ready. Founder stated on September 25 that all 30 are potential outreach domains; the source's protected-root policy remains a deliberately conservative infrastructure/brand boundary unless a separate owner-approved policy change is made.

The $9/month three-mailbox pilot is on separately leased `cedarpointdomains.com`; it is not a 31st founder-owned domain and does not consume the Startup plan's self-owned domain slots. Current latest Send Authority observed is NONE; sender #3 had protective placement quarantine, and the Oct9 SMTP probe had already expired.

## Actual missing software check fixed

Previous `src/winnr-expansion-planner.mjs` distinguished purchased mailbox `mailboxLimit` from observed mailboxes and refused invented send capacity. **But it did not consider the provider's separate domain-slot entitlement**, so a hypothetical 50 mailbox Startup entitlement (50 boxes / initial 10 domains) could be treated as enough to plan the fleet across more than 10 domains.

The patch:
1. Adds separate `domainLimit` to *observed* entitlement; accepts safe positive integer numerical or numeric-string provider responses; does not infer domain-slot increases from Winnr's advertised free option.
2. Counts only active planned sending domains (not protected roots or reserved spare domains) as consumed provider slots.
3. Refuses an expansion when the true provider slot limit is unobserved, insufficient, expired by 24 hours or future-dated outside five-minute drift allowance; no bypass if 50 mailbox quota is separately adequate.
4. Surfaces `requiredDomainSlots`, `observedDomainSlots`, `providerEntitlementFresh` and `domainSlotsReadyForExpansion` on the existing canonical planner output.
5. Preserves existing no-send, no-spend, exact owner authorization, no quarantine replacement, idempotency and zero-new-mailbox ramp defaults.

## Actual topology and Winnr's current first-party price schedule

For a prudent *planned* 50 new-mailbox allocation against the 30-domain registrar inventory:
- Preserve 2 original canonical roots as protected in the existing policy.
- From the 28 other domains, reserve `ceil(28×0.2)=6` domains, leaving **22 active potential sending domains**.
- Distribute **50** boxes across those 22, maximum 3/domain, with first ramp stage **zero cold messages/day**. This needs **22 provider domain slots**, not merely the purchased 50 mailbox allotment.
- Winnr Startup's published initial domain cap is 10, **free self-service increases 10 → 20 → 40 in Settings → Subscription**. The provider currently says only one increase per 24 hours. Therefore the 22-domain topology needs observation of the later 40-slot cap, which may involve at least a 24-hour spacing between two actions. A published ability to raise slots is not proof the account now has 40.
- Account cost is published **$69/month, 50 email accounts**; owned GoDaddy domain connection is free. Optional 50-account Winnr warming costs `50×$0.60 = $30/month` when actually enabled, not part of the $69. The separate existing $9 prewarmed pilot remains a separate line item unless deliberately cancelled. If both base subscriptions and all 50 warming are retained, the listed monthly amounts sum to **$108 before checkout-specific tax/extras**. The startup product alone could remain $69 without optional warming, but un-warmed new mailboxes have no established cold volume.
- Winnr's provider guidance recommends **at least 2 weeks of warmup, often closer to 4 for newly connected domains** and 10–20 cold sends per matured mailbox per day, not the advertised 50/day total including warming. These are provider guidelines, not actual inbox proof.

First-party evidence: https://winnr.app/pricing.html and https://winnr.app/help/billing/domain-limit-increase.html

## Test receipts

The exact GitHub branch source and its test dependencies were transferred losslessly, each reconstructed file checked against its **Git blob SHA**, then tested under **Node v22.16.0**.

`node --test tests/winnr-real-30-domain-slots.test.mjs tests/winnr-expansion-planner.test.mjs`

**22 passed / 0 failed / 0 skipped**: 13 pre-existing expansion planner tests + 9 actual-portfolio/regression tests. Behaviors covered include 30 (2+28) source identity, 50 on 22 after reserve, 10→20→40 slot shortage/proof, numeric-string support, 24h stale/future entitlement refusal, separate leased pilot, zero cold send cap, no authorized effects. This is a genuine local Node test receipt **not** hosted CI, not a merge/deployment, and not a provider API proof.

## Purchase gate vs rollout vs first actual campaign

**PURCHASE_READY** requires the private logged-in Winnr checkout confirming $69/month, 50 included mailboxes, correct billing/renewal/extra services, payment method and explicit owner approval of the charge. Contra/wallet/KYC/client payment and an outside attorney are not dependencies *to purchasing the Startup SKU*. **No purchase was performed here**.

**ROLL_OUT_READY** additionally requires owner-authenticated observed plan/domain-slot state, GoDaddy/DNS access, domain connections, real truthful mailboxes, credential custody, per-mailbox SMTP/IMAP/auth, independent placement and earned warmup. Do not mutate DNS or connect provider accounts based on an archived purchase narrative.

**SEND_READY** additionally requires current exact verified prospect/source, contact suppression, sender-side and recipient-side applicable eligibility, truthful identity/opt-out footer, exact G-SPOT digest and owner consent for the particular outbound effect. Founder reassurance of lawfulness is a user assertion; a system cannot conjure recipient/provider-specific evidence. No bulk campaign activation or SMTP message occurred.

**COLLECTION_READY** is still intentionally last per founder Oct9 instruction. This patch does not make Contra ready or claim actual cleared cash.

## No-amputation references

- `docs/handoffs/WORK_CURRENT.md`
- `docs/handoffs/OUTREACH_WINNR_69_PURCHASE_EVIDENCE_2026-10-08.md`
- `docs/handoffs/OUTREACH_PREPAYMENT_CURRENT_2026-10-09.md`
- `docs/handoffs/LEADGEN_OUTREACH_FULL_RECOVERY_2026-10-09.md`
- `src/outreach-domain-fleet.mjs`, `src/winnr-expansion-planner.mjs`, `tests/winnr-expansion-planner.test.mjs`
- PRs #1379, #1380, #1385, #1386 remain separate and unmerged. Nothing in this patch replaces their owner/provider/legal/freshness work.

**Next execution after review:** reconcile this branch with main, merge only with passing review/tests and independently verify deployment. Then use the existing authenticated Winnr account to observe real purchased entitlement, raise free domain slots when allowed, connect exact owned domains and provision mailboxes gradually. Use the old pilot for the first individually approved permitted outbound test once current proofs pass; do not equate a purchased 50-seat license with a warm 50-mailbox campaign.
