# UberBond Cross-Chat Continuity

## Problem

A conversation window is transient. UberBond is not.

Long chats can end, shared-chat URLs may be unavailable to a later runtime, and different coding agents may receive different conversational context. Therefore chat memory cannot be the only place where the project mission, frontier, or truth hierarchy lives.

## Repository-native brain

UberBond continuity is anchored in five layers:

1. `AGENTS.md` — startup and engineering law for repo-aware agents.
2. `UBERBOND_CANON.md` — durable product/constitutional doctrine.
3. `UBERBOND_BOOTSTRAP.json` — machine-readable mission, pointers, goals, truth hierarchy and external proof gates.
4. `docs/CURRENT_HANDOFF.json` — current mission/frontier, verified completion, blockers and next actions.
5. `src/uberbond-brain-context.mjs` — fail-closed compiler that validates and digests the machine-readable context.

Current readiness files and live GitHub state remain separate sources of present-tense truth. A stale handoff never outranks a newer merged commit or durable provider/customer receipt.

## Fresh-session procedure

A new UberBond session should:

`refresh main -> AGENTS.md -> UBERBOND_CANON.md -> UBERBOND_BOOTSTRAP.json -> CURRENT_HANDOFF -> current readiness -> open/recent PRs -> requested mission -> dedupe -> execute`

If the user says only `continue` or `go`, the session should execute that recovery sequence instead of asking for a project retelling.

## Handoff update law

A material mission should leave a handoff containing:

- last known source basis;
- active mission;
- verified completion;
- blockers and contradictions;
- external-proof gates;
- next highest-value actions;
- an exact zero-effect statement when no external effects occurred.

Do not put secrets, raw customer payloads, private contact data, transcripts, credentials, or speculative revenue into the handoff.

## What this solves

This makes continuity durable for any worker that can read the repository. The mission no longer depends on one huge chat staying alive.

## Product limitation

This repository cannot force the ChatGPT Project user interface to inject these files into every brand-new conversation. If a new chat does not have repository/file access, no source file can magically appear inside its context. In that product situation, the project configuration or the user must expose the canon/bootstrap to the chat.

That limitation does **not** make the repository state disposable. Any repo-aware coding session should recover automatically from the files above, and any human-readable handoff can be pasted or attached without reconstructing hundreds of prior turns.

## Truth rule

Repository continuity preserves context; it does not promote claims.

Real customer demand, provider state, cleared money, accepted delivery, renewal, legal/tax conclusions, and unattended production duration remain external evidence even if the brain remembers every architectural goal perfectly.
