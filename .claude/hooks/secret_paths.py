"""Environment-file path detection for secret_guard.

Why this exists as its own module: the previous detector was a single regex
applied to the JSON blob of the tool input. It required the match to be preceded
by a slash or the very start of the string, so an absolute-path Read of an
environment file was blocked while an ordinary relative shell command was not.
Reading the file by its bare relative name slipped straight through.

The fix is not a longer regex. It is to stop matching substrings and start
classifying *path tokens*: find candidate paths, reduce each to its basename,
and decide on the basename. Every rule below is a pure function of a string, so
it is directly testable without running a hook.

Scope and honesty about limits:

* ``shlex`` is used as a best-effort shell lexer. This is **not** a complete
  shell parser — it does not evaluate variables, command substitution, globs,
  aliases, encodings, or here-documents, and a determined author can defeat it.
* Because of that, the regex scan always runs too, and the two results are
  unioned. A lexer quirk therefore cannot create a bypass; it can only fail to
  add a finding the regex already caught.
* When a command cannot be lexed and an environment-file path still appears
  anywhere in the text, the input is treated as ambiguous and **blocked**. The
  safe direction under ambiguity is to refuse.
"""

import re
import shlex

# A basename is an environment file when it is `.env` or `.env` plus a suffix.
# This is anchored to the *basename*, so `config.env` (no leading dot) and
# `.envrc` (no dot before the suffix) are not environment files by this rule.
ENV_BASENAME_RE = re.compile(r"^\.env(?:\.(?P<suffix>.+))?$", re.IGNORECASE)

# Deliberately public, committed templates. These carry placeholder values by
# convention and repository policy permits reading them.
PUBLIC_TEMPLATE_SUFFIXES = frozenset({
    "example", "sample", "template", "dist", "defaults",
})

# Characters that end a path token in a shell command: whitespace, quotes, and
# the separators/redirections that make `cat X;` or `cat X|head` work.
_TOKEN_STOP = r"\s'\"`;|&<>()\[\]{},"

# A candidate path is any run of non-separator characters ending in an
# environment-file-looking segment. The trailing lookahead stops `notes.env` in
# `notes.environment` from matching, which would otherwise block an innocent file.
CANDIDATE_RE = re.compile(
    r"[^" + _TOKEN_STOP + r"]*\.env(?:\.[A-Za-z0-9_-]+)*(?![A-Za-z0-9_-])",
    re.IGNORECASE,
)

# Cheap pre-check used only to decide whether an unlexable command is ambiguous.
# Written with a character class so this module's own source does not contain the
# literal byte sequence it is looking for.
_MENTIONS_ENV_RE = re.compile(r"[.]env", re.IGNORECASE)

BLOCKED = "BLOCKED"
PUBLIC_TEMPLATE = "PUBLIC_TEMPLATE"
NOT_AN_ENV_FILE = None


def basename(path):
    """Last path segment, treating both separators, with quotes stripped.

    A parent-directory hop reduces away: only the final segment decides what the
    file is, so `config/../<envfile>` classifies exactly like `<envfile>`.
    """
    cleaned = path.strip().strip("'\"`")
    for separator in ("\\", "/"):
        cleaned = cleaned.rsplit(separator, 1)[-1]
    return cleaned


def classify(path):
    """Classify one path string as BLOCKED, PUBLIC_TEMPLATE, or None."""
    match = ENV_BASENAME_RE.match(basename(path))
    if not match:
        return NOT_AN_ENV_FILE
    suffix = match.group("suffix")
    if suffix and suffix.lower() in PUBLIC_TEMPLATE_SUFFIXES:
        return PUBLIC_TEMPLATE
    return BLOCKED


def iter_strings(node):
    """Yield every string leaf of a tool_input structure."""
    if isinstance(node, str):
        yield node
    elif isinstance(node, dict):
        for value in node.values():
            for item in iter_strings(value):
                yield item
    elif isinstance(node, (list, tuple)):
        for value in node:
            for item in iter_strings(value):
                yield item


def shell_tokens(command):
    """Best-effort shell tokens, or None when the command cannot be lexed."""
    try:
        return shlex.split(command, posix=True)
    except ValueError:
        return None


def candidates(text):
    """Regex-found candidate paths. Always runs, even when lexing succeeded."""
    return [m.group(0) for m in CANDIDATE_RE.finditer(text)]


def scan(tool_input):
    """Return (blocked, allowed, ambiguous) for one tool_input structure.

    `blocked` holds environment-file paths that must not be read.
    `allowed` holds public template paths that were recognized and permitted.
    `ambiguous` is True when a command could not be lexed yet still mentions an
    environment file, which is itself a reason to refuse.
    """
    blocked, allowed = [], []
    ambiguous = False

    for text in iter_strings(tool_input):
        found = list(candidates(text))

        tokens = shell_tokens(text)
        if tokens is None:
            # Unlexable. If it still talks about an environment file at all we
            # cannot reason about it, so fail safe rather than guess.
            if _MENTIONS_ENV_RE.search(text) and not found:
                ambiguous = True
        else:
            found.extend(tokens)

        for candidate in found:
            verdict = classify(candidate)
            if verdict is BLOCKED:
                if candidate not in blocked:
                    blocked.append(candidate)
            elif verdict == PUBLIC_TEMPLATE:
                if candidate not in allowed:
                    allowed.append(candidate)

    return blocked, allowed, ambiguous
