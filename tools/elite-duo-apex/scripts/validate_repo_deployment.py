#!/usr/bin/env python3
"""Validate the actual repo-scoped ELITE DUO deployment (repo-root .claude/),
as distinct from tools/elite-duo-apex/tests/*, which check the vendored
package's own claude/ layout and do not apply once the package is installed
project-relative per CLAUDE app session (see docs/... for why paths differ).
"""
import json, os, re, subprocess, sys, tempfile, unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
CLAUDE_DIR = REPO_ROOT / ".claude"


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


class V4ContextEngineTests(unittest.TestCase):
    def test_statusline(self):
        with tempfile.TemporaryDirectory() as d:
            payload = {'session_id': 's', 'model': {'display_name': 'Sonnet 5'}, 'effort': {'level': 'xhigh'}, 'workspace': {'project_dir': d}, 'context_window': {'used_percentage': 76, 'current_usage': {'input_tokens': 100, 'cache_creation_input_tokens': 50, 'cache_read_input_tokens': 850}}, 'cost': {'total_cost_usd': 1.25}}
            p = subprocess.run([sys.executable, str(CLAUDE_DIR / 'statusline/apex_statusline.py')], input=json.dumps(payload), text=True, capture_output=True)
            self.assertEqual(p.returncode, 0, p.stderr)
            self.assertIn('RED', p.stdout)
            self.assertTrue((Path(d) / '.claude/apex/CONTEXT_HEALTH.json').exists())

    def test_evaporation(self):
        with tempfile.TemporaryDirectory() as d:
            payload = {'hook_event_name': 'PostToolUse', 'tool_name': 'Bash', 'tool_input': {'command': 'tests'}, 'tool_response': {'stdout': 'line\n' * 10000, 'stderr': ''}, 'cwd': d}
            env = dict(os.environ)
            env['CLAUDE_PROJECT_DIR'] = d
            hooks = CLAUDE_DIR / 'hooks'
            p = subprocess.run([sys.executable, str(hooks / 'tool_output_evaporator.py')], input=json.dumps(payload), text=True, capture_output=True, cwd=hooks, env=env)
            self.assertEqual(p.returncode, 0, p.stderr)
            out = json.loads(p.stdout)
            self.assertIn('updatedToolOutput', out['hookSpecificOutput'])
            self.assertTrue(list((Path(d) / '.claude/apex/tool-results').glob('*.json')))

    def test_postcompact(self):
        with tempfile.TemporaryDirectory() as d:
            payload = {'hook_event_name': 'PostCompact', 'trigger': 'manual', 'compact_summary': 'mission authority architecture invariants tests blockers external actions rollback next action', 'cwd': d}
            env = dict(os.environ)
            env['CLAUDE_PROJECT_DIR'] = d
            hooks = CLAUDE_DIR / 'hooks'
            p = subprocess.run([sys.executable, str(hooks / 'postcompact_v4.py')], input=json.dumps(payload), text=True, capture_output=True, cwd=hooks, env=env)
            self.assertEqual(p.returncode, 0, p.stderr)
            report = json.loads((Path(d) / '.claude/apex/COMPACTION_AUDIT.json').read_text())
            self.assertFalse(report['missing_terms'])


if __name__ == '__main__':
    unittest.main()
