import importlib.util, io, json, os, subprocess, sys, tempfile, unittest
from pathlib import Path
# Runtime hooks live at the repo root's .claude/hooks, not under a
# tools/elite-duo-apex/claude/ mirror.
REPO_ROOT=Path(__file__).resolve().parents[3]
HOOKS=REPO_ROOT/".claude/hooks"
class HookTests(unittest.TestCase):
    def run_hook(self,name,payload,cwd):
        env=dict(os.environ); env["CLAUDE_PROJECT_DIR"]=str(cwd)
        return subprocess.run([sys.executable,str(HOOKS/name)],input=json.dumps(payload),text=True,capture_output=True,cwd=HOOKS,env=env)
    def test_git_push_blocked(self):
        with tempfile.TemporaryDirectory() as d:
            p=self.run_hook("pretool_guard.py",{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"git push origin main"},"cwd":d},d)
            self.assertEqual(p.returncode,2)
    def test_safe_test_allowed(self):
        with tempfile.TemporaryDirectory() as d:
            p=self.run_hook("pretool_guard.py",{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"npm test"},"cwd":d},d)
            self.assertEqual(p.returncode,0)
    def test_env_read_blocked(self):
        with tempfile.TemporaryDirectory() as d:
            p=self.run_hook("secret_guard.py",{"hook_event_name":"PreToolUse","tool_name":"Read","tool_input":{"file_path":str(Path(d)/".env")},"cwd":d},d)
            self.assertEqual(p.returncode,2)
if __name__=="__main__": unittest.main()
