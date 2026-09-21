# UberAgent v2

Status: PRIVATE, OWNER-CONTROLLED LOCAL WINDOWS AGENT

UberAgent v2 exists to let the founder operate a personally owned Windows compute node from the ChatGPT/Supabase control plane without exposing a universal remote shell.

## Architecture

ChatGPT -> connected Supabase project -> private command table -> authenticated Edge Function -> HP UberAgent -> allow-listed action -> receipt -> Supabase -> ChatGPT

The public UberBond repository stores only source code. It does not store the node token or machine-control queue.

## Node authentication

The HP receives one random high-entropy node token at bootstrap.

- Supabase stores only SHA-256(token).
- The HP stores the token encrypted with Windows DPAPI under the installing Windows user.
- The Edge Function compares the supplied token hash to the registered node.
- The node can be disabled centrally by setting uberworm_nodes.enabled=false.
- The local kill switch always wins.

No Supabase secret/service-role key is ever written to the HP.

## Remote action membrane

Allowed v2 actions:

- ping
- inventory
- ollama_status
- repo_status
- repo_sync_main
- pull_model
- benchmark
- local_prompt
- disable_agent

There is intentionally no shell, PowerShell, cmd, arbitrary executable, arbitrary file read/write, browser credential access, cookie access, password extraction, remote desktop password configuration, mains control, breaker control, meter modification, firmware tuning, voltage tuning, fan-curve tuning or Windows power-plan tuning action.

Model pulls are restricted to the explicit approved-model set.

Repo sync refuses a dirty working tree and uses fast-forward-only main updates.

Local prompts are bounded in input and output size.

## Control-plane security

The previous GitHub Issue transport was retired because the UberBond repository is public.

The Supabase control plane uses:

- RLS-enabled tables;
- anon/authenticated grants revoked;
- service-role-only table access;
- a custom-auth Edge Function;
- node-scoped token authentication;
- command expiry bounded to six hours;
- typed action checks at the database layer;
- one final receipt per command;
- explicit command status transitions.

The HP never calls the Data API tables directly.

## Physical safety boundary

UberAgent manages software workloads, not household mains.

It cannot operate the utility meter, breaker panel, fixed wiring, AC compressor circuits or other household electrical switching.

Compute power/thermal policy remains owned by UberWatt MAX SAFE TOKENS and requires real measurement before aggressive sustained workloads are admitted.

## Owner experience

Bootstrap is designed to be one-time:

1. Extract the private founder bootstrap ZIP on the HP.
2. Double-click the installer.
3. Approve normal Windows installer prompts when required.
4. After UberAgent reports online, routine operation can be commanded through ChatGPT.

A local disable shortcut is included in the bootstrap package.

## Optional visual access

A separate remote-desktop product such as RustDesk may be installed for the founder to visually control the HP from an iPad. That is not UberAgent's command authority and is not required for ChatGPT-triggered typed actions.

RustDesk credentials or unattended-access passwords must never be committed to UberBond or placed in the UberAgent command queue.
