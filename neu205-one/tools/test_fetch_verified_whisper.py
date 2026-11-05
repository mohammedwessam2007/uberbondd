"""Integrity boundary tests; no models or network needed."""
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch
import fetch_verified_whisper as recovery


class IntegrityBoundaryTest(unittest.TestCase):
    def test_changed_archive_rejected_before_extraction(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'bad.tgz'
            source.write_bytes(b'not the publisher archive')
            with self.assertRaisesRegex(ValueError, 'custody-pinned'):
                recovery.extract_verified(source, Path(directory) / 'output')
            self.assertFalse((Path(directory) / 'output').exists())

    def test_traversal_absolute_and_links_rejected_even_after_integrity(self):
        for name, kind in [('package/../../escape', tarfile.REGTYPE), ('/escape', tarfile.REGTYPE), ('package/link', tarfile.SYMTYPE)]:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as directory:
                source = Path(directory) / 'fixture.tgz'
                with tarfile.open(source, 'w:gz') as archive:
                    member = tarfile.TarInfo(name)
                    member.type = kind
                    archive.addfile(member, io.BytesIO(b''))
                with patch.object(recovery, 'verify_archive'), self.assertRaisesRegex(ValueError, 'Unsafe'):
                    recovery.extract_verified(source, Path(directory) / 'output')
                self.assertFalse((Path(directory) / 'output').exists())

    def test_existing_download_reused_without_network(self):
        with tempfile.TemporaryDirectory() as directory:
            destination = Path(directory) / 'archive.tgz'
            destination.write_bytes(b'previous verified bytes')
            with patch.object(recovery.urllib.request, 'urlopen') as network:
                recovery.fetch('https://registry.npmjs.org/example', destination)
                network.assert_not_called()
            self.assertEqual(destination.read_bytes(), b'previous verified bytes')
            self.assertFalse(destination.with_suffix('.tgz.partial').exists())

    def test_existing_partial_preserved_without_network(self):
        with tempfile.TemporaryDirectory() as directory:
            destination = Path(directory) / 'archive.tgz'
            partial = destination.with_suffix('.tgz.partial')
            partial.write_bytes(b'interrupted evidence')
            with patch.object(recovery.urllib.request, 'urlopen') as network:
                with self.assertRaisesRegex(ValueError, 'partial download preserved'):
                    recovery.fetch('https://registry.npmjs.org/example', destination)
                network.assert_not_called()
            self.assertEqual(partial.read_bytes(), b'interrupted evidence')

    def test_failed_new_download_cleans_only_its_partial(self):
        with tempfile.TemporaryDirectory() as directory:
            destination = Path(directory) / 'archive.tgz'
            with patch.object(recovery.urllib.request, 'urlopen', side_effect=OSError('offline')):
                with self.assertRaises(OSError):
                    recovery.fetch('https://registry.npmjs.org/example', destination)
            self.assertFalse(destination.exists())
            self.assertFalse(destination.with_suffix('.tgz.partial').exists())

    def test_activation_checks_entire_existing_tree_before_any_change(self):
        with tempfile.TemporaryDirectory() as directory:
            staging, output = Path(directory) / 'stage', Path(directory) / 'output'
            staging.mkdir(); output.mkdir()
            (staging / 'encoder').write_bytes(b'new encoder')
            (staging / 'config').write_bytes(b'new config')
            (output / 'encoder').write_bytes(b'previous encoder')
            (output / 'config').write_bytes(b'previous config')
            with self.assertRaisesRegex(ValueError, 'differs; preserved'):
                recovery.activate_verified(staging, output)
            self.assertEqual((output / 'encoder').read_bytes(), b'previous encoder')
            self.assertEqual((output / 'config').read_bytes(), b'previous config')

    def test_activation_reuses_identical_tree_and_rejects_symlinks(self):
        with tempfile.TemporaryDirectory() as directory:
            staging, output = Path(directory) / 'stage', Path(directory) / 'output'
            staging.mkdir(); output.mkdir()
            (staging / 'config').write_bytes(b'verified')
            (output / 'config').write_bytes(b'verified')
            recovery.activate_verified(staging, output)
            self.assertTrue(staging.exists())
            (output / 'config').unlink()
            (output / 'config').symlink_to(staging / 'config')
            with self.assertRaises(ValueError):
                recovery.activate_verified(staging, output)

    def test_validated_new_tree_activates_as_complete_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            staging, output = Path(directory) / 'stage', Path(directory) / 'runtime'
            staging.mkdir()
            (staging / 'encoder').write_bytes(b'verified encoder')
            (staging / 'config').write_bytes(b'verified config')
            recovery.activate_verified(staging, output)
            self.assertFalse(staging.exists())
            self.assertEqual((output / 'encoder').read_bytes(), b'verified encoder')
            self.assertEqual((output / 'config').read_bytes(), b'verified config')

    def test_failed_derivation_never_touches_runtime_assets(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            output, custody = root / 'runtime', root / 'custody'
            output.mkdir(); custody.mkdir()
            (output / 'encoder.onnx').write_bytes(b'previous encoder')
            (output / 'config.properties').write_bytes(b'previous configuration')
            (custody / 'npm-metadata.json').write_text(json.dumps({'name': 'sts-whisper-small', 'version': recovery.VERSION, 'dist': {'integrity': recovery.INTEGRITY, 'tarball': recovery.ARCHIVE}}))
            with patch('sys.argv', ['fetch', '--recovery', str(custody), '--output', str(output)]), patch.object(recovery, 'fetch'), patch.object(recovery, 'verify_registry_signature'), patch.object(recovery, 'extract_verified'), patch.object(recovery, 'derive_assets', side_effect=ValueError('ONNX invalid')):
                with self.assertRaisesRegex(ValueError, 'ONNX invalid'):
                    recovery.main()
            self.assertEqual((output / 'encoder.onnx').read_bytes(), b'previous encoder')
            self.assertEqual((output / 'config.properties').read_bytes(), b'previous configuration')
            self.assertEqual(list(root.glob('.whisper-runtime-*')), [])

    def test_preserve_receipt_rejects_changed_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            receipt = Path(directory) / 'receipt'
            recovery.preserve_bytes(receipt, b'original')
            recovery.preserve_bytes(receipt, b'original')
            with self.assertRaisesRegex(ValueError, 'preserved'):
                recovery.preserve_bytes(receipt, b'changed')
            self.assertEqual(receipt.read_bytes(), b'original')

if __name__ == '__main__':
    unittest.main()
