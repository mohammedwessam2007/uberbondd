# Winnr Canonical Vault

Status: **CURRENT WINNR RETRIEVAL ROOT**

Updated: 2026-10-02

This directory is the durable, secret-free recovery root for UberBond's Winnr sender-substrate pilot. It preserves what was bought, why it was bought, what was implemented, what was externally verified, what failed, what superseded earlier conclusions, what remains blocked, and exactly how to continue without restarting the mission.

## Current one-line truth

`PURCHASED -> PROVISIONED -> ENCRYPTED_CUSTODY -> SMTP_3_OF_3 -> IMAP_3_OF_3 -> REPLIES_2_OF_2_INGESTIBLE -> HUMAN_PHENOTYPE_GMAIL_2_OF_3_INBOX -> SMTP_ORDINAL_3_QUARANTINED`

Transport is verified. Reply ingestibility is verified. Placement is not promoted.

Latest additive evidence: the separate personal-Gmail test delivered all three messages to INBOX with SPF, aligned DKIM and DMARC passing. Technical integration is complete. Prospect campaign promotion and the existing ordinal-3 fleet pause remain separate. See `PERSONAL_INBOX_RECONCILIATION_2026-10-02.md` for exact message/deployment receipts.

## Read order

1. [CURRENT_STATE.md](./CURRENT_STATE.md)
2. [EXECUTION_LINEAGE.md](./EXECUTION_LINEAGE.md)
3. [EVIDENCE_INDEX.md](./EVIDENCE_INDEX.md)
4. [PLACEMENT_RECOVERY.md](./PLACEMENT_RECOVERY.md)
5. [NEXT_STEPS.md](./NEXT_STEPS.md)
6. [SECURITY_BOUNDARIES.md](./SECURITY_BOUNDARIES.md)
7. [FINAL_ACTIVATION_2026-10-02.md](./FINAL_ACTIVATION_2026-10-02.md)
8. [PERSONAL_INBOX_RECONCILIATION_2026-10-02.md](./PERSONAL_INBOX_RECONCILIATION_2026-10-02.md)
9. [SMTP canary approval repair](../docs/receipts/WINNR_SMTP_CANARY_APPROVAL_20261002.md): fleet sender approval support and the remaining campaign gates; no new send or warming activation claimed.
10. [First-send handoff (Terminal V2)](../docs/receipts/WINNR_TERMINAL_V2_FIRST_SEND_HANDOFF_20261002.md): current source refuses cold `PUBLIC_BUSINESS_CONTACT` routes on every provider; exact identity field set; owner queue; production unreachable from cloud session.
11. [Cold-route policy evidence (V1, inert; rev 4)](../docs/receipts/COLD_ROUTE_POLICY_EVIDENCE_20261002.md): Powerhouse ingested through the intake (INCOMPLETE, 3 machine-resolvable gaps in `artifacts/outreach/powerhouse-followup-request-20261002.json`), conditional message tournament and unminted effect package under `artifacts/outreach/`.

Machine-readable observations: [CURRENT_STATE.json](./CURRENT_STATE.json). Independent recheck: [LIVE_RECONCILIATION_2026-10-02.md](./LIVE_RECONCILIATION_2026-10-02.md). Refresh live truth before acting.

## Active Claude Code execution overlay

For the current founder-directed continuation from this recovered Winnr state into real commercial evidence, Claude Code should load `../docs/prompts/CLAUDE_OPUS55_WINNR_FIRST_CASH_OPEN_ENDED_MEGA_MISSION_2026-10-02.md` via the root `CLAUDE.md`. That overlay is intentionally open-ended: recover this vault first, then continue through the next lawful evidence-backed bottleneck rather than repeating purchase, credential import or transport setup.

## Canonical upstream evidence

Do not duplicate or silently supersede these source receipts:

- `docs/WINNR_SUPPORT_RECONCILIATION_2026-10-02.md`
- `docs/WINNR_PREPURCHASE_GATE_2026-10-01.md`
- `docs/receipts/WINNR_TRANSPORT_RECONCILIATION_2026-10-02.md`
- `docs/WINNR_RUNTIME_ACTIVATION_RECEIPT_2026-10-02.md`
- `docs/handoffs/OUTREACH_COMMERCIAL_CURRENT.md`
- `src/winnr-sealed-bootstrap.mjs`
- `src/winnr-runtime-bootstrap.mjs`
- `src/ubersmtp-submission-adapter.mjs`
- `src/fixed-host-blind-tunnel.mjs`
- `src/winnr-reply-canary-verifier.mjs`

## Recovery law

A future chat must recover this directory and the upstream receipts before changing Winnr transport, credentials, placement gates, sender caps, or prospect-send authority.

Never infer:
- payment from code;
- provisioning from payment;
- inbox placement from SMTP acceptance;
- reply ingestion from IMAP authentication alone;
- prospect-send readiness from vendor health/blocklist scores;
- production Neon state from the existence of the Neon plugin.

Live external evidence outranks historical vendor claims.
