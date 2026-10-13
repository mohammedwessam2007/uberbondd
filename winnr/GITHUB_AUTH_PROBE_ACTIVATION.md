# Winnr Startup Fleet: Authentication Probe on GitHub-Hosted Runners — Activation Package

Status: **READY, NOT ACTIVE.** The workflow is in `winnr/gated/` and GitHub does not run it. Nothing here has sent a
message, bought anything, changed DNS, deployed, or written to the production store.

Branch: `claude/winnr-fleet-integration-2026-10-13`. Preflight evidence: run `38404386295`, commit `e964e5d5`.

## Why this runtime, and why not the others

Verified, not assumed:

| Runtime | 465 / 587 / 993 | Evidence | Usable? |
|---|---|---|---|
| This sandbox | blocked (timeout) | `winnr/receipts/FLEET_INTEGRATION_RECEIPT_20261013.json` | No |
| Render Free web service (`uberbond-control-plane`, per your report) | 465 and 587 blocked by Render policy | Render changelog, "free web services will no longer allow outbound traffic to smtp ports" (ports 25, 465, 587; paid instance restores them). 993 not mentioned. | No |
| Render paid instance | 465/587 restored per changelog; 993 unknown | Not tested. Requires a paid plan. | Not without an owner purchase decision |
| OVH server (from outreach docs) | not observed | No authorized access; I did not attempt access | Not evaluated |
| **GitHub-hosted Ubuntu runner (this repo)** | **465 TLS + 220, 587 banner 220, 993 TLS + `* OK`, all verified** | Run `38404386295`, job `115320091585`, outcomes `GREETING_OK`, `BANNER_OK`, `GREETING_OK`, 0 bytes written | **Yes, for the network path** |

GitHub-hosted runners are the existing CI runtime for this repository. Using them does not violate a hosting policy I
have found. This does not include any GitHub or Winnr terms review (see Risks).

## Cost (observed, not estimated)

- The preflight run took **27,000 ms**. GitHub reports **0 ms billable** for it (`get_workflow_run_usage`).
- The repository is **public** (`private: false`). Standard hosted runners on public repositories carry no per-minute charge
  under GitHub's published terms. I have not verified the plan terms from here, so the cost statement is the
  observed 0 ms plus that public-repository basis.
- Expected probe run: about 2 to 4 minutes (dependency install, one export, 50 SMTP and 50 IMAP attempts at concurrency 4).
  The real figure appears in run usage after it finishes. Nothing is purchased and no paid resource is created.

## Exact owner steps (the only ones required)

1. GitHub → `mohammedwessam2007/uberbondd` → **Settings → Environments → New environment** → name it `winnr-probe`.
2. In `winnr-probe`: tick **Required reviewers** and add yourself. Under **Deployment branches**, choose *Selected
   branches* and add `claude/winnr-fleet-integration-2026-10-13` only.
3. In `winnr-probe` → **Environment secrets → Add secret**: name `WINNR_API_TOKEN`, value your Winnr API token
   (it must start with `wnr_` and have **read and write**, because the export needs write). Paste it into GitHub's
   secret field only. Do not paste it into this chat.
4. Reply `activate`. I will copy the gated file to `.github/workflows/winnr-auth-probe.yml` on this branch and push.
   That push queues one run. It waits at **Review deployments**, which is the gate. The run does nothing until you approve it.

## What one approved run does, and what it cannot do

Does: export the Startup credential CSV through Winnr's documented export API (10 Startup domains by name, pilot excluded);
SMTP `AUTH` plus `NOOP` plus `QUIT` on 465; IMAP `LOGIN` plus `LOGOUT` on 993; shreds the CSV and workspace; uploads a
digest-only receipt.

Cannot: send mail (`MAIL FROM`, `RCPT TO` and `DATA` are never issued), select or read a mailbox, write to the production
store, use the production encryption key, change DNS, purchase, or deploy. The probe-only module has no store, key or
Winnr API dependency; a static test enforces that.

## Expected proof

- Receipt artifact `winnr-auth-probe-receipt` with `smtp.accepted` and `imap.accepted` counts out of 50, per-class counts
  (`AUTH_CONFIRMED`, `AUTH_REJECTED`, `NETWORK_BLOCKED`, `TLS_FAILED`), `messagesSent: 0`, `mailFromIssued: false`,
  `dataIssued: false`, digests only.
- Run log: phase counts only. No address, password, host or export URL.
- Production store untouched: this path makes no store call, so every sender stays paused by construction.

## Risks, with mitigations

- **Token custody in GitHub.** The Winnr write token is a GitHub environment secret. Secrets are write-only in GitHub, but
  a workflow that the environment permits can read them. Mitigations: the required reviewer, branch restriction, and
  this workflow file being in the reviewed branch. Rotate the token after the run. Use a token scoped to this account.
- **Public logs and artifacts.** The repository is public. Mitigations: counts and digests only, verified in the
  runner's output format and by a leak scan of the committed receipt. Keep this rule for every later change.
- **Account lockout.** Each mailbox gets one SMTP attempt and one IMAP attempt. Failures are counted, not retried.
- **Policy not verified.** I have not checked GitHub's Acceptable Use Policies or Winnr's terms against an automated
  authentication check from a hosted runner. That review is yours to confirm before approval. This is the main open risk.
- **Network path can change.** The preflight is one observation. An unchanged path is not guaranteed for the probe run.

## Rollback

- Before activation: nothing to undo.
- After activation: delete `.github/workflows/winnr-auth-probe.yml` in a commit, and delete the `WINNR_API_TOKEN`
  environment secret. Rotate the Winnr token. The production store and sender holds are not changed by this path.

## Not requested, and why

- **Render job or deploy:** not requested. The Render service is on Free, which blocks 465 and 587. A one-off job runs
  the service's latest build, not this branch, and carries a compute charge I have not established.
- **Production key import:** not requested. It needs a runtime that holds the production key and has the branch code.
  Establishing that needs a separate decision about where the code runs and what it costs.
- **OVH:** not evaluated. I have no authorized access, and I did not try to reach it.
