import tempfile
import unittest
from pathlib import Path
from fetch_verified_qwen import checked_url, digest


class ModelFetch(unittest.TestCase):
    def test_only_authorized_https_destinations(self):
        for u in ['http://huggingface.co/a', 'https://huggingface.co.evil.test/a',
                  'https://user:pass@huggingface.co/a', 'https://127.0.0.1/a',
                  'https://huggingface.co:8080/a']:
            with self.assertRaises(ValueError):
                checked_url(u)
        self.assertEqual('https://huggingface.co/a', checked_url('https://huggingface.co/a'))

    def test_corruption_changes_digest(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'asset'
            p.write_bytes(b'original'); old = digest(p)
            p.write_bytes(b'corrupt')
            self.assertNotEqual(old, digest(p))


if __name__ == '__main__':
    unittest.main()
