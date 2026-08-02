import importlib.util, json, os, subprocess, sys, tempfile, unittest
from pathlib import Path
# Runtime hooks live at the repo root's .claude/hooks, not under a
# tools/elite-duo-apex/claude/ mirror.
REPO_ROOT=Path(__file__).resolve().parents[3]
PKG_ROOT=Path(__file__).resolve().parents[1]
HOOKS=REPO_ROOT/".claude/hooks"

def _load_lib():
    spec=importlib.util.spec_from_file_location("lib",HOOKS/"lib.py")
    mod=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

class ProjectDirUnitTests(unittest.TestCase):
    """project_dir() must resolve via CLAUDE_PROJECT_DIR (explicit env) before
    the tool-invocation cwd, and must never fall back to os.getcwd()."""
    def setUp(self):
        self.lib=_load_lib()
        self._env_backup=os.environ.pop("CLAUDE_PROJECT_DIR",None)
    def tearDown(self):
        if self._env_backup is not None:
            os.environ["CLAUDE_PROJECT_DIR"]=self._env_backup
    def test_env_wins_over_conflicting_payload_cwd(self):
        with tempfile.TemporaryDirectory() as real_project, tempfile.TemporaryDirectory() as tool_cwd:
            os.environ["CLAUDE_PROJECT_DIR"]=real_project
            resolved=self.lib.project_dir({"cwd":tool_cwd})
            self.assertEqual(resolved,Path(real_project).resolve())
            self.assertNotEqual(resolved,Path(tool_cwd).resolve())
    def test_payload_cwd_used_when_no_env(self):
        os.environ.pop("CLAUDE_PROJECT_DIR",None)
        with tempfile.TemporaryDirectory() as tool_cwd:
            resolved=self.lib.project_dir({"cwd":tool_cwd})
            self.assertEqual(resolved,Path(tool_cwd).resolve())
    def test_fallback_is_real_repo_root_not_process_cwd(self):
        os.environ.pop("CLAUDE_PROJECT_DIR",None)
        cwd_before=os.getcwd()
        try:
            os.chdir(PKG_ROOT)
            resolved=self.lib.project_dir({})
        finally:
            os.chdir(cwd_before)
        self.assertEqual(resolved,REPO_ROOT)
        self.assertNotEqual(resolved,PKG_ROOT)

class HookInvocationCwdTests(unittest.TestCase):
    """A hook must write persistent state only under the project directory
    supplied via CLAUDE_PROJECT_DIR, regardless of which directory the
    subprocess itself is launched from (repo root, tools/elite-duo-apex/, or
    an arbitrary third directory)."""
    def _run_from(self,invocation_cwd,real_project):
        env=dict(os.environ); env["CLAUDE_PROJECT_DIR"]=str(real_project)
        payload={"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"npm test"},"cwd":str(invocation_cwd)}
        return subprocess.run([sys.executable,str(HOOKS/"pretool_guard.py")],input=json.dumps(payload),text=True,capture_output=True,cwd=invocation_cwd,env=env)
    def test_same_result_from_three_invocation_directories(self):
        with tempfile.TemporaryDirectory() as project, tempfile.TemporaryDirectory() as arbitrary:
            project=Path(project)
            for invocation_cwd in (REPO_ROOT,PKG_ROOT,Path(arbitrary)):
                p=self._run_from(invocation_cwd,project)
                self.assertEqual(p.returncode,0,p.stderr)
            self.assertTrue((project/".claude/apex/pretool.jsonl").exists())
            self.assertFalse((PKG_ROOT/".claude").exists(),
                "running a hook from tools/elite-duo-apex/ must never create tools/elite-duo-apex/.claude/")
            self.assertFalse((Path(arbitrary)/".claude").exists())
if __name__=="__main__": unittest.main()
