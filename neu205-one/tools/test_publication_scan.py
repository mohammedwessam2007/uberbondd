import tempfile
import unittest
from pathlib import Path
from publication_scan import scan


class Publication(unittest.TestCase):
    def test_private_artifact_and_secret_not_emitted(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / 'weights.gguf').write_bytes(b'GGUF')
            (root / 'bad.py').write_bytes(b'-----' + b'BEGIN PRIVATE KEY' + b'-----')
            result = scan(root, ['weights.gguf', 'bad.py'])
            self.assertEqual(2, len(result))
            self.assertNotIn('BEGIN', str(result))

    def test_normal_source_passes(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / 'app.py').write_text('def add(a, b): return a + b\n')
            self.assertEqual([], scan(root, ['app.py']))


if __name__ == '__main__':
    unittest.main()
