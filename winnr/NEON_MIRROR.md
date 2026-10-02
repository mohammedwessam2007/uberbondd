# Neon Mirror Boundary

Updated: 2026-10-02

Neon is installed/connected in ChatGPT, but that fact alone does not establish that Neon is UberBond's current production store.

Current live Render worker evidence reports PostgreSQL. Existing Winnr canon states historical UberBond setup includes Neon, while current production database identity was previously established separately. Do not relabel a Neon write as production evidence unless the live database identity is reconciled first.

During this checkpoint the available Neon connector was unscoped and required an explicit `project_id`. The exposed function set did not provide a project-list action. No project ID was guessed and no database write was attempted.

## When project identity is recovered

Use Neon as a sanitized evidence/index mirror unless live runtime evidence proves it is the production store.

Safe mirror fields:
- subsystem
- evidence_id
- evidence_type
- status
- observed_at
- source_pointer
- sanitized_payload
- supersedes
- contradiction_group
- verified_by
- created_at

Never mirror:
- mailbox passwords
- raw credential CSV
- Winnr API tokens
- Render admin token
- TOKEN_ENCRYPTION_KEY
- tunnel bearer tokens
- OAuth secrets
- card data
- private keys

GitHub `winnr/` remains the current human-readable canonical recovery root.
