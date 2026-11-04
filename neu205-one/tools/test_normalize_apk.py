import tempfile
import unittest
import zipfile
from pathlib import Path
from normalize_apk import normalize


class Normalization(unittest.TestCase):
    def test_bytes_are_identical_despite_input_order_and_timestamp(self):
        with tempfile.TemporaryDirectory() as tmp:
            r = Path(tmp)
            for variant in [0, 1]:
                with zipfile.ZipFile(r / f'in{variant}.apk', 'w') as z:
                    for name in (['classes.dex', 'assets/model.onnx'] if variant else ['assets/model.onnx', 'classes.dex']):
                        i = zipfile.ZipInfo(name, (2024 + variant, 1, 1, 0, 0, 0))
                        i.compress_type = zipfile.ZIP_STORED if name.endswith('onnx') else zipfile.ZIP_DEFLATED
                        z.writestr(i, name.encode())
                normalize(r / f'in{variant}.apk', r / f'out{variant}.apk')
            self.assertEqual((r / 'out0.apk').read_bytes(), (r / 'out1.apk').read_bytes())
            with zipfile.ZipFile(r / 'out0.apk') as z:
                self.assertEqual(zipfile.ZIP_STORED, z.getinfo('assets/model.onnx').compress_type)

    def test_signed_v1_archive_is_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            r = Path(tmp)
            with zipfile.ZipFile(r / 'in.apk', 'w') as z:
                z.writestr('META-INF/CERT.RSA', 'signature')
            with self.assertRaises(ValueError):
                normalize(r / 'in.apk', r / 'out.apk')


if __name__ == '__main__':
    unittest.main()
