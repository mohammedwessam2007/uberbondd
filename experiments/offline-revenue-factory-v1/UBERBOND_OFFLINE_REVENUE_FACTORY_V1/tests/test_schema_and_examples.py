import json
import unittest

import _pathsetup  # noqa: F401

from urf.common import schema as schema_mod
from urf.common.models import SCHEMA_REGISTRY
from urf.common.paths import examples_dir, schemas_dir
from urf.common.validation import validate_record_or_raise


class TestSchemaValidator(unittest.TestCase):
    def test_every_schema_file_loads(self):
        for record_type, filename in SCHEMA_REGISTRY.items():
            path = schemas_dir() / filename
            self.assertTrue(path.exists(), f"missing schema file for {record_type}: {path}")
            schema_mod.load_schema(path)  # must not raise

    def test_every_example_validates_against_its_schema(self):
        checked = 0
        for record_type, filename in SCHEMA_REGISTRY.items():
            example_name = filename.replace(".schema.json", ".example.json")
            example_path = examples_dir() / example_name
            self.assertTrue(example_path.exists(), f"missing example for {record_type}: {example_path}")
            instance = json.loads(example_path.read_text(encoding="utf-8"))
            validate_record_or_raise(record_type, instance)
            checked += 1
        self.assertEqual(checked, len(SCHEMA_REGISTRY))

    def test_additional_properties_rejected(self):
        example_path = examples_dir() / "finding.example.json"
        instance = json.loads(example_path.read_text(encoding="utf-8"))
        instance["not_a_real_field"] = "should be rejected"
        with self.assertRaises(schema_mod.SchemaValidationError):
            validate_record_or_raise("finding", instance)

    def test_missing_required_field_rejected(self):
        example_path = examples_dir() / "finding.example.json"
        instance = json.loads(example_path.read_text(encoding="utf-8"))
        del instance["label"]
        with self.assertRaises(schema_mod.SchemaValidationError):
            validate_record_or_raise("finding", instance)

    def test_invalid_enum_value_rejected(self):
        example_path = examples_dir() / "finding.example.json"
        instance = json.loads(example_path.read_text(encoding="utf-8"))
        instance["label"] = "not a real label"
        with self.assertRaises(schema_mod.SchemaValidationError):
            validate_record_or_raise("finding", instance)


if __name__ == "__main__":
    unittest.main()
