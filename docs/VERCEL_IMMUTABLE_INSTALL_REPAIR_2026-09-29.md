# Vercel Immutable Install Repair — 2026-09-29

Status: **SOURCE REPAIR CANDIDATE / CLOUD RE-EXECUTION QUOTA-BLOCKED**

## Observed failure

A dedicated Vercel diagnostic deployment on the full `uberbondd` project executed exact commit:

`adf606e027ea0588cb9a072a3cb4c44ef8d28569`

Deployment:

`dpl_AR21HvMvv2M4nj43riwQ8MD8YUry`

Vercel returned:

`BUILD_UTILS_SPAWN_60`

with:

`Command "node scripts/current-truth-reason-probe.mjs" exited with 60`

That diagnostic script maps exit 60 only to:

`package-lock.json` dirty before `executeCurrentTruthRegeneration()`.

The diagnostic build command invoked current-truth directly, before UberBond's normal build pipeline. Therefore the observed package-lock mutation existed before terminal realization, Feature Genome, Postgres runtime rehearsal, or other UberBond build steps.

## Root cause class

The Vercel dependency-install phase was allowed to leave the tracked dependency lock dirty before the build command began.

UberBond's truth law then correctly refused exact-source certification because `package-lock.json` is a protected truth input.

The bug is **installation reproducibility**, not the clean-source verifier.

## Repair

Both Vercel projects now override the provider install command:

- root `vercel.json` -> `node scripts/vercel-immutable-install.mjs`
- lite `lite/vercel.json` -> `node ../scripts/vercel-immutable-install.mjs`

The wrapper:

1. verifies `package.json` and `package-lock.json` are clean before install;
2. executes `npm ci --include=dev` from repository root;
3. verifies both tracked package files remain clean after install;
4. fails closed if Git status cannot be read, npm ci fails, or package truth is mutated;
5. never restores, resets, checks out, edits or hides a changed lockfile.

This preserves the stronger invariant:

`exact source truth -> immutable dependency install -> exact source truth regeneration`

rather than weakening it to:

`provider changed lockfile -> ignore drift -> certify anyway`.

## Existing repository evidence

The repository's self-maintainer workflows already use `npm ci` as their install primitive.

Historical exact-source receipts also record successful `npm ci` followed by deterministic and PostgreSQL verification. Those receipts are historical compatibility evidence only; they are not a fresh run of this exact repair branch.

## Live provider boundary

At the time of this repair, GitHub commit statuses for new Vercel commits reported:

`Deployment rate limited — retry in 24 hours.`

for both `Vercel – uberbondd` and `Vercel – uberbondd-lite-private`.

No paid capacity increase was authorized.

Therefore:

- root-cause class: **OBSERVED**
- repair source: **IMPLEMENTED**
- static/exact-source contract verification: **AVAILABLE**
- fresh Vercel install/build recovery: **NOT YET OBSERVED**
- production recovery: **NOT CLAIMED**

## Authority

This repair grants no deployment, spend, customer, payment, messaging, credential, DNS or production-promotion authority.
