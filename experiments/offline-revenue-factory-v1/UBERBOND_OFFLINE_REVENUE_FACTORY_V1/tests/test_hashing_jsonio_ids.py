import json
import tempfile
import unittest
from pathlib import Path

import _pathsetup  # noqa: F401

from urf.common.hashing import hash_tree, sha256_bytes, sha256_file, sha256_json, sha256_str
from urf.common.ids import make_record_id, make_run_id
from urf.common.jsonio import DuplicateKeyError, load_json_strict, read_json, write_json


class TestHashing(unittest.TestCase):
    def test_sha256_str_deterministic(self):
        self.assertEqual(sha256_str("hello"), sha256_str("hello"))
        self.assertNotEqual(sha256_str("hello"), sha256_str("hello!"))

    def test_sha256_bytes_matches_known_vector(self):
        # sha256("") is a well-known constant.
        self.assertEqual(
            sha256_bytes(b""),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        )

    def test_sha256_json_order_independent(self):
        a = sha256_json({"b": 1, "a": 2})
        b = sha256_json({"a": 2, "b": 1})
        self.assertEqual(a, b)

    def test_sha256_file_matches_sha256_bytes(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "f.txt"
            p.write_bytes(b"some content")
            self.assertEqual(sha256_file(p), sha256_bytes(b"some content"))

    def test_hash_tree_covers_all_files(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            (root / "a.txt").write_text("a")
            (root / "sub").mkdir()
            (root / "sub" / "b.txt").write_text("b")
            tree = hash_tree(root)
            self.assertEqual(set(tree.keys()), {"a.txt", "sub/b.txt"})
            self.assertEqual(tree["a.txt"], sha256_bytes(b"a"))


class TestJsonio(unittest.TestCase):
    def test_duplicate_top_level_key_raises(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "dup.json"
            p.write_text('{"a": 1, "a": 2}', encoding="utf-8")
            with self.assertRaises(DuplicateKeyError):
                load_json_strict(p)

    def test_write_then_read_round_trips(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "out" / "f.json"
            write_json(p, {"x": [1, 2, 3], "y": "z"})
            self.assertEqual(read_json(p), {"x": [1, 2, 3], "y": "z"})

    def test_write_json_output_is_deterministic_key_order(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "f.json"
            write_json(p, {"b": 1, "a": 2})
            text = p.read_text(encoding="utf-8")
            self.assertLess(text.index('"a"'), text.index('"b"'))


class TestIds(unittest.TestCase):
    def test_explicit_run_id_used_verbatim(self):
        run_id, origin = make_run_id("msft_csp", "complete", None, "my-run-id")
        self.assertEqual(run_id, "my-run-id")
        self.assertEqual(origin, "explicit")

    def test_seeded_run_id_deterministic(self):
        a, origin_a = make_run_id("msft_csp", "complete", "seed1", None)
        b, origin_b = make_run_id("msft_csp", "complete", "seed1", None)
        self.assertEqual(a, b)
        self.assertEqual(origin_a, "seeded")
        self.assertEqual(origin_b, "seeded")

    def test_seeded_run_id_changes_with_seed(self):
        a, _ = make_run_id("msft_csp", "complete", "seed1", None)
        b, _ = make_run_id("msft_csp", "complete", "seed2", None)
        self.assertNotEqual(a, b)

    def test_random_run_id_marked_random_and_unique(self):
        a, origin_a = make_run_id("msft_csp", "complete", None, None)
        b, origin_b = make_run_id("msft_csp", "complete", None, None)
        self.assertEqual(origin_a, "random")
        self.assertEqual(origin_b, "random")
        self.assertNotEqual(a, b)

    def test_record_id_format(self):
        rid = make_record_id("ev", "run-123", 7)
        self.assertEqual(rid, "ev-run-123-0007")


if __name__ == "__main__":
    unittest.main()
