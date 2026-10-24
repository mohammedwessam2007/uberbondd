#!/usr/bin/env bash
# Diagnose Claude Code subscription auth in a Codespace. Read-only unless --fix.
# Never prints secret values; reports only presence and length.
#   --brief   one-line status (used by postAttachCommand)
#   --fix     back up and remove stale local credentials, then print login steps
set -uo pipefail
BRIEF=0; FIX=0
for a in "$@"; do case "$a" in --brief) BRIEF=1;; --fix) FIX=1;; esac; done

H="${HOME:-/root}"
issues=(); notes=()
issue() { issues+=("$1"); }
note()  { notes+=("$1"); }

if ! command -v claude >/dev/null 2>&1; then
  issue "claude CLI missing -> bash scripts/codespace/setup.sh"
else
  note "claude version: $(claude --version 2>/dev/null | head -1)"
fi

# 1. Env vars that override or break subscription login.
for v in ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN ANTHROPIC_BASE_URL CLAUDE_CODE_USE_BEDROCK CLAUDE_CODE_USE_VERTEX; do
  [ -n "${!v:-}" ] && issue "$v is set; it overrides subscription auth (paid API path). Run: unset $v"
done
if [ -n "${CLAUDE_CODE_OAUTH_TOKEN:-}" ]; then
  len=${#CLAUDE_CODE_OAUTH_TOKEN}
  note "CLAUDE_CODE_OAUTH_TOKEN present (length $len)"
  case "$CLAUDE_CODE_OAUTH_TOKEN" in
    *[[:space:]]*) issue "CLAUDE_CODE_OAUTH_TOKEN contains whitespace/newline; re-save the secret without trailing characters";;
  esac
  [ "$len" -lt 40 ] && issue "CLAUDE_CODE_OAUTH_TOKEN looks truncated (length $len)"
fi

# 2. Stored credentials.
cred="$H/.claude/.credentials.json"
if [ -f "$cred" ]; then
  note "stored login: $cred ($(wc -c <"$cred") bytes, mode $(stat -c %a "$cred" 2>/dev/null))"
  if command -v node >/dev/null 2>&1; then
    st=$(node -e '
      try { const o=(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).claudeAiOauth)||{};
        console.log(!o.accessToken&&!o.refreshToken?"EMPTY":(o.expiresAt&&o.expiresAt<Date.now()?"EXPIRED":"OK"));
      } catch { console.log("CORRUPT"); }' "$cred" 2>/dev/null)
    case "$st" in
      CORRUPT|EMPTY) issue "$cred is $st; run with --fix to back it up, then log in again";;
      EXPIRED) note "access token past expiry (normal when a refresh token exists)";;
    esac
  fi
else
  [ -z "${CLAUDE_CODE_OAUTH_TOKEN:-}" ] && issue "no stored login and no CLAUDE_CODE_OAUTH_TOKEN -> authentication required"
fi

# 3. Terminal width: a wrapped login URL is a leading cause of "Invalid OAuth Request".
cols=$(tput cols 2>/dev/null || echo "${COLUMNS:-0}")
if [ "${cols:-0}" -gt 0 ] && [ "$cols" -lt 200 ]; then
  note "terminal is $cols columns; login URLs are ~300 chars. Use the VS Code web terminal 'copy link' or run: stty cols 400"
fi

# 4. Clock skew (OAuth state/token validation is time sensitive).
if command -v curl >/dev/null 2>&1; then
  hdr=$(curl -sI --max-time 8 https://claude.ai 2>/dev/null | tr -d '\r' | awk -F': ' 'tolower($1)=="date"{print $2}')
  if [ -n "$hdr" ]; then
    srv=$(date -d "$hdr" +%s 2>/dev/null || echo 0); loc=$(date +%s)
    skew=$(( loc - srv )); [ "${skew#-}" -gt 120 ] && issue "clock skew vs claude.ai is ${skew}s (>120s)"
  else
    issue "cannot reach https://claude.ai (network/proxy). Check the Codespace network policy"
  fi
  code=$(curl -s -o /dev/null --max-time 8 -w '%{http_code}' https://api.anthropic.com 2>/dev/null)
  [ "$code" = "000" ] && issue "cannot reach api.anthropic.com"
fi

# 5. Browser opener: a missing/odd BROWSER makes the CLI print a URL whose callback port isn't forwarded.
[ -n "${BROWSER:-}" ] && note "BROWSER=$BROWSER"

if [ "$FIX" = 1 ]; then
  ts=$(date +%Y%m%d-%H%M%S); bk="$H/.claude-backup-$ts"
  if [ -f "$cred" ] || [ -f "$H/.claude.json" ]; then
    mkdir -p "$bk" && chmod 700 "$bk"
    [ -f "$cred" ] && mv "$cred" "$bk/.credentials.json"
    [ -f "$H/.claude.json" ] && cp "$H/.claude.json" "$bk/.claude.json"
    note "moved stale credentials to $bk (not deleted)"
  fi
fi

if [ "$BRIEF" = 1 ]; then
  if [ ${#issues[@]} -eq 0 ]; then echo "[claude-doctor] OK"; else echo "[claude-doctor] ${#issues[@]} issue(s): run 'bash scripts/codespace/claude-auth-doctor.sh'"; fi
  exit 0
fi

echo "== Claude Code auth doctor =="
for n in "${notes[@]:-}"; do [ -n "$n" ] && echo "  • $n"; done
if [ ${#issues[@]} -eq 0 ]; then echo "RESULT: no local problems detected"; else
  echo "ISSUES:"; for i in "${issues[@]}"; do echo "  ✗ $i"; done; fi
cat <<'TXT'

Recommended path (no API key, no extra spend):
  A) Durable: on any machine with a browser run `claude setup-token`, then save the printed
     token as a Codespaces *user secret* named CLAUDE_CODE_OAUTH_TOKEN, repository access
     uberbond2007/uberbondd. Rebuild/restart the Codespace. No login is needed again.
  B) Interactive: run `claude` then `/login`; open the URL ONCE in a desktop browser, paste the
     returned code immediately. Starting a second /login invalidates the first URL.
  If B fails with "Invalid OAuth Request": run this script with --fix, widen the terminal, retry once.
TXT
exit $(( ${#issues[@]} > 0 ? 1 : 0 ))
