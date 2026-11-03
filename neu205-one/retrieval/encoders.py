"""Pretrained ONNX text encoders for evidence ranking (never for answering).

- WordPiece: BERT uncased basic tokenizer + greedy longest-match WordPiece, from tokenizer.json.
- BiEncoder: bge-small-en-v1.5 (CLS pooling, L2 norm, query instruction prefix) or
  all-MiniLM-L6-v2 (mean pooling, L2 norm).
- CrossEncoder: ms-marco-MiniLM-L-6-v2 relevance logit for (query, passage) pairs.
Only numpy + onnxruntime. Model files are owner-private assets with recorded SHA-256.
"""
import json, os, time, unicodedata
import numpy as np
import onnxruntime as ort


class WordPiece:
    def __init__(self, tokenizer_json, max_len=256):
        tj = json.load(open(tokenizer_json, encoding="utf-8"))
        self.vocab = tj["model"]["vocab"]
        self.unk = self.vocab["[UNK]"]; self.cls = self.vocab["[CLS]"]; self.sep = self.vocab["[SEP]"]
        self.max_len = max_len

    @staticmethod
    def _basic(text):
        text = unicodedata.normalize("NFD", text.lower())
        text = "".join(c for c in text if unicodedata.category(c) != "Mn")
        out, cur = [], []
        for ch in text:
            cat = unicodedata.category(ch)
            if ch.isspace():
                if cur: out.append("".join(cur)); cur = []
            elif cat.startswith("P") or (33 <= ord(ch) <= 47) or (58 <= ord(ch) <= 64) or (91 <= ord(ch) <= 96) or (123 <= ord(ch) <= 126):
                if cur: out.append("".join(cur)); cur = []
                out.append(ch)
            elif cat in ("Cc", "Cf"):
                continue
            else:
                cur.append(ch)
        if cur: out.append("".join(cur))
        return out

    def wordpiece(self, word):
        if len(word) > 100:
            return [self.unk]
        ids, start = [], 0
        while start < len(word):
            end, piece = len(word), None
            while start < end:
                sub = word[start:end] if start == 0 else "##" + word[start:end]
                if sub in self.vocab:
                    piece = self.vocab[sub]; break
                end -= 1
            if piece is None:
                return [self.unk]
            ids.append(piece); start = end
        return ids

    def encode(self, text, pair=None):
        a = [i for w in self._basic(text) for i in self.wordpiece(w)]
        if pair is None:
            a = a[: self.max_len - 2]
            ids = [self.cls] + a + [self.sep]
            return ids, [0] * len(ids)
        b = [i for w in self._basic(pair) for i in self.wordpiece(w)]
        b = b[: max(0, self.max_len - 3 - len(a[:64]))]
        a = a[:64]
        ids = [self.cls] + a + [self.sep] + b + [self.sep]
        return ids, [0] * (len(a) + 2) + [1] * (len(b) + 1)


def _session(path, threads=4):
    so = ort.SessionOptions(); so.intra_op_num_threads = threads; so.inter_op_num_threads = 1
    return ort.InferenceSession(path, so, providers=["CPUExecutionProvider"])


def _batch(seqs):
    n = max(len(s[0]) for s in seqs)
    ids = np.zeros((len(seqs), n), np.int64); tt = np.zeros_like(ids); am = np.zeros_like(ids)
    for i, (a, t) in enumerate(seqs):
        ids[i, :len(a)] = a; tt[i, :len(t)] = t; am[i, :len(a)] = 1
    return ids, tt, am


class BiEncoder:
    def __init__(self, onnx_path, tokenizer_json, pooling, query_prefix="", max_len=256, threads=4):
        t0 = time.perf_counter()
        self.sess = _session(onnx_path, threads)
        self.tok = WordPiece(tokenizer_json, max_len)
        self.pooling, self.query_prefix = pooling, query_prefix
        self.inputs = [i.name for i in self.sess.get_inputs()]
        self.load_ms = (time.perf_counter() - t0) * 1e3

    def _run(self, texts):
        ids, tt, am = _batch([self.tok.encode(t) for t in texts])
        feed = {"input_ids": ids, "attention_mask": am}
        if "token_type_ids" in self.inputs:
            feed["token_type_ids"] = tt
        h = self.sess.run(None, feed)[0]  # last_hidden_state [B,T,H]
        if self.pooling == "cls":
            v = h[:, 0]
        else:
            m = am[..., None].astype(np.float32)
            v = (h * m).sum(1) / np.maximum(m.sum(1), 1e-9)
        return v / np.linalg.norm(v, axis=1, keepdims=True)

    def encode_docs(self, texts, batch=32):
        return np.vstack([self._run(texts[i:i + batch]) for i in range(0, len(texts), batch)]).astype(np.float32)

    def encode_query(self, text):
        return self._run([self.query_prefix + text])[0]


class CrossEncoder:
    def __init__(self, onnx_path, tokenizer_json, max_len=320, threads=4):
        self.sess = _session(onnx_path, threads)
        self.tok = WordPiece(tokenizer_json, max_len)
        self.inputs = [i.name for i in self.sess.get_inputs()]

    def score(self, query, passages):
        ids, tt, am = _batch([self.tok.encode(query, p) for p in passages])
        feed = {"input_ids": ids, "attention_mask": am}
        if "token_type_ids" in self.inputs:
            feed["token_type_ids"] = tt
        return self.sess.run(None, feed)[0][:, 0]
