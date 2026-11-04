"""Privacy regression tests for the host-only Qwen benchmark receipts."""
import hashlib
import json
import os
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest
from unittest.mock import patch

from benchmark_qwen import main


class BenchmarkReceiptPrivacy(unittest.TestCase):
    def run_benchmark(self, root, out):
        model = root / 'model.gguf'
        binary = root / 'llama-bench'
        identity = root / 'identity.json'
        model.write_bytes(b'synthetic-model-not-an-inference-asset')
        binary.write_bytes(b'synthetic-binary-not-executable')
        digest = hashlib.sha256(model.read_bytes()).hexdigest()
        identity.write_text(json.dumps({'sha256': digest, 'architecture': 'qwen3_5'}))
        argv = ['benchmark_qwen.py', '--binary', str(binary), '--model', str(model),
                '--expected-sha256', digest, '--backend', 'CPU',
                '--identity', str(identity), '--out', str(out)]
        with patch('sys.argv', argv), patch('benchmark_qwen.subprocess.run',
                return_value=SimpleNamespace(stdout='private stdout', stderr='private stderr',
                                             returncode=0)):
            with self.assertRaises(SystemExit) as exit_info:
                main()
        self.assertEqual(0, exit_info.exception.code)

    def test_all_receipts_private_from_creation(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            out = root / 'benchmark.json'
            previous_umask = os.umask(0o022)
            try:
                self.run_benchmark(root, out)
            finally:
                os.umask(previous_umask)
            for path in (out, out.with_suffix('.stdout'), out.with_suffix('.stderr')):
                with self.subTest(path=path.name):
                    self.assertTrue(path.exists())
                    self.assertEqual(0o600, path.stat().st_mode & 0o777)

    def test_existing_receipt_never_overwritten(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            out = root / 'benchmark.json'
            out.write_text('PRESERVE ORIGINAL RECEIPT')
            model = root / 'model.gguf'
            binary = root / 'llama-bench'
            identity = root / 'identity.json'
            model.write_bytes(b'synthetic-model')
            binary.write_bytes(b'synthetic-binary')
            digest = hashlib.sha256(model.read_bytes()).hexdigest()
            identity.write_text(json.dumps({'sha256': digest, 'architecture': 'qwen3_5'}))
            argv = ['benchmark_qwen.py', '--binary', str(binary), '--model', str(model),
                    '--expected-sha256', digest, '--backend', 'CPU',
                    '--identity', str(identity), '--out', str(out)]
            with patch('sys.argv', argv), patch('benchmark_qwen.subprocess.run') as run:
                with self.assertRaises(SystemExit) as caught:
                    main()
            self.assertNotEqual(0, caught.exception.code)
            self.assertEqual('PRESERVE ORIGINAL RECEIPT', out.read_text())
            run.assert_not_called()


if __name__ == '__main__':
    unittest.main()
