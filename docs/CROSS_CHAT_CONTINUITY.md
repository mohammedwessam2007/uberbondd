# UberBond Cross-Chat Continuity

## Problem

A conversation window is transient. UberBond is not.

Long chats can end, shared-chat URLs may be unavailable to a later runtime, coding agents may compact context, and different models may receive different conversation history. Therefore chat memory cannot be the only place where the company dream, named programs, portfolio breadth, current frontier, or truth hierarchy lives.

## Repository-native brain

UberBond continuity is anchored in eight layers:

1. `AGENTS.md` — startup and engineering law for repo-aware agents.
2. `UBERBOND_CANON.md` — durable product/constitutional doctrine.
3. `UBERBOND_BOOTSTRAP.json` — machine-readable mission, pointers, goals, truth hierarchy, memory locations and external-proof gates.
4. `docs/UBERBOND_MASTER_MEMORY.md` — human-readable final goal, program lineage, portfolio ladders and anti-forgetting law.
5. `artifacts/uberbond-memory-index.json` — machine-readable named initiatives, historical snapshots, recurring/platform ladders, unresolved names and source basis.
6. `docs/CURRENT_HANDOFF.json` — the short-horizon current mission/frontier, verified completion, blockers and next actions.
7. current readiness/state files — present-tense measured software truth.
8. `src/uberbond-brain-context.mjs` — fail-closed compiler that validates/digests bootstrap + Master Memory index into a context identity.

The current repository and durable external receipts remain separate sources of present-tense truth. A stale handoff or rich historical memory never outranks a newer merged commit or provider/customer receipt.

## Fresh-session procedure

A new UberBond session should execute:

`refresh main -> AGENTS -> CANON -> BOOTSTRAP -> MASTER_MEMORY -> MEMORY_INDEX -> every canonPointer -> CURRENT_HANDOFF -> current readiness -> open/recent PRs -> requested mission -> dedupe -> execute`

If the user says only `continue` or `go`, the session should execute that recovery sequence instead of asking for a project retelling.

## Why Master Memory is separate from Current Handoff

The handoff should be small enough to change after every mission. The Master Memory should be stable enough to remember years of company lineage. Mixing them caused a recurring failure mode: a new chat saw the latest repair or latest offer and assumed that was the entire company.

The memory therefore preserves superseded programs with a status and reconciliation note rather than deleting them. It also preserves `OWNER_RECALLED_UNRESOLVED` names such as Everest until a source is found or the owner explicitly retires the name.

## Handoff update law

A material mission should leave a handoff containing:

- source `main` basis;
- active branch/PR when applicable;
- active mission;
- verified completion;
- blockers and contradictions;
- external-proof gates;
- unresolved historical names when they affect the mission;
- next highest-value actions;
- an exact zero-effect statement when no external effects occurred.

Do not put secrets, raw customer payloads, private contact data, transcripts, credentials, or speculative revenue into the handoff.

## Chat import

Use `docs/memory/CHAT_IMPORT_PROTOCOL.md`. The durable unit is a source digest/summary with provenance and contradiction handling, not the external URL. If the runtime can access a share/export, ingest it. If it cannot, record the inaccessible source and wait for an export/upload rather than fabricating contents.

## Product limitation

The repository cannot force every ChatGPT user-interface conversation to attach GitHub automatically. A source file cannot magically appear in a session with no repository/file access. What the repository can do is make every repo-aware Claude Code/Codex/ChatGPT session self-bootstrapping, and make the minimal fallback instruction simply: **open the UberBond repo and read AGENTS.md**.

## Truth rule

Repository continuity preserves context; it does not promote claims. Real customer demand, provider state, cleared money, accepted delivery, renewal, legal/tax conclusions, and unattended production duration remain external evidence even if the brain remembers every architectural goal perfectly.
