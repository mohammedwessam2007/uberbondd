# UberWarm² zero-add-on owner-seed execution bridge

Date: 2026-10-12. Baseline: original `main` at `298bd585d3ba0cf1fe5cdc2f81a525eb67819608`.

## Goal and boundary

Remove unnecessary software dependency on the $0.60/mailbox/month optional Winnr warm-up product. **Do not claim parity with Winnr's independent engaged-inbox network.** AI may schedule, deduplicate, observe and govern. Only genuine recipient providers/people can establish real placement and engagement. This capability is for **owner-authorized and owner/consenter-controlled delivery tests**, not synthetic positive engagement, mass cold dispatch, automatic replies or spam-folder rescue.

## Additive software implementation

- `src/uberwarm2-seed-execution.mjs`: bounded per-provider seed plans with exact batch digest, 45-minute expiration, sender authentication/DNS/terms evidence, owner and receiver permission evidence; execution of exactly one founder-authorized seed probe with exact from/to, atomic daily sender+seed reservation and no retry after uncertain effect; receiver-verified folder observations and evidence-only reporting.
- `src/uberwarm2-smtp-seed-adapter.mjs`: uses existing encrypted `UberFleet` credentials and `UberSMTP` transport for actual provider-origin delivery on the bound mailbox, if and only if a trusted caller supplies the exact authorized adapter.
- `src/uberwarm2-postgres-seed-ledger.mjs`: durable PostgreSQL reservation ledger using advisory transaction locks; separate SQL migration creates table. No migration is applied by this PR.
- `tests/uberwarm2-seed-execution.test.mjs`: hostile unit tests with injected fake adapter/ledger, **no external sends**.
- Existing `src/uberwarm2-sovereign-ramp.mjs`, `src/uberwarm-reputation-lab.mjs`, `src/uberplacement.mjs`, `src/uberwarm2-registry-bridge.mjs` remain governing components. No weakening of existing quarantines, canonical legal gates or outreach authorizations.

## Integration checklist (not yet deployed)

1. Apply SQL migration under a reviewed deployment, not in a blind boot or automated producer.
2. Trusted owner-authenticated server route constructs a verified allowlist (real Winnr mailboxes and a small number of genuine consenting/owned recipient accounts) and sources *actual current* sender DNS/auth/terms observations; never accept the authorization object directly from public clients.
3. Construct one seed plan; owner approves the **exact batch digest and exact single probe**. The server verifies authenticated session, issuance, expiry, nonce use and scope before invoking the executor. Input booleans are policy contracts, not proof on their own.
4. Use `createUberWarm2PostgresSeedLedger({pool})` with live PostgreSQL, and `createUberWarm2SmtpSeedAdapter` with the already-provisioned encrypted UberFleet account and key; execute one bounded diagnostic probe. Do not retry uncertain SMTP outcomes.
5. Ingest real receiving-side Gmail/Outlook/other mailbox folder observations via authenticated receivers and carry proof refs. The observation bridge does not scrape private inboxes or mark messages read, reply, or move spam.
6. Feed only reconciled, sufficiently diverse/fresh **actual** observations into `UberWarm²` and retain the existing domain/mailbox circuit breakers. No generic campaign authority follows from seed-placement success.

## Known external and software blockers

- Exactly two connected Gmail accounts are in the **same Google recipient network**, not two independent networks.
- Winnr Startup 50-mailbox subscription remains unpurchased; the $9 three-mailbox pre-warmed pilot is the only documented provider account. Third pilot sender remains quarantined.
- No authenticated outbound Winnr API/MCP connection, new email send, production route, deployment or DNS mutation is made in this PR.
- No independent external-warming network or real recipient behavior was created. Zero-add-on evidence ramp may be slower than a vendor-managed pool; equal deliverability/economic effect remains UNKNOWN.
- Before commercial first touches, separately clear external route legal eligibility, exact contact verification, G-SPOT dispatch, sender health and owner authorization. Previous live queue had 0 qualified contacts.
- Unit tests prove code behavior only; independent exact-head CI, actual PostgreSQL transaction run, live SMTP/IMAP acceptance, real receiving-provider placement and sender reputation lift are not established.

## PHOENIX provenance

Founder request: `Upgrade it ... Add all the missing layers so there is genuinely no difference` (Oct 12). Donors: `docs/UBERWARM2_CAPABILITY_DONOR_SYNTHESIS_2026-10-01.md` (Warmbly, WarmGrid, Winnr MIT MCP reference), `docs/WARMUP_POLICY.md`, original `src/uberplacement.mjs`, `src/ubersmtp-submission-adapter.mjs`, `src/uberfleet.mjs`. No donor source copied or licenses changed. Founder moonshot corpus 0001–0890 unchanged and preserved by canonical pointers.