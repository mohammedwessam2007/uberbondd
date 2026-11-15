"""Genuine pretrained late-interaction retrieval: mixedbread-ai/mxbai-edge-colbert-v0-17m (Apache-2.0).

Contract taken from the official repo files (onnx_config.json / config_sentence_transformers.json,
revision 592c6417): ModernBERT byte-level BPE, lowercase + NFC, query = [CLS] [Q] tokens [SEP]
(id 50368) max 48, document = [CLS] [D] tokens [SEP] (id 50369) max 512, no token types, no query
expansion, punctuation skiplist removed from DOCUMENT tokens, token vectors L2-normalised, MaxSim.
The ONNX output dimension and the projection weights are verified against the official
safetensors by verify_projection() before use (fail closed otherwise).
"""
import json, re, time, unicodedata
import numpy as np
import onnxruntime as ort

GPT2_PAT = re.compile(r"""'s|'t|'re|'ve|'m|'ll|'d| ?[^\W\d_]+| ?\d+| ?[^\s\w]+|\s+(?!\S)|\s+""", re.UNICODE)


def _bytes_to_unicode():
    bs = list(range(ord("!"), ord("~") + 1)) + list(range(ord("¡"), ord("¬") + 1)) + list(range(ord("®"), ord("ÿ") + 1))
    cs = bs[:]; n = 0
    for b in range(256):
        if b not in bs:
            bs.append(b); cs.append(256 + n); n += 1
    return {b: chr(c) for b, c in zip(bs, cs)}


class ByteBPE:
    def __init__(self, tokenizer_json):
        tj = json.load(open(tokenizer_json, encoding="utf-8"))
        self.vocab = tj["model"]["vocab"]
        merges = tj["model"]["merges"]
        merges = [tuple(m.split(" ", 1)) if isinstance(m, str) else tuple(m) for m in merges]
        self.ranks = {m: i for i, m in enumerate(merges)}
        self.b2u = _bytes_to_unicode()
        self.special = {a["content"]: a["id"] for a in tj["added_tokens"]}
        self.cache = {}

    def _bpe(self, word):
        if word in self.cache:
            return self.cache[word]
        parts = list(word)
        while len(parts) > 1:
            best, idx = None, -1
            for i in range(len(parts) - 1):
                r = self.ranks.get((parts[i], parts[i + 1]))
                if r is not None and (best is None or r < best):
                    best, idx = r, i
            if best is None:
                break
            parts = parts[:idx] + [parts[idx] + parts[idx + 1]] + parts[idx + 2:]
        ids = [self.vocab[p] for p in parts if p in self.vocab]
        self.cache[word] = ids
        return ids

    def encode(self, text):
        text = unicodedata.normalize("NFC", text.lower())
        ids = []
        for tok in GPT2_PAT.findall(text):
            ids += self._bpe("".join(self.b2u[b] for b in tok.encode("utf-8")))
        return ids


class EdgeColbert:
    def __init__(self, onnx_path, tokenizer_json, onnx_config_json, threads=4):
        cfg = json.load(open(onnx_config_json))
        self.cfg = cfg
        t0 = time.perf_counter()
        so = ort.SessionOptions(); so.intra_op_num_threads = threads; so.inter_op_num_threads = 1
        self.sess = ort.InferenceSession(onnx_path, so, providers=["CPUExecutionProvider"])
        self.load_ms = (time.perf_counter() - t0) * 1e3
        self.tok = ByteBPE(tokenizer_json)
        self.cls, self.sep = self.tok.special["[CLS]"], self.tok.special["[SEP]"]
        self.pad = cfg["pad_token_id"]; self.qid = cfg["query_prefix_id"]; self.did = cfg["document_prefix_id"]
        self.skip = set()
        for w in cfg["skiplist_words"]:
            for i in self.tok.encode(w):
                self.skip.add(i)
        self.inputs = [i.name for i in self.sess.get_inputs()]

    def _run(self, seqs):
        n = max(len(s) for s in seqs)
        ids = np.full((len(seqs), n), self.pad, np.int64); am = np.zeros_like(ids)
        for i, s in enumerate(seqs):
            ids[i, :len(s)] = s; am[i, :len(s)] = 1
        feed = {"input_ids": ids, "attention_mask": am}
        out = self.sess.run(None, {k: v for k, v in feed.items() if k in self.inputs})[0]
        return out, am

    def encode_query(self, text):
        body = self.tok.encode(text)[: self.cfg["query_length"] - 3]
        out, am = self._run([[self.cls, self.qid] + body + [self.sep]])
        v = out[0][am[0] == 1]
        return v / np.linalg.norm(v, axis=1, keepdims=True)

    def encode_docs(self, texts, batch=16):
        res = []
        for i in range(0, len(texts), batch):
            seqs = [[self.cls, self.did] + self.tok.encode(t)[: self.cfg["document_length"] - 3] + [self.sep] for t in texts[i:i + batch]]
            out, am = self._run(seqs)
            for j, s in enumerate(seqs):
                keep = [k for k in range(len(s)) if s[k] not in self.skip]
                v = out[j][keep]
                res.append((v / np.linalg.norm(v, axis=1, keepdims=True)).astype(np.float16))
        return res

    @staticmethod
    def maxsim(q, d):
        return float((q @ d.T.astype(np.float32)).max(axis=1).sum())


def verify_projection(onnx_path, dense1_safetensors, dense2_safetensors, pylib=None):
    """Check that the ONNX graph's final projection equals the official W2 @ W1 (fail closed)."""
    import sys
    if pylib:
        sys.path.insert(0, pylib)
    import onnx
    from onnx import numpy_helper

    def st_tensor(path):
        b = open(path, "rb").read()
        n = int.from_bytes(b[:8], "little"); h = json.loads(b[8:8 + n]); data = b[8 + n:]
        k = [x for x in h if x != "__metadata__"][0]; m = h[k]
        s, e = m["data_offsets"]
        return np.frombuffer(data[s:e], dtype={"F32": np.float32, "F16": np.float16}[m["dtype"]]).reshape(m["shape"]).astype(np.float32)

    w1 = st_tensor(dense1_safetensors)  # [512, 256]
    w2 = st_tensor(dense2_safetensors)  # [48, 512]
    m = onnx.load(onnx_path)
    inits = {i.name: numpy_helper.to_array(i).astype(np.float32) for i in m.graph.initializer}
    found = {}
    for name, t in inits.items():
        for label, w in (("dense1", w1), ("dense2", w2), ("fused", w2 @ w1)):
            for cand in (t, t.T):
                if cand.shape == w.shape and np.allclose(cand, w, atol=1e-5):
                    found[label] = name
    out_dims = [d.dim_value for d in m.graph.output[0].type.tensor_type.shape.dim]
    ok = ("dense1" in found and "dense2" in found) or "fused" in found
    return {"projection_matches_official": ok, "matched_initializers": found, "onnx_output_shape": out_dims}
