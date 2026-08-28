# UberBond Chat Import Protocol

## Objective

Turn useful conversation history into durable repository memory so a context-window crash or new model does not reset the company.

## Accepted inputs

- ChatGPT/Claude/Codex exported text or JSON;
- shared-chat content when the current runtime can actually open it;
- uploaded `.txt`, `.md`, `.json`, PDF or ZIP transcripts;
- research packages and mission prompts;
- repository PR/issue discussions containing durable decisions.

A URL by itself is **not** an imported source.

## Ingestion record

For every material source preserve, when available:

- source title;
- source type;
- original date/time range;
- ingestion date;
- content hash when bytes are available;
- evidence/authority class;
- named initiatives mentioned;
- durable goals and doctrines;
- concrete features/capabilities;
- offer/product/partner/distribution ideas;
- decisions and their status;
- contradictions;
- supersedes/superseded-by links;
- unresolved names;
- commercial claims that remain unproven;
- current-repository reconciliation;
- whether raw source bytes are retained elsewhere.

## Promotion rules

Conversation content begins as historical/internal evidence. It may update the project dream or historical lineage, but it does not become present-tense implementation or external commercial truth merely because an assistant said it.

Promote to current canon only when reconciled against current source/evidence. Preserve contradictory versions instead of silently replacing them.

## Anti-amnesia rules

- Do not summarize a thousand-offer history into one current experiment.
- Do not delete superseded program names; preserve what they contributed and what replaced them.
- Do not promote historical generated counts into production proof.
- Do not silently drop owner-recalled names that lack a currently accessible source. Mark them `OWNER_RECALLED_UNRESOLVED`.
- Do not store credentials, private customer data, raw message bodies, private contact data, or other sensitive material in project memory.

## Update targets

A material import should update one or more of:

- `docs/UBERBOND_MASTER_MEMORY.md` for durable human-readable lineage;
- `artifacts/uberbond-memory-index.json` for machine-readable memory;
- `docs/HISTORICAL_PROJECT_LINEAGE.md` for major historical reconciliation;
- `docs/CURRENT_HANDOFF.json` only if the imported source changes the active execution frontier.

Then run the brain-context tests. A memory update that silently deletes a named initiative, breaks the memory digest, introduces secret-like content, or disagrees with canonical product families must fail closed.
