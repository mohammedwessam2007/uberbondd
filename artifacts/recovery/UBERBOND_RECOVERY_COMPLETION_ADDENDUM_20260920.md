# UberBond Recovery Completion Addendum — 2026-09-20

This addendum supersedes stale recovery counters only. It does not erase earlier anchors, which remain historical checkpoints.

## Exact live source anchor

- live main at recovery refresh: `0e58328778b17dae8a0eaac5c069f87367e1c83e`
- root tree: `c619cfb8aa8773b79adb403b16cf19cec478f654`
- recursive tree: `truncated:false`
- tree entries: **3,476**
- directories/tree objects: **164**
- tracked blobs: **3,312**
- tracked blob bytes: **111,809,894**
- `src/`: **849 files / 7,854,028 bytes**
- `tests/`: **1,043 files / 6,067,867 bytes**

## Complete exposed Git history denominators

- main commit history: **4,451 / 4,451 commits**, terminal page reached the initial commit `229c2c85c3c28179ce5bc3c4997f87b3ee67911b` dated 2026-07-14
- pull requests: **779 / 779**
  - merged: **596**
  - closed unmerged: **183**
  - open at census: **0**
- true GitHub issues: **177 / 177**
  - closed: **132**
  - open: **45**
- issue/PR conversation comments: **1,979** in the merged recovery corpus
- inline review comments: **0** in the merged recovery corpus
- tracked workflow/runtime definitions under `.github/workflows/`: **27**
- branch namespace: previously exhausted and durably indexed; recovery branches are lineage, not current authority

## GitHub Actions

Prior durable fixed-cutoff corpus:
- inclusive cutoff: **2026-09-19T22:26:48Z**
- durable runs: **10,705**

Live-tail reconciliation:
- runs strictly newer than cutoff: **668**
- first tail run: **2026-09-19T22:27:22Z**
- latest tail run: **2026-09-19T23:04:43Z**
- live GitHub total at recovery: **11,373**
- therefore: **10,705 + 668 = 11,373 / 11,373 accounted**

Tail artifact:
`artifacts/recovery/actions/UBERBOND_ACTION_RUNS_POST_CUTOFF_20260920.json`

## Releases and tags

Re-verified through supported GitHub API surfaces:
- GitHub Releases collection: **[]**
- Git matching refs for tags: **[]**

Therefore at this recovery point:
- Releases: **0**
- Tags: **0**

This supersedes the prior “tags API unavailable / unverified” statement.

## Persistent UberBond Library

Complete `/Uberbond` Library pagination remains:
- **836 files**
- **2,625,444,097 stored bytes**
- pagination exhausted to null cursor

These are addressable by persistent file/library IDs in the Library manifest. Addressability is not the same as saying all 2.5 GiB have been streamed through a model context.

## Semantic/canon source accounting

Current source invariants remain:
- source disposition: **274 production + 406 operator-only + 169 no-entry = 849 / 849**
- semantic requirements: **1,040 / 1,040**
- semantic orphans: **0**
- finite declared engineering requirements: **0 open** at the recovered checkpoint

These are source/semantic facts, not proof of deployment, demand, cleared payment, personal-life outcomes, AGI/ASI, singularity, or longitudinal calibration.

## Remaining literal-byte boundary

The only major remaining recovery distinction is between:
1. **complete addressability/provenance** of stored UberBond objects; and
2. **raw-byte traversal/hash verification** of every Library object.

The repository is fully Git-content-addressed. The Library corpus is fully object-addressed, but not yet fully raw-byte hashed in this recovery session.

Do not collapse this distinction.
