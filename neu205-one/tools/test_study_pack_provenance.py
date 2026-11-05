import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


class PackSourceProvenance(unittest.TestCase):
    def test_wrong_pdf_refuses_before_signing_or_output(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            pdf = root / 'unapproved.pdf'
            pdf.write_bytes(b'synthetic source-provenance rejection fixture')
            output = root / 'must-not-exist.zip'
            script = Path(__file__).with_name('build-study-pack.py')
            result = subprocess.run([
                sys.executable, str(script), '--assets', str(root / 'missing-assets'),
                '--source-pdf', str(pdf), '--output', str(output),
                '--keystore', str(root / 'missing-keystore'),
                '--password-file', str(root / 'missing-password'),
            ], capture_output=True, text=True)
            self.assertNotEqual(0, result.returncode)
            self.assertIn('Original textbook PDF digest mismatch', result.stderr)
            self.assertFalse(output.exists())
