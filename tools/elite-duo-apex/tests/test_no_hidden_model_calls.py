import unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
class HiddenCallTests(unittest.TestCase):
    def test_executable_code(self):
        forbidden=[
            "OPENAI"+"_"+"API_KEY",
            "--model "+"claude-"+"fable-5",
            "model: "+"haiku",
            "--dangerously-"+"skip-permissions",
        ]
        for p in list(ROOT.rglob("*.py"))+list(ROOT.rglob("*.sh")):
            if "legacy" in p.parts or "tests" in p.parts or p.name=="validate_package.py":
                continue
            text=p.read_text(errors="replace")
            for token in forbidden:
                self.assertNotIn(token,text,p)
if __name__=="__main__": unittest.main()
