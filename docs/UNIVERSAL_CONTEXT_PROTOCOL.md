# UberBond Universal Context Protocol

## Goal

Make a fresh ChatGPT conversation or any repository-aware AI recover **the whole UberBond organism without founder retelling**, while avoiding the impossible and harmful strategy of loading the entire corpus into every prompt.

The invariant is:

> resident context is small; retrievable context is complete; provenance is preserved; no useful lineage is amputated.

## Context pyramid

### L0 — constitutional kernel

Always resident before mission selection:

- `AI_START_HERE.md`
- `AGENTS.md`
- `NORTH_STAR.md`
- terminal Sovereign Cognitive Continuum canon
- `UBERBOND_CANON.md`
- `UBERBOND_BOOTSTRAP.json`
- `docs/UBERBOND_TOTAL_BRAIN.md`
- `docs/UBERBOND_MASTER_MEMORY.md`
- `artifacts/uberbond-memory-index.json`
- Perpetual Frontier / GENESIS canon

This layer defines identity, no-amputation, truth precedence, authority, and the terminal North Star.

### L1 — current truth

Always refresh rather than remember:

- exact `main` SHA;
- `docs/CURRENT_HANDOFF.json`;
- `docs/CURRENT_SYSTEM_STATE.md`;
- readiness artifacts;
- open/recent PRs and branches;
- active issues relevant to the mission;
- current runtime/provider receipts when applicable.

A stale memory packet cannot override this layer.

### L2 — total discoverability index

Run `node scripts/context-universe.mjs` to enumerate every tracked path, byte size, SHA-256 digest, broad role, and mission relevance score. This makes every tracked byte-addressable source discoverable without putting all source contents into one context window.

The index is generated from the live checkout, not treated as a long-lived truth artifact. That avoids a stale manifest becoming another context fossil.

### L3 — mission hydration

Given the founder's actual request, retrieve the highest-ranked relevant files from L2 plus mandatory L0/L1 files. Expand outward along imports, references, source-basis pointers, supersession links, and named-initiative links until the mission has enough evidence to act without narrowing away adjacent organs.

Hydration must include contradictory/historical donors when they materially explain why the current design exists.

### L4 — external reality

Repository memory cannot prove external state. When the mission depends on reality, retrieve the relevant provider/customer/payment/runtime evidence from connected tools or durable receipts.

Examples: provider state, customer replies, PayPal settlement, deployment health, DNS, email sends, accepted delivery, runtime duration.

### L5 — deep archive / historical corpus

Historical ZIPs, old handoffs, chats, File Library packages, reports and prior provider-era systems are donor memory. They are retained for lineage and resurrection, but current exact source and external evidence outrank them for present-tense claims.

## Fresh-session algorithm

1. Determine whether the request concerns UberBond.
2. Refresh `main`.
3. Read L0.
4. Read L1.
5. Run `node scripts/context-universe.mjs --mission "<request>"` when shell access exists.
6. Hydrate the returned mission-relevant paths.
7. Search named initiatives and source-basis records before concluding something never existed.
8. Reconcile historical claims against current source and external evidence.
9. Only then select or execute the mission.
10. After material work, update current handoff/wormhole/memory only when the repository laws say the change is durable enough.

## ChatGPT rule

ChatGPT memory and Project memory are accelerators, not the sole source of truth. A fresh ChatGPT session should use project memory to recover intent, then use the repository continuity stack for exactness when repository access is available.

A ChatGPT conversation outside the UberBond Project cannot be guaranteed to have all project source automatically loaded. Global Custom Instructions should therefore contain a short UberBond bootstrap law directing any UberBond-related chat to the canonical repo entrypoint rather than asking the founder to retell the project.

## Other-AI rule

Different tools auto-read different convention files. UberBond therefore uses small compatibility shims that all point back to the same canonical startup law rather than maintaining divergent copies of the project brain.

The authoritative logic remains `AGENTS.md` + canonical repository memory. Agent-specific instruction files are pointers, not independent canon.

## Context-window law

Do not equate "knows everything" with "all bytes are resident simultaneously". For a corpus larger than any context window, correct total context means:

- every source is indexed and retrievable;
- the constitutional kernel is resident;
- current truth is refreshed;
- relevant evidence is hydrated before decisions;
- source identity/digests make omissions detectable;
- no historical program is silently erased because it was not loaded for the current mission.

This is lossless virtual context, not lossy prompt stuffing.

## Anti-reset tests

A fresh session fails continuity if it does any of the following:

- calls UberBond only the latest commercial offer;
- calls the Personal Civilization Engine the terminal project identity;
- treats Vercel, Supabase, Hatchable, PayPal, GitHub, or any other supplier as UberBond itself;
- restarts architecture already represented on current `main`;
- asks the founder to retell context before attempting repository recovery;
- treats an old root launch document as present-tense authority over newer canon/source;
- declares a named program absent without searching Total Brain, memory index, historical lineage and current source;
- turns simulation/internal tests into external proof;
- silently drops an older purpose when a newer mechanism supersedes it.

## One-command discovery

```bash
node scripts/context-universe.mjs --mission "what I am about to do"
```

Use `--all` when a complete tracked-file manifest is needed. Use `--json` for machine-readable output.
