# Winnr Fleet — PHOENIX Continuation: Render Correction and Runtime Selection — 2026-10-13

PHOENIX checkpoint: `UBERBOND-WINNR-FLEET-RENDER-CORRECTION-AND-GITHUB-PREFLIGHT-20261013`

Branch: `claude/winnr-fleet-integration-2026-10-13`. HEAD at write time: `27c31bfd`. Previous handoff:
`docs/handoffs/WINNR_FLEET_FINAL_INTEGRATION_PHOENIX_2026-10-13.md` (`18ddc5b4`).

## What changed since the last handoff

The previous handoff said a Render one-off job was the owner's best option. That was wrong for three reasons, now
confirmed: the Render service is on Free, Free web services block outbound SMTP 465 and 587, and a one-off job runs the
service's latest build and inherited environment, not this branch.

**New verified fact:** GitHub-hosted runners reach Winnr's SMTP and IMAP endpoints from this repository's CI.

## Render service reconciliation — what can and cannot be verified here

| Item | Status | Evidence |
|---|---|---|
| Live service identity | **Not verifiable here.** No Render connector or tool is available in this session. | `ListConnectors` shows no Render entry. Deferred tool search returns Vercel and Higgs field only. |
| Service named in the blueprint | `uberbond-web` (docker, starter, `autoDeployTrigger: off`), database `uberbond-postgres` | `render.yaml` |
| Service named in your report | `uberbond-control-plane`, Render Free | Your message. Not independently verified. |
| Service ID documented on 2026-10-08 | `srv-dali9vijnfac739m4vcg` | `docs/handoffs/OUTREACH_WINNR_69_PURCHASE_EVIDENCE_2026-10-08.md` |
| Deployed source documented on 2026-10-08 | `167fc1e54cf160f06bf70cca3f05ec23cb603df1`, deployment `dep-db3eo95g1s2s73a59v2g` | Same handoff |
| **Reconciliation of that SHA with this repository** | **Fails.** That commit has **no common ancestor** with `origin/main` (`298bd585`) or with this branch. `git merge-base` is empty. | `git merge-base 167fc1e5 origin/main` returns nothing. The commit is dated 2026-10-08 and titled "UberMind: full-890 quality-evidence flywheel … (#1302)". |
| Secret names (blueprint, `sync: false`) | `APP_BASE_URL`, `ADMIN_TOKEN`, `TOKEN_ENCRYPTION_KEY`, `OPENROUTER_API_KEY`, `UBERMIND_TYPINGMIND_GATEWAY_TOKEN`, `INFINITE_OPUS_PAID_AUTHORIZATION_JSON`, `INFINITE_OPUS_CROWN_ADMISSION_JSON`; `DATABASE_URL` from the database | `render.yaml`. Presence on the live service **not verified**. |
| Plan | Free (your report) | Not verified here |
| Allowed outbound network | Free: 25, 465, 587 blocked. Paid instance types restore 465 and 587. 993 not addressed. | Render changelog, fetched and confirmed: `render.com/changelog/free-web-services-will-no-longer-allow-outbound-traffic-to-smtp-ports` |

Conclusion: the production source cannot be reconciled through git. The live service must be read in Render by you
before any Render-based step is considered. Nothing in Render was read or changed in this session.

## Runtime evaluation (single source of truth for this decision)

| Runtime | Outbound 465 / 587 / 993 | Evidence | Usable now? |
|---|---|---|---|
| This sandbox | Blocked (timeouts). 443 reaches the provider. | Preflight `winnr/receipts/FLEET_INTEGRATION_RECEIPT_20261013.json` and local preflight | No |
| Render Free (`uberbond-control-plane`) | 465 and 587 blocked by policy. 993 unknown. | Render changelog | No |
| Render paid instance | 465/587 restored (per changelog). 993 unknown. | Changelog only | Requires a paid plan decision (not requested) |
| OVH server (outreach docs) | Not observed | No authorized access. Not attempted. | Not evaluated |
| **GitHub-hosted Ubuntu runner (this repo)** | **465 TLS + `220`, 587 banner `220`, 993 TLS + `* OK`. All verified.** | Run `38404386295`, job `115320091585`, commit `e964e5d5`, 27 s, outcomes below | **Yes, for the network path** |

GitHub run outcomes (from the job log, nonsecret):

- `control-https-443`: TLS_VERIFIED
- `smtp-implicit-tls-465`: TCP connected, TLS verified, greeting `220` → GREETING_OK
- `smtp-submission-587`: TCP connected, banner `220` → BANNER_OK
- `imap-implicit-tls-993`: TCP connected, TLS verified, greeting `* OK` → GREETING_OK
- `bytesWrittenToAnyServer: 0`, `credentialsUsed: false`, `authenticationAttempted: false`, `messagesSent: 0`
- Run usage: `billable.UBUNTU.total_ms = 0`

## Cost

Observed: 0 ms billable for the preflight run. The repository is public (`private: false`). The planned probe run is
expected to take about 2 to 4 minutes. Standard hosted runners on public repositories carry no per-minute charge under
GitHub's published terms. That terms statement is not verified from this session, so the observed 0 ms is the evidence.
Nothing is purchased and no paid resource is created.

## Recommended single option

**GitHub-hosted authentication-only probe, behind a protected environment with a required reviewer.**

Package: `winnr/GITHUB_AUTH_PROBE_ACTIVATION.md` and `winnr/gated/winnr-auth-probe.github-workflow.yml` (inactive).
Code: `scripts/winnr-auth-probe-only.mjs`, `src/winnr-imap-login-probe.mjs` (refactor). Commit `27c31bfd`.

Exact owner steps (the only ones needed):

1. Settings → Environments → New environment `winnr-probe`. Tick Required reviewers and add yourself. Restrict
   deployment branches to `claude/winnr-fleet-integration-2026-10-13`.
2. In `winnr-probe` → Environment secrets → add `WINNR_API_TOKEN`: a Winnr `wnr_` token with read and write, pasted
   into GitHub only.
3. Reply `activate`. I copy the workflow into `.github/workflows` and push. That push queues one run, which waits for
   your approval at Review deployments.

What the approved run does: export the 10 Startup domains (pilot excluded) through the documented export API; SMTP
`AUTH`+`NOOP`+`QUIT` on 465; IMAP `LOGIN`+`LOGOUT` on 993; shred the CSV and workspace; upload a digest-only receipt.

What it cannot do: send mail, select or read a mailbox, touch the production store or key, change DNS, purchase, or deploy.

Expected proof: receipt `winnr-auth-probe-receipt` with `smtp.accepted` and `imap.accepted` out of 50, class counts,
`messagesSent: 0`, digests only. Production store untouched, so all senders stay paused.

Risks: token custody in a GitHub environment secret (mitigated by reviewer gate, branch restriction, rotation after the
run). Public logs and artifacts (mitigated by counts and digests only). Account lockout (one attempt per mailbox).
**Unverified policy question:** GitHub's Acceptable Use terms and Winnr's terms for automated authentication checks from
a hosted runner. This is yours to confirm before approval.

Rollback: remove the workflow file in a commit; delete the secret; rotate the Winnr token. The production store and
holds are not changed by this path.

## Not requested, and why

- **Render job or deploy:** the service is on Free (blocks 465/587); a one-off job runs the latest build, not this
  branch, and carries compute cost not established here; the live source SHA does not reconcile with git.
- **Production-compatible import (`TOKEN_ENCRYPTION_KEY`, production Postgres):** needs a runtime that holds the production
  key and runs this branch's code. Choosing that runtime, its deployment and its cost is a separate decision.
- **Paid Render plan:** a purchase. Not requested.
- **OVH:** no authorized access; not attempted.

## Engineering completed this continuation

- `e964e5d5`: network-only preflight (`scripts/winnr-network-preflight.mjs`), 12 tests, and an active CI workflow that
  only triggers on its own files on this branch.
- `27c31bfd`: authentication-only probe runner (11 tests), IMAP login refactor (existing 8 tests green), gated workflow
  and activation package.
- Winnr suite on current tree: **193 of 193 pass across 27 files**.

## Preserved state (verified by construction)

- 50 encrypted staging accounts: untouched. No store call in any step this continuation.
- Sender holds: all 50 remain paused (no store write this continuation).
- Pilot mailboxes: no provider write this continuation (no export of pilot rows; `cedarpointdomains.com` excluded).
- No messages sent, no purchases, no DNS changes, no paid warming, no deployments, no merges.

## Negative evidence (do not re-adopt)

- Blind TLS tunnel on the separate `origin/ops/*` lineage (`e35e9ec9`): relays SMTP TLS through a hard-coded Supabase TCP
  egress cell to route around the port restriction. Declined: it is tunneling to evade network policy.
- That lineage is not an ancestor of `main` and carries an older readiness module with the `Number(null) → 0` defect.
- The live Render source SHA `167fc1e5` shares no history with `main` or this branch.

## Next executable steps

1. Owner: complete the three steps above, then reply `activate`.
2. Owner: confirm the GitHub and Winnr terms question before approving the run.
3. Owner (separately, when ready): read the live Render service in the dashboard and record its service ID, source SHA,
   plan and secret names here. Do not deploy from this branch without a separate decision.
4. Then: review the probe receipt. Only a `smtp.accepted` and `imap.accepted` of 50 each is a successful authentication
   result. Anything else is classified and reported.

## Commands

```bash
cd /home/user/uberbondd && git checkout claude/winnr-fleet-integration-2026-10-13 && npm ci --ignore-scripts
node --test $(ls tests/uberwinnr-*.test.mjs tests/winnr-*.test.mjs tests/ubersmtp*.test.mjs tests/*smtp*.test.mjs tests/uberfleet*.test.mjs tests/uberimap*.test.mjs | grep -v postgres)
node scripts/winnr-network-preflight.mjs --out=/tmp/preflight.json   # network only, no credentials
```
