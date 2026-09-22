# UberAgent live Supabase source provenance — 2026-09-22

This directory preserves an exact source snapshot of the live `uberworm-node` Edge Function observed during the Chat On Steroids forensic assimilation.

- Supabase project: `uberbond-continuity`
- Edge Function: `uberworm-node`
- observed provider version: `1`
- provider artifact SHA-256: `953c5b2df21035054f2f7a950303ce8770d72d5b7740147230fc78778f469052`
- captured source: `live-v1/index.ts`
- provider snapshot: `artifacts/provider-snapshots/uberagent-supabase-control-plane-2026-09-22.json`

## Evidence law

The capture is evidence of provider state, not a claim that the function was historically deployed from Git.

This branch did **not** deploy, update, rotate, pause, mutate or otherwise change the live Supabase project.

The absence of earlier tracked source is itself the defect this snapshot closes for future recovery. Historical migration provenance remains unknown and must not be invented.

## Current recovery gap

The observed function atomically claims one pending command by changing it to `running`, but the live schema/function does not carry a claim token, lease expiry, attempt epoch or stale-running reconciliation state.

Do not deploy a recovery change until the source implementation and hostile crash tests exist in Git.
