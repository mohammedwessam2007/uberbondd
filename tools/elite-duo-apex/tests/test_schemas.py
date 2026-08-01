import json, unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
class SchemaTests(unittest.TestCase):
    def test_schema_examples(self):
        schemas=list((ROOT/"schemas").glob("*.schema.json"))
        self.assertEqual(len(schemas),18)
        for schema in schemas:
            data=json.loads(schema.read_text())
            example=json.loads((ROOT/"schemas/examples"/schema.name.replace(".schema","").replace(".json",".example.json")).read_text())
            for req in data["required"]:
                self.assertIn(req,example)
if __name__=="__main__": unittest.main()
