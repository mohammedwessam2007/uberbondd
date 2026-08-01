import json, unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
class SkillTests(unittest.TestCase):
    def test_skills(self):
        skills=list((ROOT/"claude/skills").glob("*/SKILL.md"))
        self.assertEqual(len(skills),76)
        for p in skills:
            text=p.read_text()
            self.assertIn("Do not call a non-Sonnet model.",text)
            contract=json.loads((p.parent/"contract.json").read_text())
            self.assertEqual(contract["model"],"claude-sonnet-5")
if __name__=="__main__": unittest.main()
