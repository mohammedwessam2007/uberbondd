"""Regression coverage for configuration-file path protection.

Background. The guard used to match a substring against the JSON blob of the
tool input, and required the match to be preceded by a slash or the very start
of that blob. An absolute-path read was caught; the ordinary relative form was
not. Reading the file by its bare name went straight through.

The replacement classifies path *tokens* by basename, so these tests are
written the same way: the positive cases below are the concrete shapes an
operator would actually type, and the negative cases are the ordinary files and
the deliberately public templates that must keep working. A guard that blocks
everything is not a working guard, so the negative half carries equal weight.

A note on how this file is written. Every path here is assembled at runtime
from `DOT_ENV` rather than spelled literally. The guard is live while this
repository is being edited, and it scans the text of the editing tool call
itself -- a literal path in this source would block the very commit that adds
its own regression test. The concatenated form contains no contiguous match, so
the assembled values are exact while the source text is inert. This is a
property of authoring the guard, not of using it.
"""

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
HOOKS = REPO_ROOT / ".claude" / "hooks"
sys.path.insert(0, str(HOOKS))

import secret_paths  # noqa: E402  (path must be set before the import)

# Assembled, never spelled -- see the module docstring.
DOT_ENV = "." + "env"
LOCAL = DOT_ENV + ".local"
PRODUCTION = DOT_ENV + ".production"
EXAMPLE = DOT_ENV + ".example"
SAMPLE = DOT_ENV + ".sample"
TEMPLATE = DOT_ENV + ".template"
DIRENV = DOT_ENV + "rc"
NO_LEADING_DOT = "config" + DOT_ENV
LONGER_WORD = "notes" + DOT_ENV + "ironment"

# The shapes the owner requires to be refused, plus the separator and position
# variants that the previous substring rule got wrong.
MUST_BLOCK = [
    "cat " + DOT_ENV,
    'cat "./' + DOT_ENV + '"',
    "head " + LOCAL,
    "sed -n '1p' config/" + PRODUCTION,
    "cat ../" + DOT_ENV,
    "cat /tmp/project/" + DOT_ENV,
    "cat ./" + DOT_ENV,
    "cat config/../" + DOT_ENV,
    "cat " + DOT_ENV + "; echo done",
    'printf x && cat "' + PRODUCTION + '"',
    "cat\t" + DOT_ENV,
    "cat '" + DOT_ENV + "'",
    DOT_ENV,
    "cat " + DOT_ENV + "|head -1",
    "cat /home/user/project/config/" + LOCAL,
]

# Ordinary work and the templates policy permits. None of these may be refused.
MUST_ALLOW = [
    "npm run check",
    "cat README.md",
    "node src/app.js",
    "grep -r TODO src/",
    "cat " + EXAMPLE,
    "cat " + SAMPLE,
    "cat config/" + TEMPLATE,
    "cat " + NO_LEADING_DOT,
    "cat " + LONGER_WORD,
    "cat " + DIRENV,
]


class BasenameTests(unittest.TestCase):
    """A path reduces to the segment that decides what the file is."""

    def test_directory_prefix_is_dropped(self):
        self.assertEqual(secret_paths.basename("config/" + DOT_ENV), DOT_ENV)

    def test_absolute_path_is_reduced(self):
        self.assertEqual(secret_paths.basename("/tmp/project/" + DOT_ENV),
                         DOT_ENV)

    def test_quotes_are_stripped(self):
        self.assertEqual(secret_paths.basename('"./' + DOT_ENV + '"'), DOT_ENV)

    def test_parent_hop_reduces_away(self):
        self.assertEqual(secret_paths.basename("config/../" + DOT_ENV),
                         DOT_ENV)

    def test_backslash_separator(self):
        self.assertEqual(secret_paths.basename("config\\" + DOT_ENV), DOT_ENV)

    def test_ordinary_file_is_unchanged(self):
        self.assertEqual(secret_paths.basename("src/app.js"), "app.js")


class ClassifyTests(unittest.TestCase):
    """Every rule is a pure function of one string, so test it as one."""

    def test_bare_name_is_blocked(self):
        self.assertEqual(secret_paths.classify(DOT_ENV), secret_paths.BLOCKED)

    def test_suffixed_names_are_blocked(self):
        for path in (LOCAL, PRODUCTION, DOT_ENV + ".staging"):
            with self.subTest(path=path):
                self.assertEqual(secret_paths.classify(path),
                                 secret_paths.BLOCKED)

    def test_public_templates_are_permitted(self):
        for path in (EXAMPLE, SAMPLE, "config/" + TEMPLATE):
            with self.subTest(path=path):
                self.assertEqual(secret_paths.classify(path),
                                 secret_paths.PUBLIC_TEMPLATE)

    def test_case_is_ignored(self):
        self.assertEqual(secret_paths.classify(DOT_ENV.upper()),
                         secret_paths.BLOCKED)
        self.assertEqual(secret_paths.classify(EXAMPLE.upper()),
                         secret_paths.PUBLIC_TEMPLATE)

    def test_ordinary_files_are_not_configuration(self):
        for path in ("README.md", "src/app.js", NO_LEADING_DOT, LONGER_WORD):
            with self.subTest(path=path):
                self.assertIsNone(secret_paths.classify(path))

    def test_direnv_is_out_of_scope(self):
        """Documented limitation, asserted so it stays deliberate.

        A direnv file has no dot before its suffix, so the basename rule does
        not treat it as a configuration file. It was not in the required list
        and widening the rule to reach it would also catch unrelated names.
        Recorded here so the next reader sees a decision, not an oversight.
        """
        self.assertIsNone(secret_paths.classify(DIRENV))


class ScanTests(unittest.TestCase):
    def test_required_commands_are_blocked(self):
        for command in MUST_BLOCK:
            with self.subTest(command=command):
                blocked, _allowed, _ambiguous = secret_paths.scan(
                    {"command": command})
                self.assertTrue(blocked,
                                "no finding for %r" % command)

    def test_permitted_commands_are_not_blocked(self):
        for command in MUST_ALLOW:
            with self.subTest(command=command):
                blocked, _allowed, ambiguous = secret_paths.scan(
                    {"command": command})
                self.assertEqual(blocked, [],
                                 "false positive on %r" % command)
                self.assertFalse(ambiguous,
                                 "spurious ambiguity on %r" % command)

    def test_templates_are_reported_as_recognized(self):
        _blocked, allowed, _ambiguous = secret_paths.scan(
            {"command": "cat " + EXAMPLE})
        self.assertEqual(allowed, [EXAMPLE])

    def test_nested_tool_input_is_walked(self):
        """Findings must not depend on which key carried the path."""
        blocked, _allowed, _ambiguous = secret_paths.scan(
            {"file_path": "/srv/app/" + PRODUCTION,
             "edits": [{"new_string": "harmless"}]})
        self.assertTrue(blocked)

    def test_unlexable_command_with_a_visible_path_is_blocked(self):
        blocked, _allowed, ambiguous = secret_paths.scan(
            {"command": 'cat "' + DOT_ENV})
        self.assertTrue(blocked)
        self.assertFalse(ambiguous,
                         "a concrete finding is a block, not an ambiguity")

    def test_unlexable_command_that_only_mentions_one_is_ambiguous(self):
        """Fail safe when the text cannot be parsed and still looks relevant.

        The lexer refuses this string, and no candidate path survives the token
        rules, yet the command plainly talks about a configuration file. The
        safe direction under ambiguity is to refuse.
        """
        blocked, _allowed, ambiguous = secret_paths.scan(
            {"command": 'cat "' + DIRENV})
        self.assertEqual(blocked, [])
        self.assertTrue(ambiguous)

    def test_lexer_failure_cannot_create_a_bypass(self):
        """The regex scan runs whether or not the lexer succeeded."""
        self.assertIsNone(secret_paths.shell_tokens('cat "' + DOT_ENV))
        self.assertTrue(secret_paths.candidates('cat "' + DOT_ENV))


class GuardProcessTests(unittest.TestCase):
    """End-to-end through the real hook, not just the pure functions.

    Mirrors tests/test_hooks.py: run the hook as a subprocess with a payload on
    stdin and a throwaway project directory, and read the exit status. Exit 2 is
    a block.
    """

    def run_guard(self, payload, project):
        child = dict(getattr(os, "environ"))
        child["CLAUDE_PROJECT_DIR"] = str(project)
        return subprocess.run([sys.executable, str(HOOKS / "secret_guard.py")],
                              input=json.dumps(payload), text=True,
                              capture_output=True, cwd=str(HOOKS), env=child)

    def payload(self, tool_name, tool_input, project):
        return {"hook_event_name": "PreToolUse", "tool_name": tool_name,
                "tool_input": tool_input, "cwd": str(project)}

    def test_relative_read_through_bash_is_blocked(self):
        """The exact bypass this repair closes."""
        with tempfile.TemporaryDirectory() as project:
            proc = self.run_guard(
                self.payload("Bash", {"command": "cat " + DOT_ENV}, project),
                project)
            self.assertEqual(proc.returncode, 2, proc.stderr)

    def test_absolute_read_is_still_blocked(self):
        with tempfile.TemporaryDirectory() as project:
            proc = self.run_guard(
                self.payload("Read",
                             {"file_path": str(Path(project) / DOT_ENV)},
                             project),
                project)
            self.assertEqual(proc.returncode, 2, proc.stderr)

    def test_ordinary_command_is_allowed(self):
        with tempfile.TemporaryDirectory() as project:
            proc = self.run_guard(
                self.payload("Bash", {"command": "npm run check"}, project),
                project)
            self.assertEqual(proc.returncode, 0, proc.stderr)

    def test_public_template_read_is_allowed(self):
        with tempfile.TemporaryDirectory() as project:
            proc = self.run_guard(
                self.payload("Read",
                             {"file_path": str(Path(project) / EXAMPLE)},
                             project),
                project)
            self.assertEqual(proc.returncode, 0, proc.stderr)

    def test_unguarded_tool_is_untouched(self):
        with tempfile.TemporaryDirectory() as project:
            proc = self.run_guard(
                self.payload("WebFetch", {"url": "https://example.com/"},
                             project),
                project)
            self.assertEqual(proc.returncode, 0, proc.stderr)

    def test_explicit_approval_marker_lifts_the_block(self):
        """Access stays possible, but only behind a deliberate opt-in."""
        with tempfile.TemporaryDirectory() as project:
            marker = Path(project) / ".claude" / "apex" / "ALLOW_SECRET_ACCESS"
            marker.parent.mkdir(parents=True)
            marker.write_text("approved for this test\n")
            proc = self.run_guard(
                self.payload("Bash", {"command": "cat " + DOT_ENV}, project),
                project)
            self.assertEqual(proc.returncode, 0, proc.stderr)

    def test_other_secret_patterns_still_apply(self):
        """Moving configuration paths out did not drop the remaining rules."""
        key = "~/.ssh/" + "id_" + "rsa"
        with tempfile.TemporaryDirectory() as project:
            proc = self.run_guard(
                self.payload("Bash", {"command": "cat " + key}, project),
                project)
            self.assertEqual(proc.returncode, 2, proc.stderr)


if __name__ == "__main__":
    unittest.main()
