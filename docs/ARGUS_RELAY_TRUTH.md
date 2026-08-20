# Project Argus: ChatGPT <-> UberBond <-> Claude Code relay -- truth reconstruction

> **Deployment addendum — 2026-08-20:** A separate Vercel project named `uberbond-relay` now exists at https://uberbond-relay.vercel.app. Deployment `dpl_9ox6CB71AdLeSHVaEfv8oq1ukBZ9` is READY and the relay function responds. Its unauthenticated health probe currently returns `503 RELAY_NOT_CONFIGURED` because no `UBERBOND_RELAY_TOKEN` or `GITHUB_TOKEN` has been placed in the Vercel secret store. This is intentional fail-closed behavior. The Lite production app remains separate and healthy. No live relay task, external message, spend, deployment mutation, or revenue is claimed by this addendum.


This document records the truth-reconstruction, branch reconciliation, defects
found and fixed, and honest capability status for the governed cloud relay
mission ("UBERBOND SOL -> CLAUDE CODE GO-LIVE MASTER MISSION"). It follows the
same discipline as `docs/INSTANTLY_RECONCILIATION.md` and
`docs/PROMETHEUS_BRANCH_RECONCILIATION.md`: independently verify every claim
in the mission brief against git, source, and test evidence rather than
trusting it.

## THE BRIDGE IS NOW LIVE ONCE, over GitHub -- read this first

The earlier waves treated "no deployed HTTP host" as "no live relay is
possible." That was wrong, and this section corrects it.

The mission's own Wave 5 listed four possible connection paths and explicitly
included **"(C) GitHub-mediated fallback task packet."** GitHub is already a
durable, authenticated, always-on, credential-managed store that both ends of
this bridge can reach today, with no new infrastructure, no new host, and no
new spend. `src/github-relay.mjs` implements exactly that.

**It has now carried a real task end to end on real infrastructure:**

| Step | Real artifact |
|---|---|
| Producer opens a task | [issue #30](https://github.com/mohammedwessam2007/uberbondd/issues/30), labelled `agent-relay:task` |
| Packet compiled | by the same `compileAgentTask()` the HTTP relay uses |
| Worker polls + claims | claim comment `5348571058`, lease 1800s |
| Worker does real work | `npm run test:deterministic` -> **1092 tests, 1050 pass, 0 fail, 42 skipped, exit 0** |
| Worker returns a receipt | result comment `5348593358` |
| Task closed | labelled `agent-relay:done`, state `closed` |

No mock at any hop. Real issue, real comment ids, real timestamps, real
measured test numbers.

### The live run found a real defect that no fixture had

Reading issue #30 back through the MCP GitHub client returned the body
**HTML-escaped** -- `"` arrived as `&#34;` -- so `JSON.parse` failed and the
relay reported **zero claimable tasks while a perfectly valid task sat open on
the repo**. A silent, total failure of the bridge, invisible to every unit
test, caught only by actually running it. `extractFencedJson()` now falls back
to single-pass HTML entity decoding (single-pass specifically so a literal
`&amp;#34;` in content is not double-decoded into a quote), with regression
tests for both directions.

Worse, the escaping is **inconsistent between endpoints on the same client**:
reading issue #30's *body* returned `&#34;`, while reading its *comments*
returned raw `"`. So a client author cannot simply decide "this API escapes" or
"this API doesn't" -- the parser has to tolerate both on every read, which is
what it now does (try raw, fall back to decoded).

This is the clearest argument in this whole document for why "the tests pass"
is not the same as "it works."

The full reviewer round-trip was then re-verified against the real comment
bodies pulled back from GitHub: `resolveLease()` reports `HELD` by
`claude-code:argus-session` while the work was in flight and `COMPLETED` once
the result landed, and `parseResultComment()` recovers the measured numbers
(1092/1050/0) intact.

### Same contract, different wire -- not a second relay

`src/github-relay.mjs` imports `ZERO_EFFECTS`, `hasSecret()`, and
`validResult()` from `src/cloud-agent-relay.mjs` rather than re-declaring them,
and compiles packets with the same `compileAgentTask()`. The two transports
cannot drift apart in what they consider safe. A result claiming any nonzero
external effect is rejected identically on both.

### Honest limitation, stated plainly

GitHub labels and comments are **not** database row locks. Two workers that
poll and claim in the same instant can both believe they hold the lease.
`resolveLease()` resolves that deterministically after the fact (earliest
server-assigned comment id wins, and the same answer is returned regardless of
which worker asks or what order the comments arrive in), but it cannot prevent
duplicated work that already happened. That is acceptable for the intended
shape of this bridge -- a small number of owner-initiated tasks and one Claude
worker -- and unacceptable at high concurrency. `cloud-agent-relay.mjs`, with
real `SELECT ... FOR UPDATE SKIP LOCKED` proven against a real PostgreSQL
server, remains the stronger transport and is the one to promote the moment a
real UberBond host exists.

## UPDATE 2026-08-20: the unattended path has now actually run

The section below (kept for the record) argued the status had to stay
`LIVE_UNPROVEN` because the one live run was driven by an interactive session.
**That is no longer true.** `scripts/github-relay-worker.mjs` has now handled a
real task end to end with no MCP tools, no human, no GitHub Actions, and no
Vercel — only Bash and the environment credential:

| Step | Evidence |
|---|---|
| Task authored by a *different* agent | [issue #32](https://github.com/mohammedwessam2007/uberbondd/issues/32), "Verify Vercel relay ingress" |
| Worker authenticated | `authenticated as mohammedwessam2007 (via env proxy)` |
| Polled and claimed | `claimed #32 (chatgpt-vercel-relay-check-20260820)` |
| Ran real bounded work | `npm run test:deterministic`, allowlisted, to completion |
| Posted a receipt | result comment, `decision: PROCEED`, strictly-zero effect ledger |
| Closed | `agent-relay:done`, state `closed` |

The task was not written by the worker and not staged for it. That is the
device-off path executing, not merely designed.

`src/capability-graph.mjs` is updated to `VERIFIED_LIVE` — and that status had
to be **added to the enum**, because until this moment nothing in UberBond had
ever earned it. A regression test now guards it: anything claiming
`VERIFIED_LIVE` must cite an externally-addressable artifact (an issue number,
a receipt, a deployment), not just prose.

### Two more defects that only running it could find

**1. Node's `fetch` silently ignores `HTTPS_PROXY`.** `curl` and `git` honour
proxy environment variables automatically; Node 22's global `fetch` does not
unless `NODE_USE_ENV_PROXY=1`. In a proxied environment — where the proxy is
what carries the usable credential — this meant *every* GitHub API call from
the worker returned `401 Bad credentials`, while the identical `curl` returned
`201`. Diagnosed by running both side by side:

```
curl  (via proxy)            -> 201
curl  --noproxy '*'          -> 401
node  fetch (default)        -> 401
node  fetch NODE_USE_ENV_PROXY=1 -> 200
```

The env `GITHUB_TOKEN` is not itself a valid GitHub credential here; the proxy
supplies the real one. The worker now re-execs once with the flag when a proxy
is configured, and is unaffected on an ordinary host where no proxy exists.

**2. The failure would have stranded a real task.** Claim happens *before* the
work. A credential that fails on first write fails *after* the claim comment
has already landed — leaving a genuine task locked under a lease held by a
worker that is already dead, unclaimable by anyone else until the lease
expires. The worker now runs a `GET /user` credential preflight and refuses to
claim anything if it fails. One extra request removes an entire class of
outage.

Neither defect is exotic. Both were invisible to a green test suite, and both
would have made the "device-off" claim false in practice while every unit test
still passed.

### What is still not proven

The hourly Claude Routine (`trig_01DJCzu8hnmUPF6iVnQTbQ9b`) that fires this
worker on a schedule **has not yet fired on its own**. The worker it invokes is
proven; the scheduler invoking it is not, until its first real firing.
`.github/workflows/agent-relay-worker.yml` likewise remains unexecuted while
GitHub Actions is blocked.

### Why the status was LIVE_UNPROVEN and not VERIFIED_LIVE (superseded by the update above)

The one live run was driven by an interactive Claude Code session acting as the
worker. The **unattended** path -- `.github/workflows/agent-relay-worker.yml`
calling `scripts/github-relay-worker.mjs` -- is written, syntax-checked, and
minimally-permissioned (`issues:write`, `contents:read`; it cannot push, merge,
deploy, or reach any other secret), but it has **never executed**, because
GitHub Actions on this account is blocked (below). Until it runs unattended at
least once, "device-off" is designed and staged, not proven.

### The worker cannot be turned into a general agent by a task packet

`scripts/github-relay-worker.mjs` runs exactly three allowlisted npm scripts
(`check:syntax`, `test:deterministic`, `check`) and reports
`UNSUPPORTED_OBJECTIVE` for anything else. It never interprets free text from
an issue body as a command. Without that constraint, "anyone who can open an
issue" would equal "anyone who can run code in CI."

### GitHub Actions is blocked, and the evidence dates it

Not an assumption. CI ran **clean and green through 2026-07-17** on this repo,
then every run from commit `fe51c3c` onward completes in ~3-10 seconds with
job logs returning HTTP 404 -- across PRs #26, #28, #29 and the `main` merge.
Jobs are dying before any step executes. That is the signature of an Actions
billing/quota/runner-allocation lapse on the account, not a code failure, and
it is the single thing standing between the staged unattended worker and a
genuinely device-off bridge. Owner fix: GitHub -> Settings -> Billing.

## A second reconciliation, mid-wave: `main` moved independently

While this wave was in progress, `main` was fast-forwarded directly (not
through PR #28) to include the full `agent/cloud-agent-relay` history plus
one further commit, `fe51c3c "Harden cloud agent relay leases"`, authored
independently of this session. That commit built its own heartbeat route,
MCP tool, and module function -- overlapping with the heartbeat gap this
wave had also just found and closed -- plus two real fixes this wave had
not made: an idempotent/replay-safe `createCloudRelayTask` (rejects a
task id reused with a different packet as `task-id-conflict`, replays the
same packet without creating a second job) and HTTPS enforcement in the MCP
transport (`scripts/uberbond-mcp.mjs` now refuses to send the bearer token
over plaintext HTTP to anything but a loopback address).

This was caught by re-fetching `origin/main` before pushing, not assumed
away. Per the mission's own duplication-handling rule ("map both
implementations, identify canonical truth, preserve unique useful
behavior... remove only confirmed duplication"), the two heartbeat
implementations were reconciled by a real `git merge` (not a pick-one-side
overwrite): `main`'s ownership-check ordering, reason codes
(`lease-owner-mismatch` vs `lease-lost-before-heartbeat`), and
`HEARTBEAT_ACCEPTED` status name were kept as canonical (already tested,
already on `main`); this wave's own additive, non-overlapping work --
the two `SECRET_VALUE` regex fixes, rate limiting, `relayHealthSummary()`,
and the OMNIA-V9/outreach recovery this branch carries that `main` does
not -- was preserved on top. Both sides' tests were kept, not dropped; one
duplicate mock method (`heartbeatJob` defined twice in the same test
fixture object, the second silently shadowing the first) was deduplicated.

## Branch/PR ancestry (independently verified via `git merge-base`)

- `agent/commercial-opportunity-catalog` (PR #27) branches from
  `claude/uberbond-overnight-shift-o73nrs` at commit `82449e8` -- **before**
  this branch's later OMNIA-V9 kernel + outreach/lead-generation archive
  recovery (`61a01f5`..`1dc8b22`, see `docs/INSTANTLY_RECONCILIATION.md`).
- `agent/cloud-agent-relay` (PR #28) branches from
  `agent/commercial-opportunity-catalog`, adding 5 commits: the relay itself
  (`adc3a2d`), an effect-ledger redaction hardening pass (`846e310`), and 3
  commits adding the mission brief and a large paged reference doc as
  markdown files (`1e07f32`, `0d90ca5`, `099301a` -- no code).
- The mission's own "recently observed PR #28 head was `846e3107...`" is
  **stale** -- 3 more commits landed after that observation. Verified by
  walking the actual branch log, not trusted from the brief.
- `docs/UBERBOND_SOL_CLAUDE_CODE_5MB_EXTERNAL_EXECUTION_PACK.md` is genuinely
  ~5.0MB (verified via `git cat-file -s`), not a mislabeled small file. Its
  own first section explains why: "a paged, just-in-time blueprint atlas...
  Do not load every blueprint into one context window." Treated as inert
  reference documentation, not re-read in full (consistent with its own
  operating instruction) and not source of any code decision in this wave.
- **Integration performed**: a new branch (`agent/argus-relay-integration`)
  was created from this branch's newest tip (`1dc8b22`, which includes the
  OMNIA-V9/outreach recovery `agent/cloud-agent-relay` did not have), then
  `agent/cloud-agent-relay` was merged in with a real, non-force `git merge`.
  One real conflict (`package.json`'s `test:deterministic`/`check:syntax`
  script lines) was resolved as a strict union of both sides' file lists (96
  unique test files, 130 unique syntax-check commands, zero drops from
  either side) -- not a pick-one-side resolution. `server.mjs`,
  `src/config.mjs`, and `src/store.mjs` merged cleanly with no conflicts.

## Defects found and fixed this wave (with regression tests)

1. **`src/cloud-agent-relay.mjs`: double-escaped secret-value regex.**
   `SECRET_VALUE` was written as `/Bearer\\s+\\S+/` inside a regex literal --
   `\\s` in that context matches a literal backslash character followed by
   `s`, not whitespace. A raw `Bearer <token>` string nested under any
   non-secret-shaped key (e.g. `{"note": "Bearer eyJ..."}`) passed the
   secret scanner untouched. Fixed to `/Bearer\s+\S+/`. Regression test:
   `tests/cloud-agent-relay.test.mjs` "rejects a secret-shaped VALUE even
   under an innocuous key name".
2. **`src/cloud-agent-relay.mjs`: unanchored `sk-`/`ghp_` patterns
   false-positive on ordinary ids.** Found live, not by inspection: the
   first real end-to-end MCP proof run rejected a normal generated taskId
   (`e2e-task-1787174626471`) as secret-bearing, because it contains the
   substring `sk-1787174626471` (from `ta**sk-1**787174626471`), which
   `/sk-[A-Za-z0-9]{12,}/` matched with no word-boundary anchor. Fixed to
   `/\bsk-[A-Za-z0-9]{12,}/` (and the same for `ghp_`). Regression test:
   "does not false-positive an ordinary taskId... merely because it contains
   'sk-' as a mid-word substring". This is exactly the kind of defect the
   mission's own hostile-test list anticipates ("malformed payload") but the
   original PR's 5-test suite did not cover either direction of the secret
   scanner.
3. **No rate limiting on `/api/agent-relay/*` routes.** The mission's Wave 3
   explicitly requires it; none existed. Added a real sliding-one-minute-
   window limiter in `server.mjs` (same shape as `RevenueEngine.rateLimit()`
   already used for the public audit intake), keyed by caller IP, bounded by
   the new `config.agentRelay.rateLimitPerMinute` (default 120/min, env
   `AGENT_RELAY_RATE_LIMIT_PER_MINUTE`). Reached only after `relayAuth()`
   already passed.

## Real proof obtained this wave

- **Real local HTTP server + real local MCP process over actual stdio
  JSON-RPC** (`tests/claude-mcp.test.mjs`, new test): spawns `server.mjs`
  (JSON store, relay enabled) and `scripts/uberbond-mcp.mjs` as two separate
  real child processes, wired together over the real network on localhost.
  Drives: `initialize` -> `tools/list` -> create a task via a raw
  authenticated fetch (simulating the ChatGPT/producer side, since the MCP
  bridge deliberately exposes no "create" tool) -> `uberbond_relay_poll` ->
  `uberbond_relay_claim` -> `uberbond_relay_heartbeat` (extends the same
  lease claim established, and confirms a non-owner heartbeat is rejected)
  -> `uberbond_relay_submit` -> a second submit for the same task is
  rejected (real replay protection, not asserted from the module test
  alone) -> every byte the bridge process wrote to stdout/stderr is scanned
  and confirmed to never contain the raw relay token. This satisfies every
  item of the mission's Wave 4/8 checklist for real, including item 6 ("a
  heartbeat extends the lease").

  **A real gap found and closed this wave**: PR #28's relay had no
  heartbeat route, MCP tool, or module function at all -- only claim/submit.
  A relay task's lease uses the same `lockTimeoutMs` (default 300s) as any
  other queue job; a Claude Code task genuinely running longer than 5
  minutes would have its lease silently reclaimed by `recoverStaleJobs()`,
  risking exactly the stale-lease race the mission's own hostile-test list
  names. Added `heartbeatCloudRelayTask()` (`src/cloud-agent-relay.mjs`,
  reusing the existing `store.heartbeatJob()` ownership check --
  `status==='active' && lockedBy===workerId`, so a non-owner heartbeat is
  structurally rejected, not just policy-rejected), the
  `POST /api/agent-relay/tasks/:taskId/heartbeat` route, and the
  `uberbond_relay_heartbeat` MCP tool, each with unit and real end-to-end
  coverage.
- **Real PostgreSQL concurrency proof**, not fake-store-only: spun up a real
  embedded PostgreSQL 18 server and ran the full `tests/postgres-store-live.test.mjs`
  suite (22/22 pass), including 3 new tests added this wave that are
  relay-specific: `claimJobs()` with `excludeTypes` never claims a real
  `prometheus.agent.relay`-typed job (normal workers cannot steal it),
  `claimJobsByType()` uses real `FOR UPDATE SKIP LOCKED` so two concurrent
  `claude-code` workers racing for the same relay task never both win, and
  `claimJobsByType()` only returns jobs matching the requested `targetAgent`.
- **Full local suite**: see the commit/PR for the exact final `npm run
  check` pass/fail count on the integrated branch.

## Wave 5: ChatGPT/OpenAI adapter -- truth

The HTTP API (`/api/agent-relay/*`) is the ChatGPT-facing interface and is
now proven end-to-end from the Claude Code side (above). What is **not**
provable from this session:

- No OpenAI/ChatGPT connector, custom MCP/HTTP connector approval, or OpenAI
  API credential exists in this environment or repository.
- No connected-tool receipt from an actual ChatGPT conversation exists.

Status: **INTERFACE_READY**. The producer/reviewer contract (create task,
poll result, retrieve evidence refs) is implemented and tested against a
real HTTP server; connecting an actual ChatGPT Work conversation or an
OpenAI API worker to it is **OWNER_REQUIRED** (platform connector approval,
or an API key) and **EXTERNAL_PROOF_REQUIRED** (a real connected-tool
receipt) before it can be called live. This was true before this wave and
remains true after it -- nothing in this environment can change that.

## Wave 6: device-off cloud execution -- truth

The mission asks whether Claude Code can run without Mohamed's device. The
honest answer, verifiable from this very session: **yes, in principle** --
this session itself is a Claude Code Remote session, running in an isolated
cloud container, not on any local device. The `claude-code-remote` MCP tool
family available to this session (`create_session`, `create_trigger` for
scheduled Routines, `list_sessions`, etc.) is real, callable infrastructure
for spawning and scheduling further cloud-hosted Claude Code sessions
without a founder device in the loop.

What this wave deliberately did **not** do: create a live recurring trigger
that polls a production relay URL. That would be a real, persistent,
resource-consuming automation, and there is no deployed, reachable
`UBERBOND_AGENT_RELAY_URL` for it to poll yet (see Wave 7) -- setting one up
now would either fail immediately or poll nothing, which is not proof of
anything. Status: **LIVE_UNPROVEN** for "a device-independent Claude Code
execution substrate exists and is reachable by this account" (true, and
partially self-evident from this session running at all), **OWNER_REQUIRED**
for "wire a real scheduled Routine to a real deployed relay" (needs Wave 7
resolved first, and is consequential enough to confirm with the owner before
creating a standing recurring automation).

## Wave 7: Vercel/deployment truth

Verified directly from the repository, not assumed: **only
`lite/vercel.json` exists.** There is no root-level `vercel.json`. This
independently confirms the mission's claim: whatever Vercel project is
configured on the dashboard was set up with `lite` as its root directory,
and the full Node control plane (`server.mjs`) and worker (`worker.mjs`) are
not deployed by that project.

This is not just a missing config file -- it is architecturally correct that
they are absent. `server.mjs` runs a long-lived `http.createServer(...)`
listener and `worker.mjs` runs `queue.startWorker()`'s infinite polling
loop; neither is shaped as a Vercel serverless Function (stateless,
short-lived, no persistent listen/poll). Deploying them to Vercel as-is is
not possible without a genuine rearchitecture (the mission's own "Option 2":
bounded HTTP relay as Vercel Functions, a separate durable
workflow/queue for the worker).

No Vercel MCP tool was available in this session to fetch live deployment
logs (the connector was disconnected partway through this session). What
**is** independently verifiable without it: GitHub Actions CI on PR #28
(`.github/workflows/ci.yml`, jobs `deterministic` and `browser`) both
report `conclusion: failure` after a **3-second** run window
(`created_at` 21:09:39 -> `updated_at` 21:09:44), for a job that runs
`npm ci && npm run check` -- which this session measured at ~2 minutes
locally. Job log downloads return HTTP 404. This is the reproducible
symptom of a runner-allocation failure (billing/quota/org restriction), not
a real test failure -- but it is not resolvable from this session's tool
access, and is reported as **BLOCKED**, not assumed.

Status: **OWNER_REQUIRED** for both a working Vercel/GitHub Actions billing
state and an actual always-on host for `server.mjs`/`worker.mjs` (Option 1
from the mission: keep `lite/` on Vercel as today, host the control plane +
worker on a separate always-on service using the existing PostgreSQL/Neon
database this repository already supports via `STORE_BACKEND=postgres`).
This wave prepared no new deployment manifest beyond what already exists in
`docs/CHATGPT_CLAUDE_CLOUD_RELAY.md`'s environment-variable list, since
committing to a specific host without owner input on which one they already
have would itself be a guess dressed up as a plan.

## Honest current status (per the mission's required truth labels)

| Capability | Status |
|---|---|
| Relay data model, queue, lease, idempotency, replay protection | TEST_VERIFIED (real local HTTP + real Postgres concurrency proof) |
| Authenticated HTTP relay API | TEST_VERIFIED (real local proof); rate limiting added this wave |
| Claude Code MCP adapter | TEST_VERIFIED (real stdio JSON-RPC, real end-to-end proof) |
| ChatGPT/OpenAI producer adapter | INTERFACE_READY |
| A real ChatGPT <-> Claude Code task crossing both directions with a live provider receipt | EXTERNAL_PROOF_REQUIRED |
| Device-off Claude Code execution substrate (exists) | LIVE_UNPROVEN |
| Device-off worker wired to a real deployed relay | OWNER_REQUIRED |
| Reachable deployed relay URL | ABSENT (no root vercel.json; no always-on host configured) |
| Hosted GitHub Actions CI | BLOCKED (reproducible ~3s-completion + 404-log symptom) |
| Real commercial state | $0 verified revenue, 0 verified paying customers, 0 accepted live deliveries (unchanged) |

Nothing above is stretched to satisfy the mission's "real live bridge or
owner activation card" framing. The bridge is real, local, and tested. It is
not live, and this document says so plainly.
