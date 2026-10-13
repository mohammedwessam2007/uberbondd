# Winnr Startup Fleet: Authentication Probe on GitHub-Hosted Runners — Activation Package

Status: **READY, NOT ACTIVE.** The workflow is in `winnr/gated/`, which GitHub never runs. Nothing in this package has
sent a message, bought anything, changed DNS, deployed, or written to the production store.

Branch: `claude/winnr-fleet-integration-2026-10-13`. Preflight evidence: run `38404386295`, commit `e964e5d5`.

## What this package guarantees, and how each guarantee is tested

| Guarantee | Enforced by | Tests |
|---|---|---|
| No secret is released before a human approves | `environment: winnr-probe` with a required reviewer; secrets exist only in that environment | static workflow tests |
| Only the reviewed code runs with the secrets | `scripts/winnr-activation-guard.mjs` runs first; it refuses a placeholder pin, a multi-commit push, a parent that is not the pin, any extra changed file, and any change since the pin | 19 pure and real-git tests |
| The 50-mailbox scope is exact, and the pilot is never touched | `scripts/winnr-inventory-gate` checks the provider and the export before any export is written to disk; the pilot is excluded by the inventory, not a hard-coded name | 24 gate tests, 6 runner tests |
| No address, domain name, password, digest or export URL reaches a public log or artifact | the public receipt is built from counts and fixed class names; a builder removes identity keys by name and an independent guard refuses the whole receipt on any identity-shaped value | 10 guard tests, 7 receipt tests, 6 runner output tests |
| Authentication only: no mail is sent | SMTP stops after `AUTH`, `NOOP`, `QUIT`; IMAP stops after `LOGIN`, `LOGOUT` | 18 probe tests, including the CLI exit codes |
| A re-run cannot re-expose credentials | `if: github.run_attempt == 1` on the probe job | static workflow tests |
| Cleanup runs even on failure | `if: always()` on cleanup and on upload | static workflow tests |

Current totals for all Winnr-related suites: **269 tests in 28 files, 266 passing, 0 failing**. The 3 remaining tests are the
PostgreSQL store suite, which skips without a database. Under the embedded PostgreSQL wrapper
(`node scripts/with-real-postgres.mjs`) all 3 pass.

## Why this runtime, and why not the others

Verified, not assumed:

| Runtime | 465 / 587 / 993 | Evidence | Usable? |
|---|---|---|---|
| This sandbox | blocked (timeout) | `winnr/receipts/FLEET_INTEGRATION_RECEIPT_20261013.json` (`CONNECT_TIMEOUT`, `ETIMEDOUT`) | No |
| Render Free web service (`uberbond-control-plane`) | 465 and 587 blocked by Render policy | Render changelog: free web services no longer allow outbound SMTP ports 25, 465, 587. 993 is not mentioned. | No |
| Render paid instance | 465 and 587 restored per changelog; 993 unknown | Not tested. Requires a paid plan. | Only with an owner purchase decision |
| OVH server (from outreach docs) | not observed | No authorized access. I did not attempt access. | Not evaluated |
| **GitHub-hosted Ubuntu runner (this repository)** | **465 TLS and `220`, 587 banner `220`, 993 TLS and `* OK`** | Run `38404386295`, job `115320091585`: `GREETING_OK`, `BANNER_OK`, `GREETING_OK`, 0 bytes written | **Yes, for the network path** |

GitHub-hosted runners are this repository's existing CI runtime. I have not reviewed GitHub's or Winnr's terms for an
automated authentication check from a hosted runner. See Risks.

## Cost (observed, not estimated)

- The preflight run took **27,000 ms** and GitHub reports **0 ms billable** for it.
- The repository is **public**, so standard hosted runners carry no per-minute charge under GitHub's published terms. I
  have not verified the plan terms from here, so this is the observed 0 ms plus that public-repository basis.
- Expected probe run: about 2 to 4 minutes (dependency install, one export, 50 SMTP and 50 IMAP attempts at concurrency 4).
  The real figure appears in run usage after it finishes. Nothing is purchased and no paid resource is created.

## Part 1 — iPad steps: create the protected environment and enter the secrets

Do this on the GitHub website, in Safari. Tip: tap **aA → Request Desktop Website** so the Settings menu is visible.
Paste each secret into GitHub's secret field only. Do not paste either secret into this chat. GitHub hides a secret after saving.

1. Open `github.com/mohammedwessam2007/uberbondd` and tap **Settings**.
2. In the left menu, tap **Environments**, then **New environment**. Type the name exactly: `winnr-probe`. Tap **Configure environment**.
3. Tick **Required reviewers**. Type your GitHub username and select it. Tap **Save protection rules**.
4. Under **Deployment branches and tags**, choose **Selected branches and tags**. Tap **Add deployment branch or tag rule**,
   type `claude/winnr-fleet-integration-2026-10-13`, and add it. No other branch may use this environment.
5. Under **Environment secrets**, tap **Add environment secret**.
   - Name: `WINNR_API_TOKEN`
   - Secret: your Winnr API token. It starts with `wnr_` and must have **read and write** scope, because the export needs write.
   - Tap **Add secret**.
6. Tap **Add environment secret** again.
   - Name: `WINNR_EXPECTED_INVENTORY_JSON`
   - Secret: one line of JSON in this exact shape, with your ten real Startup domains in the first list and the pilot in the second:
     `{"startupDomains":["domain-1.example","domain-2.example","…","domain-10.example"],"pilotDomains":["cedarpointdomains.com"]}`
     Use exactly ten Startup domains, each once, and no pilot domain in the first list.
   - Tap **Add secret**.
7. Reply `activate` here. Nothing runs until that reply. The steps in Part 2 are then done by me.

## Part 2 — activation procedure (runs after your `activate`)

1. **Pin.** The reviewed commit R is the tip of this package, once it is pushed. I record R.
2. **One activation commit A on top of R, and nothing else.** A moves the gated file to `.github/workflows/winnr-auth-probe.yml`,
   deletes the gated file, and sets `WINNR_REVIEWED_CODE_SHA` to R. A changes no other file.
3. **Push A.** The push starts the workflow:
   - `preflight` runs immediately. It has no environment and no secret. It only checks TCP and TLS reachability and reads the
     greeting on 465 and 993, and it writes nothing to any server.
   - `probe` waits at **Review deployments**. Nothing is released until you approve it.
4. **You approve** in the Actions run. Then the reviewed-commit guard runs. If it refuses, the run stops before any secret
   is released. If it passes, the export runs read-only on the provider, then the authentication probe runs.

## What a run does, and what it cannot do

Does: refuses unless the activation shape is exact; exports the Startup credential CSV through Winnr's documented export API
(10 Startup domains by name, checked against the inventory before export and against the CSV before it is written);
SMTP `AUTH`, `NOOP`, `QUIT` on 465; IMAP `LOGIN`, `LOGOUT` on 993; destroys the CSV and workspace; uploads the public receipt.

Cannot: send mail (`MAIL FROM`, `RCPT TO` and `DATA` are never issued), select or read a mailbox, write to the production
store, use the production encryption key, change DNS, purchase, or deploy. The probe-only module has no store, key or
Winnr API dependency, and a static test enforces that.

## Refusal matrix: what stops a run

| Condition | Where it stops | Secret released? |
|---|---|---|
| Reviewer has not approved | GitHub, before the job starts | No |
| Pin is still `PLACEHOLDER_PIN_REQUIRED`, or not a 40-character SHA | reviewed-commit guard | No |
| Push has more than one commit, or the parent is not the pin | reviewed-commit guard | No |
| Activation commit changes any file besides the workflow pair | reviewed-commit guard | No |
| Any code changed between the pin and HEAD | reviewed-commit guard | No |
| Re-run of the same run (`run_attempt` > 1) | job condition | No |
| 465 or 993 not reachable from the runner | preflight, `--require-auth-ports` | No (preflight holds no secret) |
| Inventory secret missing, malformed, or not ten Startup domains plus the pilot | runner and probe | Token only, which the export refuses to use |
| Provider domains or mailboxes differ from the inventory | provider gate, before export | Token used for reads only |
| Export is not exactly 50 rows, has a pilot row, or a row disagrees with the provider | CSV gate, before the CSV is written | Export written to no disk |
| A row uses port 587 or any non-implicit-TLS port | probe, before any connection | Probe makes no connection |
| Any public output carries an identity-shaped value | artifact guard | Receipt replaced by a fixed refusal code |

## Expected proof (public receipt)

Artifact `winnr-auth-probe-receipt`, which holds only:
- `status`: `AUTHENTICATED_ALL` only when all 50 are accepted on both protocols with no exception; otherwise `NOT_ALL_AUTHENTICATED`
  or a refusal status.
- `smtp.accepted` and `imap.accepted`, each out of 50, with fixed class counts (`AUTH_CONFIRMED`, `AUTH_REJECTED`,
  `NETWORK_BLOCKED`, `TLS_FAILED`, `FAILED_UNCLASSIFIED`, `REFUSED_BY_TRANSPORT`, `PROBE_EXCEPTION`).
- `messagesSent: 0`, `mailFromIssued: false`, `recipientsIssued: 0`, `dataIssued: false`, `identityFieldsPublished: false`.
- `approvalRef`: the GitHub run approval reference. No address, domain name, host name, password, digest or URL.

The per-account detail stays in the runner's temporary directory and is never uploaded. The run log prints the same counts.

## Risks, with mitigations

- **Token and inventory custody in GitHub.** Both are environment secrets. Secrets are write-only in GitHub, but a workflow
  permitted to use the environment can read them. Mitigations: the required reviewer, the branch restriction, the
  guard before any secret, and a step-level scope so the token reaches one step only. Rotate the token after the run.
- **Cleanup is best effort, not secure erasure.** Runners are ephemeral, but the CSV is overwritten once and then removed.
  Treat the runner as having held the credentials until it is discarded.
- **Public logs and artifacts.** The repository is public. Every printed line and every uploaded file passes the artifact
  guard. A failing line is replaced by a fixed refusal code.
- **Account lockout.** Each mailbox gets one SMTP attempt and one IMAP attempt. Failures are counted, not retried.
- **Policy not verified.** I have not checked GitHub's Acceptable Use Policies or Winnr's terms against an automated
  authentication check from a hosted runner. Confirm this before you approve. This is the main open risk.
- **Network path can change.** The preflight is one observation, and the preflight job runs again on activation.

## Rollback

- Before activation: nothing to undo.
- After activation: delete `.github/workflows/winnr-auth-probe.yml` in a commit. Delete both environment secrets, and remove
  the `winnr-probe` environment. Rotate the Winnr token. The production store and sender holds are not changed by this path.

## Not requested, and why

- **Render job or deploy:** not requested. The Render service is on Free, which blocks 465 and 587. A one-off job runs the
  service's latest build, not this branch, and carries a compute charge I have not established.
- **Production key import:** not requested. It needs a runtime that holds the production key and has the branch code.
  Establishing that needs a separate decision about where the code runs and what it costs.
- **OVH:** not evaluated. I have no authorized access and did not try to reach it.
