# UberWarm² Real Seed Execution + Durable Evidence Upgrade

Date: 2026-10-12
Base source: original `mohammedwessam2007/uberbondd` main `298bd585d3ba0cf1fe5cdc2f81a525eb67819608`
Truth class: **BRANCHED SOURCE IMPLEMENTATION** until review, exact-source CI and rollout. **NOT DEPLOYED**, **NO PROVIDER SEND ACTIVATED**, **NO STARTUP PURCHASE**, **NO PAID WARM-UP**, **NO EXTERNAL NETWORK REPUTATION CLAIM**.

## Why this upgrade

The founder requested all missing layers necessary to eliminate the $0.60/mailbox/month provider warming fee, while preserving UberBond's actual reputation and deliverability truth.

Already implemented before this change:
- `src/uberwarm2-sovereign-ramp.mjs`: evidence plan, fleet ramp decision, defensive truth boundary;
- `src/uberwarm-reputation-lab.mjs`: per-mailbox health, quarantine, bounded caps;
- `src/uberplacement.mjs`: owner-controlled recipient-network seed plans;
- `src/warmup-orchestrator.mjs`: provider-native start/status interface and readiness rules;
- `src/uberquality-capacity-governor.mjs`, SMTP/IMAP/reply and Winnr adapters.

**The honest distinction:** the AI can own all internal software surrounding warming. A separate network of independent, consenting recipient mailboxes and their authentic network decisions cannot be created by writing JavaScript. Winnr's paid network is a physical, external resource, not merely an algorithm.

## New implementation

| Layer | New artifact | What actually changed |
|---|---|---|
| Real probe contract | `src/uberwarm2-seed-executor.mjs` | Compile an exact manifest exclusively from authenticated, unpaused sending mailboxes and owner-controlled, receive-ready, consenting seed addresses with recorded consent evidence |
| Approval | Same module | Requires explicit unexpired owner approval with the exact batch digest and `uberwarm2:owner-controlled-seed-test` scope |
| Sender execution | Same module | Optional injected `transport.sendOwnedSeed`, restricted to the manifest's sender and seed, with a literal transparent test subject/body; no automated replies, no spam rescue, no prospect messages |
| Durable reservation | `src/uberwarm2-pg-ledger.mjs` | Shared Postgres `BEGIN` + transaction-scoped advisory day lock, atomic per-sender/day 2 probe cap, fleet/day 100 cap, durable one-shot claim and finalization |
| Schema | `migrations/20261012_uberwarm2_seed_one_shot.sql` | Reservation table with primary key, sender/day indexes, status and safe receipt. No migration automatically applied |
| External observation | `compileUberWarm2ReceivedEvidence` | Requires exact sent message ID, exact recipient/sender, independent receiving-provider evidence pointer and observation timestamp before using Inbox/Spam signal |
| Identity integrity | `src/uberplacement.mjs` | Existing placement report now rejects observations falsely using a planned probe ID for a different sender/seed/recipient provider |
| Hostile tests | `tests/uberwarm2-seed-executor.test.mjs`, `tests/uberwarm2-pg-ledger.test.mjs` | Permission, poisoning, replay, cap, network uncertainty and evidence-correlation fixtures |

All new probe operations **fail closed** when actual authenticated provider send, real seed recipient consent, explicit approval or atomic durable storage is missing. TCP/SMTP provider acceptance is **not inbox delivery**. PostgreSQL finalization uncertainty is **not retry authority**.

## What is NOT implemented, and must not be misrepresented

- A network equivalent to Winnr's own participating real recipient inboxes.
- A cryptographically independently attested inbox provider feed. The caller must supply an authorized, trusted receiving-side observation adapter; arbitrary self-attested text is not proof.
- Live warm-up activation in Render, mailbox/GoDaddy DNS mutation, additional Winnr entitlement purchase, credential injection, or sender promotion.
- Artificial positive replies, generated replies for reputation farming, spam-folder rescue, reciprocal exchanges disguised as human engagement, or evasion of anti-abuse systems.
- No guarantee that outbound canaries translate to cold prospect inbox placement, even if all owner-controlled seeds report Inbox.
- The evidence preflight is not a legal permission decision or prospect send authorization.

## Activation pathway (requires actual owner/account prerequisites)

1. Keep the purchased $9 pilot intact; preserve quarantined ordinal #3 and always recheck live sender health.
2. For 50 *future* Startup mailboxes, first observe actual entitlement and import credentials only through the existing protected Winnr adapter.
3. Apply the migration on the **authorized isolated test database only**, verify schema, test the same module and store using independent PostgreSQL CI.
4. Register a *small* number of genuine willing seed recipients across **independent** recipient networks (e.g., one Gmail and one Microsoft account), obtaining clear permission and observation access. Two Gmail aliases do not equal two independent networks.
5. Bind an authorized authenticated SMTP provider to `transport.sendOwnedSeed`, and a **trusted** receiving-folder observation adapter to the exact provider message ID. Review batch digest and grant scoped approval. Send only a bounded transparent placement test.
6. Independently ingest provider/recipient observations into the existing `UberPlacement -> UberWarm -> UberQuality` decision path; keep missing evidence = missing, not successful.
7. Permit genuine gradual correspondence with willing contacts and only separately legally eligible first touches under the campaign governance workflow.
8. Compare real Inbox/Spam/complaint trends against the paid service without claiming equivalence until a sufficiently powered, credible controlled evaluation exists.

## Procurement impact

Provider warming addon is optional in code and support statements. This implementation strengthens the no-addon path but does **not** imply a zero-cost synthetic warming network, equivalence to vendor outcomes, or guaranteed 14/28-day readiness. A user may reasonably choose $0 addons and accept slower empirical ramp. The network cannot be replaced with internally simulated activity.

## Verification policy

Required before merge:
```bash
node --check src/uberwarm2-seed-executor.mjs
node --check src/uberwarm2-pg-ledger.mjs
node --check src/uberplacement.mjs
node --test tests/uberwarm2-seed-executor.test.mjs tests/uberwarm2-pg-ledger.test.mjs tests/uberwarm2-sovereign-ramp.test.mjs tests/uberplacement.test.mjs
```

Use independent exact-head GitHub Actions where original GitHub billing restrictions prevent CI. No success claim without a real runner's final logs and exact tested source SHA. Do not merge before reviewed green tests and policy checks.

## Founder 890/GENESIS lineage

Preserves all 890 source identities and source provenance by reference. This work is only the bounded revenue/distribution/reputation organ; it does not supersede higher-order UberBond mission goals or change the 890 corpus. Donors: UberWarm² synthesis, Warmbly and WarmGrid provenance in `docs/UBERWARM2_CAPABILITY_DONOR_SYNTHESIS_2026-10-01.md`. No proprietary vendor source copied.
