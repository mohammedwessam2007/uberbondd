import os, struct, sys, tempfile, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from gguf_identity import identity


def s(x):
    b = x.encode(); return struct.pack("<Q", len(b)) + b


class T(unittest.TestCase):
    def test_synthetic_header(self):
        kv = [("general.architecture", 8, s("qwen3")), ("general.name", 8, s("Qwen3 0.6B")),
              ("general.file_type", 4, struct.pack("<I", 15)), ("qwen3.context_length", 4, struct.pack("<I", 40960)),
              ("tokenizer.chat_template", 8, s("{{x}}"))]
        body = b"GGUF" + struct.pack("<I", 3) + struct.pack("<Q", 0) + struct.pack("<Q", len(kv))
        for k, t, v in kv:
            body += s(k) + struct.pack("<I", t) + v
        with tempfile.NamedTemporaryFile(delete=False, suffix=".gguf") as f:
            f.write(body)
        r = identity(f.name)
        self.assertEqual(r["architecture"], "qwen3"); self.assertEqual(r["quantization"], "Q4_K_M")
        self.assertEqual(r["context_length"], 40960); self.assertEqual(len(r["sha256"]), 64)

    def test_rejects_non_gguf(self):
        with tempfile.NamedTemporaryFile(delete=False) as f:
            f.write(b"NOTGGUF....")
        with self.assertRaises(ValueError):
            identity(f.name)


if __name__ == "__main__":
    unittest.main()
