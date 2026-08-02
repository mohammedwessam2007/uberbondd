import json, re, unittest
from pathlib import Path
# Runtime settings/hooks live at the repo root's .claude/, not under a
# tools/elite-duo-apex/claude/ mirror.
REPO_ROOT=Path(__file__).resolve().parents[3]
CLAUDE_DIR=REPO_ROOT/".claude"
class SettingsTests(unittest.TestCase):
    def test_hook_targets(self):
        settings=json.loads((CLAUDE_DIR/"settings.json").read_text())
        commands=[]
        for groups in settings["hooks"].values():
            for group in groups:
                for hook in group["hooks"]:
                    if hook["type"]=="command": commands.append(hook["command"])
        self.assertGreaterEqual(len(commands),16)
        for cmd in commands:
            name=re.search(r'hooks/([^"]+)',cmd).group(1)
            self.assertTrue((CLAUDE_DIR/"hooks"/name).exists(),name)
    def test_teams_disabled(self):
        settings=json.loads((CLAUDE_DIR/"settings.json").read_text())
        self.assertEqual(settings["env"]["CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS"],"0")
if __name__=="__main__": unittest.main()
