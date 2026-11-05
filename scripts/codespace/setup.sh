#!/usr/bin/env bash
# Codespace one-time setup (onCreateCommand). Idempotent. Never fails container creation.
# Installs Claude Code CLI and deps. Uses NO API key and spends nothing.
set -uo pipefail
log() { printf '[uberbond-setup] %s\n' "$*"; }

# Claude Code CLI (subscription auth happens later via login or CLAUDE_CODE_OAUTH_TOKEN).
if ! command -v claude >/dev/null 2>&1; then
  log "installing @anthropic-ai/claude-code"
  npm install -g @anthropic-ai/claude-code >/dev/null 2>&1 \
    && log "claude $(claude --version 2>/dev/null)" \
    || log "WARN: claude install failed; rerun: npm i -g @anthropic-ai/claude-code"
else
  log "claude present: $(claude --version 2>/dev/null)"
fi

# Project deps only if the lockfile exists; failure must not block the Codespace.
if [ -f package-lock.json ] && [ ! -d node_modules ]; then
  log "npm ci (best effort)"
  npm ci --no-audit --no-fund >/dev/null 2>&1 || log "WARN: npm ci failed; run it manually"
fi

# Guard against accidental paid-API mode: a stray key silently bypasses the subscription.
marker='# uberbond-codespace-claude'
if ! grep -qF "$marker" "$HOME/.bashrc" 2>/dev/null; then
  cat >> "$HOME/.bashrc" <<'RC'

# uberbond-codespace-claude
# Paid API keys override subscription login in Claude Code; keep them out of this shell.
unset ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN
alias claude-doctor='bash "${CODESPACE_VSCODE_FOLDER:-$PWD}/scripts/codespace/claude-auth-doctor.sh"'
RC
fi
log "setup complete"
exit 0
