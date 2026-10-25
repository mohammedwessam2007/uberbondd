#!/usr/bin/env sh
# Optional launcher. Checks known billing hazards, DOES NOT prove the account is on Pro/Max.
set -eu
for key in ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN ANTHROPIC_BASE_URL \
 CLAUDE_CODE_USE_BEDROCK CLAUDE_CODE_USE_VERTEX CLAUDE_CODE_USE_FOUNDRY \
 AWS_ACCESS_KEY_ID AWS_BEARER_TOKEN_BEDROCK GOOGLE_APPLICATION_CREDENTIALS \
 ANTHROPIC_FOUNDRY_API_KEY CLAUDE_CODE_SUBAGENT_MODEL; do
  if printenv "$key" >/dev/null 2>&1; then
    printf 'BLOCKED: billing/model override environment variable %s is set. No values shown.\n' "$key" >&2
    exit 2
  fi
done
if ! command -v claude >/dev/null 2>&1; then
  echo 'BLOCKED: Claude Code CLI unavailable. No provider call attempted.' >&2
  exit 3
fi
cat <<'TXT'
Preflight passed for known environment overrides only.
Before requesting inference: verify /status shows YOUR Claude subscription,
/usage shows available included allowance, and paid extra credits are DISABLED.
Never opt into API/usage-credit billing. The launcher cannot verify account state.
TXT
exec claude --model opus "$@"