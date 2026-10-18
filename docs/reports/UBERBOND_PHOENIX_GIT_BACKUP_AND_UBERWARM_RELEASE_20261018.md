# PHOENIX Git backup and UberWarm post-merge recovery, 18 October 2026

## Source / completed

- UberBond repository: `mohammedwessam2007/uberbondd`. Refreshed origin main: `a4dfaf68374a579eeaa5408a7efaa36822d92226` (merged #1470).
- Current Railway Hobby UberWarm exact-source deployment: `b5085431-b0ea-4c7a-b28c-d4a9948665fe`, **SUCCESS** at main `a4dfaf68`. Five-minute monitor, 53 Winnr mailboxes, 11 domains, authenticated read-only receiver, real account token scope `WRITE_REPORTED`; zero new sends; PG claims=0; recipient seed consent remains false; runtime `BLOCKED_FOR_SENDING`.
- Real hosted PR #1470 CI did NOT universally pass: deterministic and Night Verification failed precisely on canon-freshness test reporting two generated files still pinned to older source `b9a70ca6`; browser, PostgreSQL, postal and exact-head outbound checks passed. Do not misstate the prior CI as fully green.
- An isolated worktree `fix/uberwarm-postmerge-canon-20261018` executed the official `npm run readiness` generator on *actual merged main* and re-generated only `artifacts/system-readiness.json` and `docs/CURRENT_SYSTEM_STATE.md`. Local `node --test tests/canon-freshness.test.mjs`: **6/6 pass**. The full `node --test tests/uberwarm2-*.test.mjs` after `npm ci --ignore-scripts --no-audit --no-fund`: **224 total, 222 pass, 0 fail, 2 skip**. Hosted exact-head CI of this repair is a separate release gate.

## Backups made

- A real local, private Git bundle was created at `.phoenix-backups-private/20261018/uberbondd-all-refs-20261018.bundle` inside the Codespace (NOT committed to the remote GitHub repository). It is **42,440,122 bytes**, SHA-256 **`c50446223d7398fb85675d57d66ad981c524871876ae83988301f3d82d9c6849`**; both `git bundle verify` and `git fsck --full --no-reflogs --connectivity-only` completed successfully. The bundle includes all **reachable commits/refs** available at inventory time but excludes unreachable dangling objects and uncommitted files.
- A complete reference and worktree inventory, **1524 refs across 17 worktrees**, is committed as `artifacts/backup/PHOENIX_GIT_REF_INDEX_20261018.json.gz.b64`. This is a gzip-compressed JSON snapshot, base64 text for GitHub transport. It contains SHA/ref pointers, worktree identity, and **8 independent nonsecret readiness-only tracked worktree patch payloads**, each SHA-256 validated. No tokens, URLs with credentials, receiver messages, or database dumps were copied into the remote repository.
- Existing GitHub repository already has the tracked committed source, history and remote branches; the new remote manifest is an **additional recovery index**, not an independent offsite clone of the bundle or an assertion that every ignored file and live database has been saved.
- The private archive is intentionally excluded from future Git tracking using `.git/info/exclude` to avoid doubling repository size and leaking historic sensitive content. Preserve or export it separately before deleting the Codespace.

## Restore instructions and verification

1. Source recovery uses current GitHub remote main and the immutable commit SHAs in the manifest. Read all required project canon in `AI_START_HERE.md` and `AGENTS.md`; retain the founder 890 / PHOENIX lineage.
2. Offline local recovery of the committed history: `git bundle verify .phoenix-backups-private/20261018/uberbondd-all-refs-20261018.bundle`, then `git clone .phoenix-backups-private/20261018/uberbondd-all-refs-20261018.bundle recovered-uberbond`; verify the full SHA-256 above before any restore.
3. To decode the remote inventory: `python3 -c "import base64,gzip,json,pathlib; p=pathlib.Path('artifacts/backup/PHOENIX_GIT_REF_INDEX_20261018.json.gz.b64'); print(json.dumps(json.loads(gzip.decompress(base64.b64decode(p.read_text()))),indent=2))"`. `readiness_patch.gzip_base64` is recoverable via gzip/base64; check each recorded SHA-256 and only apply patches to their exact committed worktree base (never automatically).
4. Inspect all local worktrees before switching branches; do not rebase, force-push, delete branches or wipe dirty files to make recovery seem clean.
5. This is **source/history/recovery metadata**, not a PostgreSQL backup. The historical Render/Neon encrypted archive and data parity remain separate custody evidence. Do not commit database connection strings, decryption keys or provider passwords into Git.

## Remaining operational prerequisites

The independent exact sender-local signed hold/quarantine/suppression clearance, current independently signed HTTPS-transport authorization and exact signed approval/consent for one owner-controlled receiver are not proven from the live monitoring receipts. The current no-send state remains correct. After those proofs exist, execute exactly one durable-claim probe, record provider Message-ID and independently observed Inbox/Spam, then evaluate genuine warm-up cadence. No prospect campaign, automatic replies, new paid spend or claimed revenue.

**Safety:** No live mail, production DB writes, paid provider warming or irreversible cutover was used to make this backup. Source and deployment remain distinct from actual receiving placement evidence.

## Supersession note: upstream merger on 18 October 2026

After the archive index was captured, concurrent PR #1464 merged the ten-wave research integration to main `41e290423ea623dabeac9fbe09f4b620ff890c0a`. Rather than overwrite or lose that source, this backup branch was reconciled as a merge with both ancestors preserved. Readiness is regenerated from the newer main. The original 1,524-ref inventory is an intentional point-in-time snapshot, not an assertion that later refs were known at capture time; run `git fetch --all` when restoring. The backup report, local bundle, and original PR #1472 commit retain exact provenance.
