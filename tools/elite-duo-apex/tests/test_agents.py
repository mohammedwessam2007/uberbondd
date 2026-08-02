import re, unittest
from pathlib import Path
# Runtime agents live at the repo root's .claude/agents, not under a
# tools/elite-duo-apex/claude/ mirror.
REPO_ROOT=Path(__file__).resolve().parents[3]
class AgentTests(unittest.TestCase):
    def test_agents(self):
        agents=list((REPO_ROOT/".claude/agents").glob("*.md"))
        self.assertEqual(len(agents),32)
        for p in agents:
            text=p.read_text()
            fm=re.search(r"^---\n(.*?)\n---",text,re.S).group(1)
            self.assertRegex(fm,r"(?m)^model:\s+sonnet$")
            effort=re.search(r"(?m)^effort:\s+(\w+)$",fm).group(1)
            self.assertIn(effort,{"high","xhigh","max"})
            self.assertNotIn("model: haiku",fm)
if __name__=="__main__": unittest.main()
