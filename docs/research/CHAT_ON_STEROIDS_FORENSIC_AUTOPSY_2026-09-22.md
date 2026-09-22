# Chat On Steroids forensic autopsy and UberBond assimilation — 2026-09-22

Status: **GIT OBJECT IDENTITY COMPLETE / BEHAVIORAL CORPUS TRAVERSED / CLEAN-ROOM ASSIMILATION IN PROGRESS**

This supersedes the 2026-09-21 autopsy without deleting it. The older branch remains lineage evidence.

## Exact donor anchor

- repository: `totec448-spec/chat-on-steroids`
- exact current main: `7777e517603289696bb5febddb9bbf51cdde9aea`
- root tree: `0638dbc098b20fc41ff494673f957ab5ce0371df`
- tracked blobs: **848**
- tracked Git trees: **42**
- tracked blob bytes: **92,279,414**
- package version: **2.1.14**
- license: **MIT**
- exact manifest: `artifacts/research/chat-on-steroids-git-object-manifest-2026-09-22.json`

A fresh live comparison on 2026-09-22 showed donor `main` still exactly equals the audited commit.

### What “byte complete” truthfully means here

Every tracked object is enumerated with path, mode, Git blob SHA and byte size under the pinned root tree. That closes the previous search-cap uncertainty.

The environment does **not** permit a second independent SHA-256 pass over every binary blob: the GitHub connector rejects non-UTF-8 binary bodies and the local shell has no outbound DNS. Therefore no fake independent archive digest is claimed. Git object identity is complete; independent binary rehashing is explicitly unavailable.

## What was actually traversed

The audit covered every behavior-bearing family rather than stopping at README/features:

- 240 `src` files / 6,131,449 bytes;
- all 136 `src/main` files;
- all 34 `src/shared` files;
- renderer/preload behavior code;
- all 17 extension files, including the 11,654-line content script;
- all three native helper sources;
- all 67 scripts;
- **all 229 test blobs** / 5,596,069 bytes;
- root package/build/security/license/config;
- design docs, bug audits, release notes, worklogs and provider-warning evidence;
- current open issue surface, with architecture-relevant issues read individually.

Binary media, generated artwork and giant license payloads are object-accounted separately. They are not misrepresented as application logic.

## Central finding

Chat On Steroids is not mainly “ChatGPT with terminal tools.” Its strongest engineering is the machinery that prevents long-lived UI automation from lying about ownership:

`browser evidence -> request identity -> conversation -> durable local session -> continuation transaction -> worker family -> workspace -> tool principal -> process/desktop/plugin owner -> receipt/recovery`

The donor value is **identity + lifecycle + uncertainty**, not its branding or its broad shell.

## Strongest mechanisms

### 1. Transactional continuation

Compact & Resume is a real state-transfer protocol. Source chat authority remains until a destination proves itself and the durable rebind commits. Abort leaves the source authoritative.

This aligns with UberBond’s Context Fabric, but UberBond still lacks this exact provider-conversation transaction primitive.

### 2. Exact request correlation

CoS joins MCP request IDs to provider-page request evidence, then to exact conversation and durable session. Tool name, active tab and timestamps are not accepted as ownership proof. First exact proof wins; conflicting later proof is rejected.

### 3. Semantic effect checkpoints

CoS distinguishes `not-attempted`, `attempted-unresolved`, `dispatched-unresolved`, and `sent`. Post-dispatch ambiguity is not automatically replayed.

UberBond’s OMNIA effect state machine is already philosophically stronger, but the same mechanism was missing in the new UberAgent command bridge.

### 4. Dual browser observation

DOM/MutationObserver and React Fiber/request evidence are separate sensors reconciled through a durable MV3 journal. This is why CoS survives provider UI drift better than a simple selector bot.

This should stay behind a replaceable provider adapter if UberBond ever adopts it.

### 5. Worker and process custody

Friendly worker names do not grant authority. Worker families, run incarnations, conversation identity and process ownership are kept distinct. Sleeping workers retain history without consuming an active slot.

UberBond already owns leases, receipts and agent-runtime identity concepts. Assimilation must merge into those owners, not fork them.

### 6. Native computer-use generations

Frames, semantic UI references and helper processes have explicit generations. Stale coordinates/references fail closed. Partial input batches report exactly how far execution progressed.

Useful later for a founder-owned computer-use adapter, but **not** a reason to add remote desktop authority to UberAgent today.

### 7. Plugin generations

Updates are generation-based and rollback-capable; tool-name conflicts refuse exposure; disabled tools keep reservations; OAuth state/PKCE and credential separation are explicit.

This belongs underneath Capability Genome and external-capability control plane.

### 8. Evidence taxonomy

The repo repeatedly separates source proof, fixture proof, installed runtime proof and live signed-in provider proof. This is a high-value methodological donor and matches UberBond’s truth doctrine.

## Failure archaeology harvested

The audit preserved why mechanisms exist:

- continuation could crash between durable commit and publication;
- request identity could arrive late;
- arbitrary session scan caps created false “history exhausted” claims;
- ACK loss after a real send created retry ambiguity;
- reconstructed relay fields silently dropped state;
- stale desktop coordinates could act on the wrong frame;
- worker identity keys were once too weak;
- provider UI localization broke duplicated classifiers;
- cleanup races could make passing release tests appear failed;
- public-history metadata once leaked private identity/session references.

The final mechanism, defect history and regression proof are all donor context. The failures are not erased after the fix.

## Current UberBond comparison

Comparison source is live UberBond `main` at `e834c8ee230c52b72a61cd4b8121ab3ab0f5b6ea`, not the older Sep-21 snapshot.

UberBond already has strong owners for:

- authority/effect separation;
- idempotency and external-effect reconciliation;
- agent worker leases;
- autonomy receipts;
- Capability Genome and graph;
- external capability policy;
- Context Fabric / Total Brain / no-retelling;
- OMNIA consequence gates;
- provider/model identity truth;
- crash/recovery receipts.

Therefore these are **not cloned**.

## Live UberAgent forensic result

The live Supabase project is healthy and the `uberworm-node` Edge Function is active at provider version 1 with provider artifact SHA-256:

`953c5b2df21035054f2f7a950303ce8770d72d5b7740147230fc78778f469052`

Its exact source was not tracked in Git before this branch. It is now preserved at:

`ops/supabase/uberworm-node/live-v1/index.ts`

A provider-state snapshot is at:

`artifacts/provider-snapshots/uberagent-supabase-control-plane-2026-09-22.json`

### Queue truth

Observed live command history at audit time:

- 10 commands total;
- 4 done;
- 5 failed;
- 1 cancelled;
- no pending or stranded running command observed.

The database does enforce one receipt per command.

However, `poll` changes `pending -> running` with `claimed_at`, and the observed schema has no:

- claim token;
- claim epoch;
- attempt count;
- lease expiry;
- stale-running recovery state.

A node crash after claim and before receipt can therefore strand the command as `running`.

### Token-storage contradiction

`docs/UBERAGENT_V2.md` says the node token is DPAPI encrypted.

The live node’s latest successful ping identifies the runtime as `uberagent-legacy-ps-v1`. On current main, both `uberagent-legacy.ps1` and the newest `uberagent-autonomy-v2.ps1` read plaintext `node.token`.

This is a real current-source/deployed-lineage contradiction.

The branch repairs both scripts with one-time plaintext-to-DPAPI migration:
1. encrypt under Windows CurrentUser;
2. write the DPAPI ciphertext;
3. decrypt/read back and compare;
4. only then delete the legacy plaintext file.

The live HP has **not** been changed by this audit.

## First clean-room assimilation implemented

`src/uberagent-command-recovery.mjs` adds:

- immutable SHA-256 execution-intent digest;
- explicit action recovery class;
- durable receipt fence;
- terminal/expired no-execute states;
- active-lease wait state;
- safe reclaim only for read-only actions;
- reconciliation-required state for writes, compute and control;
- quarantine for malformed/unknown state.

Focused independent verification: **11 tests, 11 pass, 0 fail**.

This code cannot execute a command or mutate a provider. It only classifies recovery.

## What UberBond should take

P0:
1. provider request/conversation/session exact join;
2. transactional provider-conversation rebind;
3. semantic effect checkpoints and durable ACK custody;
4. UberAgent claim leases + command digest + reconcile-required uncertainty;
5. evidence-level vocabulary;
6. failure-history provenance.

P1:
7. browser document/navigation epochs;
8. bounded journal custody;
9. MCP/capability surface permission rechecks;
10. worker family/run incarnation refinements;
11. plugin generation rollback;
12. process custody;
13. public-history privacy gates.

P2:
14. native frame/helper generations;
15. chat-scoped local workspace;
16. bounded local code composition.

## What UberBond should not take

- arbitrary logged-in-user shell authority;
- browser/Fiber internals in sovereign core;
- broad browser debugger permissions by default;
- unencrypted full conversation history as a universal default;
- unsigned binaries as a trust model;
- app-level path checks described as OS isolation;
- automatic retry after an ambiguous effect;
- any mechanism intended to route around provider safety/access decisions.

## Remaining implementation frontier

1. Preserve an explicit reconstruction schema for the live UberAgent tables without pretending it was a historical migration.
2. Add provider-side `claim_token`, `attempt_count`, `lease_expires_at` and `reconcile_required`.
3. Add local durable claim/digest/receipt outbox before acknowledging completion.
4. Test a deliberate crash:
   - before claim;
   - after claim/before execution;
   - after execution/before receipt;
   - after receipt/before local cleanup.
5. Only read-only work may auto-reclaim after lease expiry.
6. Writes/compute/control reconcile from observed state before any retry.
7. Deploy only from exact tracked source after tests and migration checks.
8. Verify the old plaintext token is actually migrated/deleted on the live HP.
9. Do not add arbitrary shell/desktop authority as part of this recovery work.

## Truth boundary

This audit is now complete at **Git-object identity** and **behavioral corpus traversal** for the pinned donor commit. It is not an independent binary SHA-256 archive proof, not a claim that Chat On Steroids is defect-free, and not evidence that the branch repairs are deployed.

The donor is classified:

**REFERENCE_ONLY + CLEAN_ROOM_MECHANISM_DONOR + OPTIONAL_PROVIDER_ADAPTER_BENCHMARK**

UberBond remains the parent architecture.
