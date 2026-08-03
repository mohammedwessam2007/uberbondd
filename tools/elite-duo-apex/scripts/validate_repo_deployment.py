#!/usr/bin/env python3
"""The one authoritative validator for the actual repo-scoped ELITE DUO
deployment (repo-root .claude/ + tools/elite-duo-apex/), as distinct from
tools/elite-duo-apex/tests/validate_v3.py and validate_v4.py, which check
only the vendored package's own source tree in isolation (library/, schemas/,
scripts/) and are compatibility-only -- they do not describe the installed
repo deployment and must not be treated as authoritative for it.
"""
import json, os, re, subprocess, sys, tempfile, unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
CLAUDE_DIR = REPO_ROOT / ".claude"
PKG_ROOT = Path(__file__).resolve().parents[1]

PROTECTED_PATHS = [
    "lite", "src", "server.mjs", "worker.mjs", "migrations", "package.json",
]

GENERATED_PATTERNS = [
    "catalog.sqlite", "catalog.jsonl", "catalog.csv", "CATALOG_STATS.json",
    "APEX_STATE.json", "CONTEXT_HEALTH.json", "MISSION_INTELLIGENCE_PACK",
    ".claude-apex-backups", "FRACTION_ENGINE_BENCHMARK.json",
]


class AgentTests(unittest.TestCase):
    def test_agents(self):
        agents = list((CLAUDE_DIR / "agents").glob("*.md"))
        self.assertEqual(len(agents), 32)
        for p in agents:
            text = p.read_text()
            fm = re.search(r"^---\n(.*?)\n---", text, re.S).group(1)
            self.assertRegex(fm, r"(?m)^model:\s+sonnet$")
            effort = re.search(r"(?m)^effort:\s+(\w+)$", fm).group(1)
            self.assertIn(effort, {"high", "xhigh", "max"})


class SkillTests(unittest.TestCase):
    def test_skills(self):
        skills = list((CLAUDE_DIR / "skills").glob("*/SKILL.md"))
        self.assertEqual(len(skills), 76)
        for p in skills:
            text = p.read_text()
            self.assertIn("Do not call a non-Sonnet model.", text)
            contract = json.loads((p.parent / "contract.json").read_text())
            self.assertEqual(contract["model"], "claude-sonnet-5")


class RuleTests(unittest.TestCase):
    def test_rule_count(self):
        rules = list((CLAUDE_DIR / "rules/elite-duo-apex").glob("*.md"))
        self.assertEqual(len(rules), 16)

    def test_rule_frontmatter_valid(self):
        for p in (CLAUDE_DIR / "rules/elite-duo-apex").glob("*.md"):
            text = p.read_text()
            self.assertTrue(text.startswith("---\n"), p)
            fm = text.split("---", 2)[1]
            unconditional = "paths:" not in fm
            # Path-scoped rules must declare at least one glob; unconditional
            # rules (empty frontmatter) load every session identically to
            # CLAUDE.md, so both classes are valid -- just mutually exclusive.
            if not unconditional:
                self.assertIn("- ", fm, p)


class HookTests(unittest.TestCase):
    def run_hook(self, name, payload, cwd):
        env = dict(os.environ)
        env["CLAUDE_PROJECT_DIR"] = str(cwd)
        hooks = CLAUDE_DIR / "hooks"
        return subprocess.run(
            [sys.executable, str(hooks / name)],
            input=json.dumps(payload), text=True, capture_output=True,
            cwd=hooks, env=env,
        )

    # Modules that live beside the hooks but are imported rather than invoked.
    # Named explicitly so the count below stays a statement about how many hook
    # entry points exist, not just how many files happen to sit in the folder.
    HOOK_LIBRARIES = {"lib.py", "secret_paths.py"}

    def test_hook_count(self):
        modules = list((CLAUDE_DIR / "hooks").glob("*.py"))
        self.assertEqual(len(modules), 24)
        entry_points = [p for p in modules if p.name not in self.HOOK_LIBRARIES]
        self.assertEqual(len(entry_points), 22)

    def test_git_push_blocked(self):
        with tempfile.TemporaryDirectory() as d:
            p = self.run_hook("pretool_guard.py", {"hook_event_name": "PreToolUse", "tool_name": "Bash", "tool_input": {"command": "git push origin main"}, "cwd": d}, d)
            self.assertEqual(p.returncode, 2)

    def test_git_push_master_blocked(self):
        with tempfile.TemporaryDirectory() as d:
            p = self.run_hook("pretool_guard.py", {"hook_event_name": "PreToolUse", "tool_name": "Bash", "tool_input": {"command": "git push origin master"}, "cwd": d}, d)
            self.assertEqual(p.returncode, 2)

    def test_git_push_force_blocked(self):
        with tempfile.TemporaryDirectory() as d:
            p = self.run_hook("pretool_guard.py", {"hook_event_name": "PreToolUse", "tool_name": "Bash", "tool_input": {"command": "git push --force origin setup/fable-fraction-v4"}, "cwd": d}, d)
            self.assertEqual(p.returncode, 2)

    def test_git_push_delete_blocked(self):
        with tempfile.TemporaryDirectory() as d:
            p = self.run_hook("pretool_guard.py", {"hook_event_name": "PreToolUse", "tool_name": "Bash", "tool_input": {"command": "git push origin --delete some-branch"}, "cwd": d}, d)
            self.assertEqual(p.returncode, 2)

    def test_git_push_tags_blocked(self):
        with tempfile.TemporaryDirectory() as d:
            p = self.run_hook("pretool_guard.py", {"hook_event_name": "PreToolUse", "tool_name": "Bash", "tool_input": {"command": "git push --tags origin"}, "cwd": d}, d)
            self.assertEqual(p.returncode, 2)

    def test_git_push_feature_branch_allowed(self):
        with tempfile.TemporaryDirectory() as d:
            p = self.run_hook("pretool_guard.py", {"hook_event_name": "PreToolUse", "tool_name": "Bash", "tool_input": {"command": "git push -u origin setup/fable-fraction-v4"}, "cwd": d}, d)
            self.assertEqual(p.returncode, 0)

    def test_git_push_prose_across_lines_not_blocked(self):
        # A multi-line commit message that mentions "git push" and "main" in
        # separate lines of prose must not be mistaken for a real dangerous
        # git push invocation elsewhere in the same compound Bash command.
        cmd = (
            'git commit -m "$(cat <<\'EOF\'\n'
            'chore: allow approved feature-branch pushes\n\n'
            'Narrow the git-push deny rule: ordinary git push now requires ask\n'
            'approval, while push to main/master, force pushes remain denied.\n'
            'EOF\n)"'
        )
        with tempfile.TemporaryDirectory() as d:
            p = self.run_hook("pretool_guard.py", {"hook_event_name": "PreToolUse", "tool_name": "Bash", "tool_input": {"command": cmd}, "cwd": d}, d)
            self.assertEqual(p.returncode, 0, p.stderr)

    def test_safe_test_allowed(self):
        with tempfile.TemporaryDirectory() as d:
            p = self.run_hook("pretool_guard.py", {"hook_event_name": "PreToolUse", "tool_name": "Bash", "tool_input": {"command": "npm test"}, "cwd": d}, d)
            self.assertEqual(p.returncode, 0)

    def test_env_read_blocked(self):
        with tempfile.TemporaryDirectory() as d:
            p = self.run_hook("secret_guard.py", {"hook_event_name": "PreToolUse", "tool_name": "Read", "tool_input": {"file_path": str(Path(d) / ".env")}, "cwd": d}, d)
            self.assertEqual(p.returncode, 2)


class SettingsTests(unittest.TestCase):
    def test_hook_targets(self):
        settings = json.loads((CLAUDE_DIR / "settings.json").read_text())
        commands = []
        for groups in settings["hooks"].values():
            for group in groups:
                for hook in group["hooks"]:
                    if hook["type"] == "command":
                        commands.append(hook["command"])
        self.assertGreaterEqual(len(commands), 16)
        for cmd in commands:
            name = re.search(r'hooks/([^"\s]+)', cmd).group(1)
            self.assertTrue((CLAUDE_DIR / "hooks" / name).exists(), name)

    def test_teams_disabled(self):
        settings = json.loads((CLAUDE_DIR / "settings.json").read_text())
        self.assertEqual(settings["env"]["CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS"], "0")

    def test_statusline_configured(self):
        settings = json.loads((CLAUDE_DIR / "settings.json").read_text())
        self.assertEqual(settings["statusLine"]["type"], "command")
        self.assertIn("apex_statusline.py", settings["statusLine"]["command"])

    def test_permission_classifications(self):
        perms = json.loads((CLAUDE_DIR / "settings.json").read_text())["permissions"]
        self.assertIn("Bash(git push *)", perms["ask"])
        for required_deny in [
            "Bash(git push * main)", "Bash(git push * master)",
            "Bash(git push *--force*)", "Bash(git push *--delete*)",
            "Bash(git push *--tags*)", "Bash(gh pr merge*)",
            "Bash(npm publish*)",
        ]:
            self.assertIn(required_deny, perms["deny"])


class NoHiddenModelCallsTests(unittest.TestCase):
    def test_no_forbidden_tokens(self):
        forbidden = [
            "OPENAI" + "_" + "API_KEY",
            "--model " + "claude-" + "fable-5",
            "model: " + "haiku",
            "--dangerously-" + "skip-permissions",
        ]
        candidates = (
            list(CLAUDE_DIR.rglob("*.py")) + list(CLAUDE_DIR.rglob("*.sh")) +
            list(PKG_ROOT.rglob("*.py")) + list(PKG_ROOT.rglob("*.sh"))
        )
        for p in candidates:
            if "legacy" in p.parts or "tests" in p.parts or "__pycache__" in p.parts or p.name == "validate_package.py":
                continue
            text = p.read_text(errors="replace")
            for token in forbidden:
                self.assertNotIn(token, text, p)


class V4ContextEngineTests(unittest.TestCase):
    def _run(self, name, payload, project_dir):
        env = dict(os.environ)
        env["CLAUDE_PROJECT_DIR"] = str(project_dir)
        hooks = CLAUDE_DIR / "hooks"
        return subprocess.run([sys.executable, str(hooks / name)], input=json.dumps(payload), text=True, capture_output=True, cwd=hooks, env=env)

    def test_statusline(self):
        with tempfile.TemporaryDirectory() as d:
            payload = {'session_id': 's', 'model': {'display_name': 'Sonnet 5'}, 'effort': {'level': 'xhigh'}, 'workspace': {'project_dir': d}, 'context_window': {'used_percentage': 76, 'current_usage': {'input_tokens': 100, 'cache_creation_input_tokens': 50, 'cache_read_input_tokens': 850}}, 'cost': {'total_cost_usd': 1.25}}
            p = subprocess.run([sys.executable, str(CLAUDE_DIR / 'statusline/apex_statusline.py')], input=json.dumps(payload), text=True, capture_output=True)
            self.assertEqual(p.returncode, 0, p.stderr)
            self.assertIn('RED', p.stdout)
            self.assertTrue((Path(d) / '.claude/apex/CONTEXT_HEALTH.json').exists())

    def test_context_governor(self):
        with tempfile.TemporaryDirectory() as d:
            apex = Path(d) / ".claude/apex"; apex.mkdir(parents=True)
            (apex / "CONTEXT_HEALTH.json").write_text(json.dumps({"zone": "RED", "used_percentage": 80, "cache_ratio": 0.5}))
            p = self._run("context_governor.py", {"hook_event_name": "UserPromptSubmit", "cwd": d}, d)
            self.assertEqual(p.returncode, 0, p.stderr)
            out = json.loads(p.stdout)
            self.assertIn("RED", out["hookSpecificOutput"]["additionalContext"])

    def test_evaporation(self):
        with tempfile.TemporaryDirectory() as d:
            payload = {'hook_event_name': 'PostToolUse', 'tool_name': 'Bash', 'tool_input': {'command': 'tests'}, 'tool_response': {'stdout': 'line\n' * 10000, 'stderr': ''}, 'cwd': d}
            p = self._run('tool_output_evaporator.py', payload, d)
            self.assertEqual(p.returncode, 0, p.stderr)
            out = json.loads(p.stdout)
            self.assertIn('updatedToolOutput', out['hookSpecificOutput'])
            self.assertTrue(list((Path(d) / '.claude/apex/tool-results').glob('*.json')))

    def test_precompact(self):
        with tempfile.TemporaryDirectory() as d:
            payload = {'hook_event_name': 'PreCompact', 'trigger': 'manual', 'cwd': d}
            p = self._run('precompact_v4.py', payload, d)
            self.assertEqual(p.returncode, 0, p.stderr)
            latest = Path(d) / '.claude/apex/LATEST_PRECOMPACT'
            self.assertTrue(latest.exists())
            snapshot_path = Path(latest.read_text().strip())
            self.assertTrue(snapshot_path.exists())

    def test_postcompact_and_rehydration(self):
        with tempfile.TemporaryDirectory() as d:
            payload = {'hook_event_name': 'PostCompact', 'trigger': 'manual', 'compact_summary': 'mission authority architecture invariants tests blockers external actions rollback next action', 'cwd': d}
            p = self._run('postcompact_v4.py', payload, d)
            self.assertEqual(p.returncode, 0, p.stderr)
            report = json.loads((Path(d) / '.claude/apex/COMPACTION_AUDIT.json').read_text())
            self.assertFalse(report['missing_terms'])
            brief = Path(d) / '.claude/apex/REHYDRATION_BRIEF.md'
            self.assertTrue(brief.exists())
            # session_start_v4.py must surface the rehydration brief when a
            # session resumes from a compaction.
            p2 = self._run('session_start_v4.py', {'hook_event_name': 'SessionStart', 'source': 'compact', 'cwd': d}, d)
            self.assertEqual(p2.returncode, 0, p2.stderr)
            out2 = json.loads(p2.stdout)
            self.assertIn('Post-compaction rehydration', out2['hookSpecificOutput']['additionalContext'])


class LibraryTests(unittest.TestCase):
    def _catalog_env(self, catalog_dir):
        subprocess.run(
            [sys.executable, str(PKG_ROOT / "library/build_catalog.py"), "--output-dir", str(catalog_dir)],
            capture_output=True, text=True, check=True,
        )
        env = dict(os.environ)
        env["APEX_LIBRARY_CATALOG_DB"] = str(catalog_dir / "catalog.sqlite")
        return env

    def test_search(self):
        with tempfile.TemporaryDirectory() as catalog_dir:
            env = self._catalog_env(Path(catalog_dir))
            p = subprocess.run([sys.executable, str(PKG_ROOT / "library/apex_library.py"), "search", "payment concurrency idempotency", "--limit", "10"], capture_output=True, text=True, env=env)
            self.assertEqual(p.returncode, 0, p.stderr)
            self.assertTrue(json.loads(p.stdout))

    def test_materialize(self):
        with tempfile.TemporaryDirectory() as catalog_dir, tempfile.TemporaryDirectory() as d:
            env = self._catalog_env(Path(catalog_dir))
            p = subprocess.run([sys.executable, str(PKG_ROOT / "library/apex_library.py"), "materialize", "--query", "durable worker crash recovery concurrency", "--output", d, "--limit", "24", "--max-bytes", "500000"], capture_output=True, text=True, env=env)
            self.assertEqual(p.returncode, 0, p.stderr)
            manifest = json.loads((Path(d) / "PACK_MANIFEST.json").read_text())
            self.assertGreater(manifest["selected_count"], 9)
            self.assertLessEqual(manifest["selected_bytes"], 500000)


class NoGeneratedArtifactsTrackedTests(unittest.TestCase):
    def test_no_generated_files_tracked(self):
        tracked = subprocess.run(["git", "-C", str(REPO_ROOT), "ls-files"], capture_output=True, text=True, check=True).stdout.splitlines()
        for path in tracked:
            for pattern in GENERATED_PATTERNS:
                self.assertNotIn(pattern, path, f"generated artifact tracked: {path}")


class CwdIndependenceTests(unittest.TestCase):
    """A hook must resolve persistent state via CLAUDE_PROJECT_DIR (or the
    real repo root), never via the tool invocation's own working directory --
    running from repo root, tools/elite-duo-apex/, or an arbitrary directory
    must all produce identical results and leave no unintended files."""
    def _run_from(self, invocation_cwd, real_project):
        env = dict(os.environ)
        env["CLAUDE_PROJECT_DIR"] = str(real_project)
        payload = {"hook_event_name": "PreToolUse", "tool_name": "Bash", "tool_input": {"command": "npm test"}, "cwd": str(invocation_cwd)}
        return subprocess.run([sys.executable, str(CLAUDE_DIR / "hooks/pretool_guard.py")], input=json.dumps(payload), text=True, capture_output=True, cwd=invocation_cwd, env=env)

    def test_same_result_from_three_invocation_directories(self):
        with tempfile.TemporaryDirectory() as project, tempfile.TemporaryDirectory() as arbitrary:
            project = Path(project)
            for invocation_cwd in (REPO_ROOT, PKG_ROOT, Path(arbitrary)):
                p = self._run_from(invocation_cwd, project)
                self.assertEqual(p.returncode, 0, p.stderr)
            self.assertTrue((project / ".claude/apex/pretool.jsonl").exists())
            self.assertFalse((PKG_ROOT / ".claude").exists(), "running a hook from tools/elite-duo-apex/ must never create tools/elite-duo-apex/.claude/")
            self.assertFalse((Path(arbitrary) / ".claude").exists())


class ProtectedPathTests(unittest.TestCase):
    def test_protected_paths_exist(self):
        for rel in PROTECTED_PATHS:
            self.assertTrue((REPO_ROOT / rel).exists(), rel)

    def test_protected_paths_unchanged_in_working_tree(self):
        diff = subprocess.run(
            ["git", "-C", str(REPO_ROOT), "diff", "--name-only", "HEAD", "--"] + PROTECTED_PATHS,
            capture_output=True, text=True, check=True,
        ).stdout.strip()
        self.assertEqual(diff, "", f"protected paths modified: {diff}")


if __name__ == '__main__':
    unittest.main()
