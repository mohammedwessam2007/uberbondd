# Chat On Steroids forensic autopsy — 2026-09-21

Status: **FORENSIC SOURCE AUDIT COMPLETE FOR INSPECTED LIVE GITHUB SURFACES / WHOLE-ARCHIVE BYTE HASH CLOSURE PENDING**

This is a donor-analysis artifact, not a vendor endorsement and not a declaration that Chat On Steroids is part of UberBond.

## Evidence anchors

- Upstream repository: `totec448-spec/chat-on-steroids`
- Upstream exact audited main: `7777e517603289696bb5febddb9bbf51cdde9aea`
- Upstream repository-reported size: 68,710 KB
- Upstream package/release generation: 2.1.14 plus post-release main changes
- UberBond comparison main: `3940399365b7243b4af62c35955f66b532e5672d`
- Upstream license: MIT
- Audit date: 2026-09-21

The inspection traversed the tracked architecture through GitHub source/blob/search surfaces: root/config/package/license, `src/main`, `src/main/session`, `src/main/mcp`, `src/main/codex`, `src/main/computer`, `src/main/plugins`, `src/main/tunnel`, renderer/shared/preload code, the 12-file Chromium extension, native macOS C++/Swift bridge, scripts, tests, release evidence, worklogs, security documentation and live issue reports.

GitHub search caps some directory enumerations at 100 results, so the exact claim is **100+** source/test/doc hits where capped, not a fabricated exact count. A raw upstream archive could not be materialized in the current execution environment, so no independent whole-tree byte-for-byte archive digest is claimed. This artifact must not be promoted to `BYTE_COMPLETE` until every tracked blob is enumerated by tree SHA and independently hashed or an exact archive is materialized and hashed.

## Organ map

Chat On Steroids is not one agent. Its useful architecture is a federation of explicit owners:

`browser observation -> request/conversation correlation -> durable local session -> continuation transaction -> worker family -> workspace -> MCP surface -> local execution/desktop/plugin adapters -> durable receipt/recovery`

The important separation is between durable local identity and replaceable ChatGPT UI identity.

### Session and continuation

The strongest donor is `src/main/session/continuation.ts`.

Compact & Resume is a real state transfer transaction rather than a summary convention:

`open -> summary -> claim -> commit | abort`

The local session remains authoritative in chat A until a replacement chat B proves itself and the durable rebind lands. Commit is ordered as:

1. preflight/freeze every dependency that could still refuse;
2. durable session rebind;
3. non-throwing in-memory publication of recorder/workspace/swarm mappings.

The code enters `committing` synchronously before awaiting the durable write so concurrent claims cannot both pass.

Send state is explicitly represented as:

- `not-attempted`
- `attempted-unresolved`
- `dispatched-unresolved`
- `sent`

The critical law is that pre-dispatch uncertainty can be retried, while post-click uncertainty is never replayed automatically because the external effect may already have reached ChatGPT. This is directly compatible with UberBond's existing `SAFE_RETRY / UNCERTAIN / QUARANTINE` recovery doctrine and should be generalized into the Sovereign Cognitive Continuum.

### Exact provider-call identity

`src/main/session/correlation.ts` binds the MCP HTTP `x-request-id` to ChatGPT page `message.metadata.request_id`, then to an exact conversation and durable local session epoch.

Tool name, active tab, timestamps and "only chat currently generating" are explicitly rejected as ownership evidence.

First exact proof wins. A later conflicting page observation is refused instead of mutating the owner. Proven ownership is durable and has no arbitrary time TTL. Late evidence can arrive after a call without creating a negative ownership verdict.

This is materially more precise than UberBond's current provider-chat bridge layer and is a high-value donor mechanism.

### Browser custody and MV3 durability

The Chromium companion separates MAIN-world provider observation from isolated-world app control. The MV3 worker owns the pairing secret and never exposes it to the page/content script.

Notable mechanisms:

- bounded observation journal in browser session storage;
- source conversation captured at observation time rather than inferred at delivery;
- durable command ACK outbox for irreversible sends;
- tab -> conversation map;
- browser document IDs and SPA navigation epochs;
- retired/terminal document leases;
- serialized pairing and credential-generation fences;
- durable disconnect intent so an older asynchronous pairing completion cannot undo a newer revocation;
- deferred revival metadata without duplicating full prompt text into browser storage.

The provider-specific DOM/Fiber machinery is useful but brittle. It belongs behind a replaceable provider adapter, never in UberBond's sovereign core.

### Workers

`src/main/agents.ts` uses prime-owned worker families and exact run incarnations. Friendly names such as `worker-1` never grant authority.

Workers can sleep without consuming an active slot, retain their exact conversation/history/queue, and later wake under the same family. Critical topology, message and finish changes cross a durable barrier before public success.

Important bounded resources include queue length, message size, batch size, inbox-offer size, worker silence, active worker limits and a context ceiling.

UberBond should assimilate the lifecycle/identity mechanics, not duplicate its existing agent-control constitution.

### Per-chat workspace

`src/main/workspace.ts` learns a project cwd only from absolute paths already proven reachable, keys it to exact chat/request identity, never borrows another chat's cwd, and carries it as part of the continuation commit.

Project-root discovery stops at approved roots and still passes all paths through the sandbox.

This is useful for founder ergonomics and continuity without turning workspace convenience into authority.

### Filesystem boundary

`src/main/sandbox.ts` uses canonical real paths, root containment, path-segment validation and symlink/reparse-point handling to defend the app-level filesystem boundary.

This is a useful implementation donor.

It is not a kernel sandbox. The upstream security documentation correctly admits same-user races and OS-account authority.

### Command authority: donor warning

`exec_command` is intentionally **not** confined to approved filesystem roots. Once enabled, it executes as the logged-in OS user. An upstream open issue requests an Allow/Ask/Deny policy because the current permission is effectively broad shell authority.

UberBond must not inherit this default. Any local shell donor should sit below OMNIA authority, mission-scoped capability leases, executable/effect policy, bounded cwd/environment, audit and explicit revocation.

### MCP surface architecture

The public capability vocabulary is deliberately smaller than the internal implementation.

Surfaces are split by discovery/permission boundary:

- Core: files, patching, terminal, plan, workers, session finish, bounded code composition.
- Desktop: browser/native desktop/clipboard observation and control when enabled.
- Plugins: dynamic external MCP catalog.

A surface token or cached schema does not create permission. Live permission is rechecked on every call. Exposed schemas may remain monotonic for a connection lifetime so ChatGPT's cached tool snapshot fails with `TOOL_DISABLED` rather than mysterious unknown-tool transport failure.

This is a useful pattern for UberBond's capability market.

### Bounded code composition

`src/main/mcp/code-mode-runtime.ts` runs a fresh bounded QuickJS interpreter per call and permits only the tools published to that surface.

The runtime has hard ceilings for source size, CPU/wall time, tool calls, concurrent calls, arguments, result bytes, total result bytes, explicit output, text, images and active runs.

It also states the key truth: already-dispatched tool effects do not roll back when the interpreter stops. This explicit non-transactionality is worth preserving.

UberBond should assimilate the bounded composition pattern, not the exact interpreter dependency by default.

### Plugin manager

The plugin subsystem contains several high-quality donor patterns:

- installation generations rather than in-place mutation;
- rollback to the old generation when a replacement fails;
- schema/tool-count byte ceilings;
- duplicate upstream tool-name conflicts refuse exposure;
- disabled plugins retain name reservations so stale cached calls cannot silently route to another provider;
- credentials stored outside normal config;
- secret-shaped config rejected;
- output redaction;
- bounded HTTP responses and redirect refusal;
- OAuth state/PKCE/DCR flow with exact loopback callback and endpoint-bound credentials.

This maps naturally beneath UberBond's existing capability assimilation canon. External plugins remain suppliers, never truth or authority.

### Native desktop control

Windows and macOS backends share one protocol but retain platform-specific helpers.

Strong mechanisms include:

- screenshot frame identity;
- snapshot-scoped semantic UI refs;
- helper generation identity;
- stale-frame/ref fail-closed behavior;
- geometry revalidation;
- serialized physical input;
- partial-batch completion evidence with exact failed index and routes used;
- retiring a broken helper before a successor can execute input.

These mechanisms are valuable for future sovereign computer-use adapters.

### Connection lifecycle

Connection/tunnel state uses generations so stale callbacks cannot mutate a newer connection. Disconnect first closes new MCP admission, drains already accepted calls, then retires dependent processes/tunnels. Final app shutdown can use a bounded drain, while ordinary reconnect/disconnect does not silently drop accepted work.

### Secrets and durable state

`secrets.ts` publishes cache state only after durable encrypted storage succeeds and guards against stale async decrypt resurrecting deleted state. Linux insecure `basic_text` safeStorage fallback is rejected.

`durable.ts` uses temp -> rename and serialized/coalesced generations with explicit immediate barriers. Its own comments correctly state that this is not database-grade fsync/crash consensus.

That epistemic discipline is a donor itself: say exactly what durability proves.

## Evidence quality

The upstream project has unusually serious validation for a desktop agent harness.

The 2.1.14 release validation records 5,058 passing tests with 44 intentional skips plus separate shutdown/native/browser/package checks. Later 2026-09-20 integration worklogs record larger focused/full runs, including 5,809 passed / 47 conditional skips and a separate public candidate with 5,722 passed / 45 skipped.

These are source/runtime fixture evidence. Upstream explicitly refuses to promote them into signed-in provider/account acceptance. UberBond should preserve that distinction.

## Failure and incident ledger

The audit deliberately harvested failures, not only features.

A public-history incident exposed personal Git identity metadata and Claude-session URLs. The corrective stack now includes a privacy verifier, noreply identity enforcement, hooks, CI checks, package checks and publish-time checks. The prevention architecture is useful; the original leak is a warning.

A frozen upstream tool-error audit measured 2,151 calls across 50 tool-using sessions with 195 failed/rejected calls, 9.07%. It later corrected an over-optimistic repair projection because symptom matching had been mistaken for mechanistically proven coverage. This is excellent evidence hygiene.

Current live issues still report failure modes around:
- broad shell policy;
- transient provider/tunnel loss;
- queued messages that can remain stuck;
- recovery that can stall for hours;
- request identity arriving late;
- Core surface discovery/degradation;
- browser pairing;
- model-picker/provider UI drift;
- native input accepted without the expected app effect;
- unsigned/AV/Smart-App-Control distribution friction.

These issue reports are evidence candidates, not universal confirmed defects.

## UberBond donor diff

### HIGH-VALUE MISSING/PARTIAL ORGANS

1. Provider-local session identity decoupled from provider conversation identity.
2. Transactional A -> B conversation rebind.
3. Exact request ID -> conversation -> session epoch join.
4. Browser document/navigation epoch authority.
5. Browser-side durable ACK custody.
6. Semantic send checkpoints with post-dispatch uncertainty quarantine.
7. Per-chat workspace identity and continuation transfer.
8. Sleeping/waking worker conversation lifecycle with durable critical barriers.
9. Local-publication versus remote-receipt distinction.
10. Bounded JavaScript capability composition.
11. Connector-surface schema monotonicity with live permission rechecks.
12. Snapshot/frame/helper-generation desktop authority.
13. Tool/schema byte budgets.
14. Public-history privacy gates across authoring -> CI -> release.

### ALREADY STRONGER OR ALREADY PRESENT IN UBERBOND

Do not duplicate:
- capability versus authority separation;
- recursive revocation and attenuation-only delegation;
- OMNIA consequence gates;
- safe retry/uncertain/quarantine doctrine;
- durable job queues, leases and receipts;
- UberSocket encrypted ChatGPT <-> ChatGPT coordination;
- GitHub proof-carrying cross-agent relay;
- capability graph/assimilation canon;
- repository-native Total Brain, recovery/handoff and no-amputation doctrine;
- deployment/payment/customer/economic truth boundaries.

### REJECT OR ISOLATE

Do not copy as sovereign defaults:
- unrestricted logged-in-user shell once command permission is on;
- broad fresh-install authority defaults;
- provider-private DOM/Fiber assumptions in the core;
- broad browser host/debugger permissions without a mission need;
- unencrypted detailed local conversation history as universal default;
- unsigned distribution assumptions;
- any implication that an app-level approved root is a kernel sandbox;
- any workaround intended to bypass a provider's safety or access restrictions.

## Proposed synthesis

```text
UBERBOND CONSTITUTION / OWNER AUTHORITY
        |
        v
SOVEREIGN COGNITIVE CONTINUUM SESSION KERNEL
  - durable local session identity
  - provider conversation bindings
  - request/session epochs
  - transactional continuation
        |
        +--> PROVIDER ADAPTERS
        |      ChatGPT today; replaceable tomorrow
        |
        +--> CAPABILITY SURFACES
        |      files / code / browser / desktop / plugins
        |
        +--> DURABLE OUTBOX + ACK + UNCERTAINTY LEDGER
        |
        +--> WORKER FAMILY / SLEEP-WAKE LEASES
        |
        +--> UberSocket
        |      encrypted peer coordination
        |
        +--> GitHub/local proof relay
        |      durable task/result receipts
        |
        v
OMNIA EFFECT GATES / REVOCATION / RECONCILIATION
        |
        v
REAL-WORLD ACTION
```

Chat On Steroids should therefore be classified as:

**REFERENCE_ONLY + CLEAN-ROOM MECHANISM DONOR + OPTIONAL PROVIDER-ADAPTER BENCHMARK**

It should not become UberBond's parent architecture, canonical memory, authority layer or mandatory runtime.

## Assimilation order

Recommended implementation order:

1. exact provider request/conversation/session identity primitive;
2. transactional continuation ledger and send checkpoints;
3. browser document/navigation epoch and ACK custody;
4. merge with UberSocket rather than replace it;
5. per-session workspace transfer;
6. worker sleeping/wake durability;
7. bounded code composition surface;
8. plugin-generation/update/rollback semantics;
9. desktop frame/ref/helper generations;
10. privacy/release gates;
11. adversarial tests reproducing upstream failure classes;
12. provider-neutral interfaces so ChatGPT-specific code remains replaceable.

Each phase must benchmark **NO DONOR vs CURRENT UBERBOND vs ASSIMILATED CANDIDATE**, preserve existing capability, and fail promotion if it widens authority without matching evidence.

## Byte-completion gate

Do not change this audit to `BYTE_COMPLETE` until all conditions hold:

1. enumerate the complete upstream Git tree at the pinned commit;
2. record every tracked blob SHA/path/mode;
3. materialize or fetch every blob;
4. independently SHA-256 hash every blob;
5. reconcile submodules/LFS/binary artifacts if any;
6. parse or classify every textual source/config/test/doc/script;
7. inventory every binary/generated/vendor artifact separately;
8. compare the manifest against Git's root tree;
9. store the final manifest/digest in UberBond;
10. rerun the capability diff from the complete corpus.

Until then, the truthful status is **deep forensic tracked-source audit with byte-level closure pending**, not a pretend 100%.
