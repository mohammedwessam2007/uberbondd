# Winnr Evidence Index

## Commercial/provider evidence

- `docs/WINNR_PREPURCHASE_GATE_2026-10-01.md`
- `docs/WINNR_SUPPORT_RECONCILIATION_2026-10-02.md`
- Gmail support thread id: `1a0f90526f86bb82`

## Runtime/custody evidence

- `src/uberwinnr-credential-import.mjs`
- `src/uberwinnr-postpurchase.mjs`
- `src/winnr-runtime-bootstrap.mjs`
- `src/winnr-sealed-bootstrap.mjs`
- `docs/receipts/WINNR_TRANSPORT_RECONCILIATION_2026-10-02.md`
- `docs/WINNR_RUNTIME_ACTIVATION_RECEIPT_2026-10-02.md`

## Transport implementation

- `src/ubersmtp-submission-adapter.mjs`
- `src/fixed-host-blind-tunnel.mjs`
- `tests/fixed-host-blind-tunnel.test.mjs`
- PR #1149 / merge commit `e35e9ec9df5a83ede6c2093acb983ea3e5570fc3`

## Placement

- `src/uberplacement.mjs`
- `src/uberwarm2-sovereign-ramp.mjs`
- Gmail is the external observation surface for the current owner-controlled seed.
- Current runtime evidence: 3 delivered, 3 Spam.

## Reply verification

- `src/winnr-reply-canary-verifier.mjs`
- `tests/winnr-reply-canary-verifier.test.mjs`
- PR #1151 / commit `1183264f6286114c8a600c3f46644430eae5cf38`
- PR #1152 / live repair commit `859f95e3a99ce9d98b4d0c3fc3cb7da70517a250`
- Live receipt: `WINNR_REPLY_CANARIES_INGESTIBLE`, found [2,3].

## Current live runtime receipt

At the latest verified live deployment:
- sealed bootstrap: already consumed successfully;
- runtime result: `WINNR_RUNTIME_TRANSPORT_VERIFIED`;
- mailboxCount: 3;
- accountRowsWritten: 6;
- smtpConfirmed: 3;
- imapConfirmed: 3;
- credentialStorage: `AES_256_GCM_ENCRYPTED`;
- plaintextCredentialsLogged: false;
- reply verifier: `WINNR_REPLY_CANARIES_INGESTIBLE`.

## Database truth boundary

The current live Render worker reports PostgreSQL. Historical UberBond setup includes a Neon project/cell, but the current production database was previously established as Render Postgres. The presence of the Neon plugin does not prove that Neon is the live store. Do not write a Winnr production receipt to Neon and call it production evidence unless a future reconciliation proves the live database identity changed.
