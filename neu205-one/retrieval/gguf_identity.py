#!/usr/bin/env python3
"""Read a GGUF file's identity without loading weights (stdlib only).

Prints architecture, general.name/basename/size_label, file_type (quantization), context length,
chat template hash, tensor count, file size and SHA-256. Use on the owner's phone `qwen.gguf`
(copied privately) to replace MODEL_ID_UNVERIFIED with evidence.
"""
import hashlib, json, os, struct, sys

FILE_TYPES = {0: "F32", 1: "F16", 2: "Q4_0", 3: "Q4_1", 7: "Q8_0", 8: "Q5_0", 9: "Q5_1", 10: "Q2_K", 11: "Q3_K_S",
              12: "Q3_K_M", 13: "Q3_K_L", 14: "Q4_K_S", 15: "Q4_K_M", 16: "Q5_K_S", 17: "Q5_K_M", 18: "Q6_K",
              19: "IQ2_XXS", 20: "IQ2_XS", 24: "IQ1_S", 25: "IQ4_NL", 26: "IQ3_S", 28: "IQ4_XS", 32: "BF16",
              36: "TQ1_0", 37: "TQ2_0"}


def _str(f):
    n, = struct.unpack("<Q", f.read(8))
    return f.read(n).decode("utf-8", "replace")


def _val(f, t):
    fmt = {0: "<B", 1: "<b", 2: "<H", 3: "<h", 4: "<I", 5: "<i", 6: "<f", 7: "<?", 10: "<Q", 11: "<q", 12: "<d"}
    if t in fmt:
        return struct.unpack(fmt[t], f.read(struct.calcsize(fmt[t])))[0]
    if t == 8:
        return _str(f)
    if t == 9:
        it, = struct.unpack("<I", f.read(4)); n, = struct.unpack("<Q", f.read(8))
        vals = [_val(f, it) for _ in range(n)]
        return {"array_len": n} if n > 16 else vals
    raise ValueError("unknown GGUF type %d" % t)


def identity(path, hash_file=True):
    with open(path, "rb") as f:
        if f.read(4) != b"GGUF":
            raise ValueError("not a GGUF file")
        ver, = struct.unpack("<I", f.read(4)); nt, = struct.unpack("<Q", f.read(8)); nkv, = struct.unpack("<Q", f.read(8))
        kv = {}
        for _ in range(nkv):
            k = _str(f); t, = struct.unpack("<I", f.read(4)); kv[k] = _val(f, t)
    arch = kv.get("general.architecture", "?")
    tmpl = kv.get("tokenizer.chat_template", "")
    out = {"gguf_version": ver, "tensor_count": nt, "architecture": arch,
           "name": kv.get("general.name"), "basename": kv.get("general.basename"), "size_label": kv.get("general.size_label"),
           "finetune": kv.get("general.finetune"), "quantization": FILE_TYPES.get(kv.get("general.file_type"), kv.get("general.file_type")),
           "context_length": kv.get(f"{arch}.context_length"), "block_count": kv.get(f"{arch}.block_count"),
           "embedding_length": kv.get(f"{arch}.embedding_length"), "license": kv.get("general.license"),
           "chat_template_sha256": hashlib.sha256(tmpl.encode()).hexdigest() if tmpl else None,
           "file_bytes": os.path.getsize(path)}
    if hash_file:
        h = hashlib.sha256()
        with open(path, "rb") as f:
            for b in iter(lambda: f.read(1 << 22), b""):
                h.update(b)
        out["sha256"] = h.hexdigest()
    return out


if __name__ == "__main__":
    print(json.dumps(identity(sys.argv[1], "--no-hash" not in sys.argv), indent=1))
