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
        self.assertEqual('https://cdn-lfs.huggingface.co/a', checked_url('https://cdn-lfs.huggingface.co/a'))
        self.assertEqual('https://cas-bridge.xethub.hf.co/a', checked_url('https://cas-bridge.xethub.hf.co/a'))
        for u in ['https://cdn-lfs.huggingface.co.evil.test/a', 'http://cdn-lfs.huggingface.co/a',
                  'https://cdn-lfs.huggingface.co:8080/a']:
            with self.assertRaises(ValueError):
                checked_url(u)

    def test_corruption_changes_digest(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'asset'
            p.write_bytes(b'original'); old = digest(p)
            p.write_bytes(b'corrupt')
            self.assertNotEqual(old, digest(p))


if __name__ == '__main__':
    unittest.main()
