import json, sqlite3, subprocess, sys, tempfile, unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
class V3LibraryTests(unittest.TestCase):
    def test_counts(self):
        self.assertGreaterEqual(len([p for p in ROOT.rglob("*") if p.is_file() and "__pycache__" not in p.parts]),6000)
        self.assertEqual(len(list((ROOT/"library/domains").glob("*/*/DOMAIN_DOCTRINE.md"))),144)
        self.assertEqual(len(list((ROOT/"library/routes").glob("*/*/ROUTE.md"))),288)
        self.assertEqual(len(list((ROOT/"library/skills").glob("*/*/SKILL.md"))),288)
        self.assertEqual(len(list((ROOT/"library/agents").glob("*/*/AGENT.md"))),144)
        self.assertEqual(len(list((ROOT/"library/failure-playbooks").glob("*/*/PLAYBOOK.md"))),144)
        self.assertEqual(len(list((ROOT/"library/controls").glob("*/*/CONTROL.md"))),288)
        self.assertEqual(len(list((ROOT/"library/benchmarks").glob("*/*/CASE.json"))),288)
    def test_agents_sonnet(self):
        for p in (ROOT/"library/agents").glob("*/*/AGENT.md"):
            text=p.read_text()
            self.assertIn("model: sonnet",text)
            self.assertIn("effort: max",text)
    def test_search(self):
        p=subprocess.run([sys.executable,str(ROOT/"library/apex_library.py"),"search","payment concurrency idempotency","--limit","10"],capture_output=True,text=True)
        self.assertEqual(p.returncode,0,p.stderr)
        results=json.loads(p.stdout)
        self.assertTrue(results)
    def test_materialize(self):
        with tempfile.TemporaryDirectory() as d:
            p=subprocess.run([sys.executable,str(ROOT/"library/apex_library.py"),"materialize","--query","durable worker crash recovery concurrency","--output",d,"--limit","24","--max-bytes","500000"],capture_output=True,text=True)
            self.assertEqual(p.returncode,0,p.stderr)
            self.assertTrue((Path(d)/"PACK_MANIFEST.json").exists())
            manifest=json.loads((Path(d)/"PACK_MANIFEST.json").read_text())
            self.assertGreater(manifest["selected_count"],9)
            self.assertLessEqual(manifest["selected_bytes"],500000)
if __name__=="__main__": unittest.main()
