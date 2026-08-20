# UberBond live bridge: ChatGPT ↔ Claude Code

**This is the canonical handoff document for the bridge.** Everything else in
`docs/` that mentions the relay is either narrower (a single module's contract)
or older (a snapshot of an earlier wave). If two documents disagree, this one
wins.

Read this one document and you should be able to run the bridge, verify it, and
know exactly what still needs Mohamed.

---

## 1. What the bridge actually is

ChatGPT and Claude Code cannot talk to each other directly. Neither one can
call the other. What they *can* both reach is **GitHub Issues on this
repository**, so that is the wire.

```
ChatGPT                    GitHub Issues                 Claude Code / worker
   |                       (durable store)                        |
   |-- creates AgentTask ------> issue (label agent-relay:task)    |
   |                                    |<--- polls ---------------|
   |                                    |<--- claim comment -------|   (lease)
   |                                    |<--- heartbeat comment ---|   (renew)
   |                                    |<--- result comment ------|   (receipt)
   |<-- reads receipt ------------------|                          |
   |                                    |<--- label agent-relay:done, close
```

Nothing here is a mock. The round trip in section 9 was executed against the
real repository, and the issue it created is still there to look at.

**The bridge is a message channel, not a capability multiplier.** It does not
create extra Claude usage, does not bypass any subscription, and does not make
Claude run when nobody is paying for it to run. If no worker and no Claude
session is running, tasks simply sit in the queue until one is.

---

## 2. The pieces

| Piece | File | What it is |
|---|---|---|
| Shared safety core | `src/cloud-agent-relay.mjs` | Task schema, `ZERO_EFFECTS`, secret scanner, result validation. Both transports import this so they cannot drift apart. |
| GitHub transport | `src/github-relay.mjs` | Turns issues + comments into tasks, leases and receipts. This is the live one. |
| HTTP ingress (optional) | `api/agent-relay.mjs` | An authenticated HTTP front door that wraps the same transport. Not deployed — see section 11. |
| Unattended worker | `scripts/github-relay-worker.mjs` | Runs with no Claude session and no founder device. Claims one task, runs one allowlisted verification suite, posts the receipt. |
| ChatGPT-side client | `src/chatgpt-relay-client.mjs` | The producer/reviewer helpers ChatGPT uses to create and read tasks. |
| Scheduled runner | `.github/workflows/agent-relay-worker.yml` | Fires the worker on new labelled issues and hourly. **Never yet executed** — see section 11. |

---

## 3. Creating a task (the ChatGPT side)

A task is a GitHub issue with:

- the label `agent-relay:task`
- a fenced ` ```uberbond-task ` block containing the task JSON

The JSON is validated before anything runs. The fields that matter:

```json
{
  "taskId": "some-unique-id",
  "targetAgent": "claude-code",
  "objective": "REPO_VERIFICATION",
  "instructions": "run the deterministic suite",
  "acceptanceCriteria": ["exit code 0"],
  "budget": { "maxTokens": 200000 },
  "allowedEffects": []
}
```

`allowedEffects` must be empty. A task that asks for an external effect is
refused at creation, not at execution.

In code: `createGithubRelayTask({ client, owner, repo, input })`.

---

## 4. Claiming, leases and heartbeats

A worker claims a task by posting a **claim comment**. The claim carries a
worker id and a lease expiry.

- `claimGithubRelayTask()` — refuses with `lease-held-by-another-worker` if a
  live lease already exists.
- `heartbeatGithubRelayTask()` — extends the lease. Refuses with
  `lease-owner-mismatch` if a different worker tries to heartbeat, and
  `lease-lost-before-heartbeat` if the lease already expired.
- `resolveLease()` — decides who actually holds a task when two claims land at
  once, by taking the **earliest server-assigned comment id**.

**Honest limitation:** `resolveLease()` is deterministic *after the fact*. It
tells you unambiguously who owned the lease, but it cannot un-run work a losing
worker already performed in the moment before it lost. The HTTP/Postgres
transport in `src/cloud-agent-relay.mjs` does have a real row lock
(`SELECT ... FOR UPDATE SKIP LOCKED`); the GitHub transport does not, because
GitHub does not offer one. In practice this matters only if you run several
workers against the same repository at the same time. Run one.

---

## 5. Receipts: what comes back

Every completed task produces a **structured receipt** posted as a result
comment. Receipt version `uberbond-relay-receipt-1.0.0`. All fourteen mandated
fields are required and validated:

`taskId`, `workerId`, `status`, `sourceCommit`, `commands`, `tests`,
`artifacts`, `findings`, `limitations`, `confidence`, `externalEffects`,
`cost`, `duration`, `submittedAt`.

- `sourceCommit` — the exact commit the work ran against. Without this a
  receipt is unverifiable.
- `commands` / `tests` — what actually ran, with real exit codes. A suite that
  did not run is reported as not run. It is never converted into a pass.
- `confidence` — `HIGH` / `MEDIUM` / `LOW` / `UNKNOWN`. Anything unrecognised
  becomes `UNKNOWN` rather than being silently accepted.
- `externalEffects` — must equal the zero ledger. A receipt claiming any
  external effect is rejected outright (`receipt-nonzero-external-effects-rejected`).
- `limitations` — what could not be checked. This field is the point of the
  whole contract; a receipt with an empty `limitations` array on a partially
  blocked task is a bug, not a success.

Receipts are also scanned for secret-shaped content and rejected if any is
found (`receipt-secret-like-content-rejected`).

Build one with `buildRelayReceipt()`, check one with `validateRelayReceipt()`.

---

## 6. Verification and repair tasks (the ChatGPT side, again)

ChatGPT reads the receipt back with `readGithubRelayTask()`, which returns both
the parsed `receipt` and the raw `result`. It then decides:

- **Acceptance criteria met, exit codes clean →** close the loop. The issue gets
  `agent-relay:done` and is closed.
- **Anything failed, or the receipt is incomplete →** create a *new* task that
  names the specific failure. Do not re-open or re-run the old one — a task is
  a single attempt with a single receipt, and rewriting history inside a task
  destroys the audit trail. The repair task references the original `taskId`.

`githubRelayTaskEnvelope({ issue, comments })` gives you the derived state
(status, lease, attempt count, result refs, idempotency key) without keeping a
second copy of the truth anywhere.

---

## 7. Fail-closed boundary — what the bridge will never do on its own

OMNIA V9 remains the authority boundary. The relay may **never** independently
authorise any of the following, no matter what a task asks for:

- sending customer messages or cold email
- purchases, charges, advertising spend, or payment changes
- credential changes outside the dedicated relay setup
- DNS changes
- deploying UberBond's customer-facing production
- publishing, account creation, KYC, contracts
- CRM mutations, provider sends, platform posting, private scraping

Unknown consequential state **fails closed**. The worker's allowlist is the
enforcement point: it runs exactly three things —

```
check:syntax        deterministic       check
```

— and reports anything else as `UNSUPPORTED_OBJECTIVE` without attempting it.
A worker that could execute arbitrary instructions out of an issue body would
be a remote-code-execution hole wearing a task packet as a costume.

---

## 8. Running a worker

**Start one run:**

```
GITHUB_TOKEN=<token> GITHUB_REPOSITORY=mohammedwessam2007/uberbondd \
  node scripts/github-relay-worker.mjs
```

**Look without touching anything:**

```
RELAY_DRY_RUN=true GITHUB_TOKEN=<token> \
  GITHUB_REPOSITORY=mohammedwessam2007/uberbondd \
  node scripts/github-relay-worker.mjs
```

Optional environment: `RELAY_WORKER_ID`, `RELAY_TARGET_AGENT` (default
`claude-code`), `RELAY_MAX_TASKS` (default 1, capped at 5).

**Stopping** is just not running it again. Each invocation claims at most
`RELAY_MAX_TASKS` tasks and exits — there is no daemon to kill and no
background loop to forget about. If a worker dies mid-task its lease simply
expires and the task becomes claimable again.

**Proxy note.** Node's global `fetch` ignores `HTTPS_PROXY` unless
`NODE_USE_ENV_PROXY=1` is set, while `curl` and `git` honour it automatically.
In a proxied sandbox that difference is invisible until every API call returns
401. The worker detects this and re-execs itself once with the flag set. This
is why it does a `preflight()` `GET /user` **before** claiming: claiming a task
and then discovering you have no working credential strands the task under a
dead lease.

---

## 9. Proof this is live

Executed against the real repository, not a fixture:

- **Issue:** https://github.com/mohammedwessam2007/uberbondd/issues/39
- **Task id:** `chatgpt-live-bridge-roundtrip-1787190395958`
- **Source commit:** `431305b2`

```
1 CLAIM      : true CLAIMED
2 DUP CLAIM  : BLOCKED lease-held-by-another-worker
3 HEARTBEAT  : true HEARTBEAT_ACCEPTED
4 WRONG BEAT : BLOCKED lease-owner-mismatch
5 SUBMIT     : true RECEIVED | comment 5350200287
6 REPLAY     : BLOCKED task-already-completed
7 REVIEWER   : status COMPLETED | commit 431305b2 | confidence HIGH | fields 16
8 ENVELOPE   : status COMPLETED | attempts 1 | idem github-issue:39 | resultRefs 1
```

Step 7 is the one that matters: the receipt was read back **through the
independent reviewer path**, not by the process that wrote it.

Five real defects were found and fixed by running this against production
rather than against tests:

1. A double-escaped regex (`\\s` instead of `\s`) meant the `Bearer` secret
   pattern never matched real whitespace — the scanner had a hole in it.
2. An unanchored `sk-` pattern false-positived on a timestamped task id that
   happened to contain `sk-1787…`.
3. GitHub HTML-escapes issue bodies but **not** comments. `&#34;` broke
   `JSON.parse`, so the relay reported zero tasks while a perfectly valid one
   sat open. Found live on issue #30.
4. `cost.tokens` (a compute-unit counter) tripped the secret scanner because of
   the word "tokens".
5. `externalEffects.credentialChanges` tripped it too — the ledger exemption
   only covered one of the two field names.

---

## 10. What requires Mohamed

Exactly one thing, and it is optional. See section 11 for why.

Everything in sections 1–9 already works with no action from you.

---

## 11. What is not live, stated plainly

**The HTTP ingress is deployed but has never been configured, and cannot be
verified from here.** `api/agent-relay.mjs` exists, is syntax-checked and
unit-tested. A separate Vercel project `uberbond-relay` was recorded earlier
(deployment `dpl_9ox6CB71AdLeSHVaEfv8oq1ukBZ9`, production URL
`https://uberbond-relay.vercel.app/api/agent-relay`) responding `503
RELAY_NOT_CONFIGURED` to an unauthenticated probe. That 503 is correct
fail-closed behaviour: no `UBERBOND_RELAY_TOKEN` and no `GITHUB_TOKEN` have
ever been placed in its secret store, so it has never carried a real task.

**It must not be described as a working ingress.** Fail-closed and functional
are not the same thing.

From this session its current state could not be re-checked at all, for two
independent reasons, both measured rather than assumed:

- The connected Vercel account lists **zero projects**, including after a
  reconnect. `uberbond-relay` is not visible to it, and
  `dpl_9ox6CB71AdLeSHVaEfv8oq1ukBZ9` returns 404 through the connector.
- The egress proxy returns `403 CONNECT` for `*.vercel.app`, so the deployment
  could not be probed even read-only.

This is recorded as **unverified, not refuted**. The project may well still
exist and still be serving its 503 under an account this session cannot see.
What is certain either way is that it has no credentials and has never
processed a task.

**GitHub Actions is not running.** The workflow file is committed and correct,
but every run since commit `fe51c3c` dies in 3–10 seconds with 404 job logs —
the signature of a billing or quota stop, not a broken workflow. Runs were
green through 2026-07-17. Nothing in the relay code caused this and nothing in
the relay code can fix it.

**Neither of these blocks the bridge.** GitHub Issues is the durable store; the
HTTP ingress is an optional convenience front door, not a third system. The
bridge works today without either.

---

## 12. Owner action card (optional — only if you want the HTTP front door)

Do this only if you want ChatGPT to reach the relay over HTTPS instead of
through the GitHub API. **The bridge already works without it.** This is what
turns the ingress's `503 RELAY_NOT_CONFIGURED` into a working front door.

1. **Create a fine-grained GitHub token.**
   Page: <https://github.com/settings/personal-access-tokens/new>
   - Token type: **Fine-grained personal access token** (not classic)
   - Repository access: **Only select repositories** → `mohammedwessam2007/uberbondd`
   - Permissions — exactly two, nothing else:
     - **Metadata: Read-only**
     - **Issues: Read and write**
   - Expiry: whatever you are comfortable with; 90 days is fine.

2. **Paste it into Vercel.**
   Vercel → project `uberbond-relay` → Settings → Environment Variables.
   Add exactly these three, applied to Production:

   | Name | Value |
   |---|---|
   | `GITHUB_TOKEN` | the token from step 1 |
   | `UBERBOND_RELAY_TOKEN` | a fresh high-entropy bearer token you generate |
   | `GITHUB_REPOSITORY` | `mohammedwessam2007/uberbondd` |

   The names must match exactly — the endpoint checks for these three and stays
   at `RELAY_NOT_CONFIGURED` until all three exist.

3. **Redeploy that project only.** The health endpoint should stop returning
   503. If it still does, one of the three names is misspelled.

Never paste either token into a chat, a commit, an issue, or a log. Nothing in
this repository will ever ask you for their values.

**Estimated time: about 5 minutes.**

Do **not** create a broad classic PAT. Do **not** reuse an existing
general-purpose credential. Do **not** touch `uberbondd-lite-private`, domains,
DNS, payments, mailboxes or any customer system — the relay project is separate
and stays separate.

---

## 13. Verification gate

Run before trusting any change to the relay:

```
npm run check:syntax        # every module parses
npm run test:vercel-relay   # focused relay suite
npm run test:deterministic  # full repository suite
npm audit
```

Last full run against the code in this document:

| Gate | Result |
|---|---|
| `check:syntax` | pass (exit 0) |
| `test:vercel-relay` | 9 tests, 9 pass, 0 fail |
| `test:deterministic` | 1134 tests, 1092 pass, **0 fail**, 42 skipped |
| `npm audit` | 0 vulnerabilities |
| `tests/github-relay.test.mjs` | 18 tests, 18 pass |

A dependency that is missing is reported as `NOT_RUN`. It is never rounded up
into a pass.
