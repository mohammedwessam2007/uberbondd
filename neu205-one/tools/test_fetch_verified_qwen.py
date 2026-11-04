import io
import json
import tempfile
import unittest
from pathlib import Path
import urllib.request
import urllib.error
from unittest.mock import patch
from fetch_verified_qwen import checked_url, digest, Redirects, main, EXPECTED, FILENAME


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
        self.assertEqual('https://us.aws.cdn.hf.co/a', checked_url('https://us.aws.cdn.hf.co/a'))
        self.assertEqual('https://eu.aws.cdn.hf.co/a', checked_url('https://eu.aws.cdn.hf.co/a'))
        for u in ['https://us.aws.cdn.hf.co.evil.test/a', 'http://us.aws.cdn.hf.co/a',
                  'https://us.aws.cdn.hf.co:8080/a', 'https://us.aws.cdn.hf.com/a',
                  'https://user:secret@us.aws.cdn.hf.co/a']:
            with self.assertRaises(ValueError):
                checked_url(u)
        for u in ['https://cdn-lfs.huggingface.co.evil.test/a', 'http://cdn-lfs.huggingface.co/a',
                  'https://cdn-lfs.huggingface.co:8080/a']:
            with self.assertRaises(ValueError):
                checked_url(u)

    def test_redirect_guard(self):
        req = urllib.request.Request('https://huggingface.co/something')
        self.assertEqual('https://cdn-lfs.huggingface.co/x',
                         Redirects().redirect_request(req, None, 302, 'found', {},
                                                      'https://cdn-lfs.huggingface.co/x').full_url)
        with self.assertRaises(ValueError):
            Redirects().redirect_request(req, None, 302, 'found', {},
                                         'https://evil.test/x')

    def test_corruption_changes_digest(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'asset'
            p.write_bytes(b'original'); old = digest(p)
            p.write_bytes(b'corrupt')
            self.assertNotEqual(old, digest(p))


    def test_proxy_rejection_does_not_poison_future_retry(self):
        metadata = {'sha': 'a' * 40, 'siblings': [{'rfilename': FILENAME, 'lfs': {'sha256': EXPECTED, 'size': 42}}]}
        class BlockedOpener:
            def open(self, url, timeout):
                if '/api/models/' in url:
                    return io.BytesIO(json.dumps(metadata).encode())
                raise urllib.error.HTTPError(url, 403, 'blocked', {}, None)
        with tempfile.TemporaryDirectory() as d:
            output = Path(d) / FILENAME
            with patch('fetch_verified_qwen.urllib.request.build_opener', return_value=BlockedOpener()), \
                 patch('sys.argv', ['fetch_verified_qwen.py', '--out', str(output)]):
                with self.assertRaises(urllib.error.HTTPError):
                    main()
            self.assertFalse(output.exists())
            self.assertFalse(output.with_suffix(output.suffix + '.partial').exists())

    def test_existing_partial_is_never_overwritten(self):
        metadata = {'sha': 'a' * 40, 'siblings': [{'rfilename': FILENAME, 'lfs': {'sha256': EXPECTED, 'size': 42}}]}
        class MetadataOpener:
            def open(self, url, timeout):
                if '/api/models/' in url:
                    return io.BytesIO(json.dumps(metadata).encode())
                raise AssertionError('No model request should occur when partial exists')
        with tempfile.TemporaryDirectory() as d:
            output = Path(d) / FILENAME
            partial = output.with_suffix(output.suffix + '.partial')
            partial.write_bytes(b'preserve')
            with patch('fetch_verified_qwen.urllib.request.build_opener', return_value=MetadataOpener()), \
                 patch('sys.argv', ['fetch_verified_qwen.py', '--out', str(output)]):
                with self.assertRaisesRegex(ValueError, 'Previous partial'):
                    main()
            self.assertEqual(partial.read_bytes(), b'preserve')



if __name__ == '__main__':
    unittest.main()
