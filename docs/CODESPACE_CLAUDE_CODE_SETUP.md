# Codespace × Claude Code setup (subscription auth, $0 extra spend)

Status: **source-verified only.** Nothing here was run inside the Codespace by the authoring session (a cloud session has no Codespace access). Verify with the checklist at the bottom.

## Accounts and repositories
| Role | Account | Repository |
|---|---|---|
| Canonical, Claude Code cloud connection | `mohammedwessam2007` | `mohammedwessam2007/uberbondd` |
| Codespace host | `uberbond2007` | `uberbond2007/uberbondd` (public; verified identical `main` at the time of writing) |

The Claude Code cloud connection is bound to the GitHub identity that authorised the Claude GitHub App. A repo owned by `uberbond2007` is invisible to push/PR tooling until that account authorises the app. Public repos are readable without it.

### Owner actions (cannot be done by an agent)
1. **Preferred, no second subscription:** keep `uberbond2007/uberbondd` as a mirror and develop on `mohammedwessam2007/uberbondd`; in the Codespace `git pull` from the canonical remote (`git remote add canonical https://github.com/mohammedwessam2007/uberbondd`).
2. **If Claude cloud must push to the second repo:** log in to GitHub as `uberbond2007`, open https://github.com/apps/claude/installations/select_target, install on `uberbond2007/uberbondd`; then connect that account at https://claude.ai/connect-github (the connection is per-claude.ai-account, so confirm it keeps the existing Pro login).
3. Alternative: add `mohammedwessam2007` as a collaborator on `uberbond2007/uberbondd` so the already-authorised identity can push.

## Claude Code auth in the Codespace
Run `bash scripts/codespace/claude-auth-doctor.sh` (alias `claude-doctor`). It checks API-key overrides, stored credentials, token shape, terminal width, clock skew and reachability, and never prints secrets.

Likely causes of `Invalid OAuth Request` (hypotheses, not reproduced here):
- login URL wrapped by a narrow terminal, truncating `state`/`code_challenge`;
- a second `/login` started, invalidating the first URL; or a stale/old URL or code pasted;
- corrupt or stale `~/.claude/.credentials.json`;
- `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN` in the environment conflicting with subscription login;
- pasted code with trailing whitespace.

Durable fix (recommended): on a machine with a browser run `claude setup-token` using the Pro account, save the token as a **Codespaces user secret** `CLAUDE_CODE_OAUTH_TOKEN` scoped to `uberbond2007/uberbondd` (GitHub → Settings → Codespaces → Secrets). It is a subscription token, not an API key. Never commit it. Rebuild or restart the Codespace.

## Reproducible setup
`.devcontainer/devcontainer.json` (Node 22, gh CLI, `anthropic.claude-code` extension) calls:
- `scripts/codespace/setup.sh` on create: installs the CLI, `npm ci` best-effort, adds a shell guard that unsets paid API keys. Never fails the build.
- `scripts/codespace/start.sh` on every start: reinstalls the CLI if missing, clears stale tunnel pid files, optionally autostarts the supervisor.
- `claude-auth-doctor.sh --brief` on attach.

Apply: `Codespaces → Rebuild Container` (reversible; remove `.devcontainer/` to revert). Heavy artifact/forensics directories are excluded from file watching and search for speed.

## Tunnel recovery
The Chat On Steroids connector is not defined in this repository, so no command is assumed. `scripts/codespace/tunnel-supervisor.sh` wraps whatever you run:
```sh
COS_TUNNEL_CMD='<your connector command>' COS_HEALTH_URL='http://127.0.0.1:<port>/health' \
  nohup bash scripts/codespace/tunnel-supervisor.sh &
```
It restarts on exit or after consecutive failed health probes, with capped exponential backoff plus jitter, a single-instance lock and a rotating log under `~/.local/state/uberbond/`. Set `COS_TUNNEL_AUTOSTART=1` (with `COS_TUNNEL_CMD`) in Codespaces secrets/env to start it on every boot. Also raise **Settings → Codespaces → Default idle timeout** (max 240 min), since an idle stop is the usual cause of a dead tunnel.

## Verification checklist (run inside the Codespace)
```sh
bash scripts/codespace/claude-auth-doctor.sh   # expect RESULT: no local problems
claude -p "reply OK"                            # confirms subscription auth
node --test tests/codespace-scripts.test.mjs    # 8 tests
```
