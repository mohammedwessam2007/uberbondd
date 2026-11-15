#!/usr/bin/env python3
"""Reference Whisper (HF/transformers.js ONNX export) runner for host benchmarking.

This is the algorithmic reference the Android Java implementation (WhisperOnnx.java)
mirrors: Slaney log-mel, optional shortened encoder window, domain prompt
(<|startofprev|>), KV-cached greedy decoding, special-token suppression.
Only numpy + onnxruntime (already installed locally) are used.
"""
import json, os, re, sys, time, wave
import numpy as np
import onnxruntime as ort

SR = 16000
N_FFT = 400
HOP = 160

SOT, EOT, EN, TRANSCRIBE, NOTS, SOPREV = 50258, 50257, 50259, 50359, 50363, 50361


def mel_filters(n_mels=80):
    # librosa.filters.mel(sr=16000, n_fft=400, n_mels=n_mels, htk=False, norm='slaney')
    fmin, fmax = 0.0, SR / 2
    def hz_to_mel(f):
        f = np.asanyarray(f, dtype=np.float64)
        f_sp = 200.0 / 3
        mels = f / f_sp
        min_log_hz = 1000.0
        min_log_mel = min_log_hz / f_sp
        logstep = np.log(6.4) / 27.0
        return np.where(f >= min_log_hz, min_log_mel + np.log(np.maximum(f, 1e-10) / min_log_hz) / logstep, mels)
    def mel_to_hz(m):
        m = np.asanyarray(m, dtype=np.float64)
        f_sp = 200.0 / 3
        freqs = f_sp * m
        min_log_hz = 1000.0
        min_log_mel = min_log_hz / f_sp
        logstep = np.log(6.4) / 27.0
        return np.where(m >= min_log_mel, min_log_hz * np.exp(logstep * (m - min_log_mel)), freqs)
    fftfreqs = np.linspace(0, SR / 2, 1 + N_FFT // 2)
    mel_f = mel_to_hz(np.linspace(hz_to_mel(fmin), hz_to_mel(fmax), n_mels + 2))
    fdiff = np.diff(mel_f)
    ramps = mel_f[:, None] - fftfreqs[None, :]
    w = np.zeros((n_mels, len(fftfreqs)))
    for i in range(n_mels):
        lower = -ramps[i] / fdiff[i]
        upper = ramps[i + 2] / fdiff[i + 1]
        w[i] = np.maximum(0, np.minimum(lower, upper))
    enorm = 2.0 / (mel_f[2:n_mels + 2] - mel_f[:n_mels])
    w *= enorm[:, None]
    return w.astype(np.float32)


_MEL = mel_filters()
_WIN = (0.5 - 0.5 * np.cos(2 * np.pi * np.arange(N_FFT) / N_FFT)).astype(np.float32)  # periodic hann


def log_mel(audio, n_frames):
    """audio float32 at 16 kHz; returns [80, n_frames] like WhisperFeatureExtractor."""
    n_samples = n_frames * HOP
    a = np.zeros(n_samples, np.float32)
    a[:min(len(audio), n_samples)] = audio[:n_samples]
    pad = N_FFT // 2
    x = np.pad(a, (pad, pad), mode="reflect")
    nfr = 1 + (len(x) - N_FFT) // HOP
    idx = np.arange(N_FFT)[None, :] + HOP * np.arange(nfr)[:, None]
    frames = x[idx] * _WIN
    spec = np.abs(np.fft.rfft(frames, axis=1)) ** 2
    spec = spec[:-1]  # drop last frame -> n_frames
    mel = _MEL @ spec.T
    lg = np.log10(np.maximum(mel, 1e-10))
    lg = np.maximum(lg, lg.max() - 8.0)
    return ((lg + 4.0) / 4.0).astype(np.float32)


class BPE:
    def __init__(self, model_dir):
        self.vocab = json.load(open(os.path.join(model_dir, "vocab.json")))
        self.inv = {v: k for k, v in self.vocab.items()}
        added = json.load(open(os.path.join(model_dir, "added_tokens.json")))
        for k, v in added.items():
            self.inv[v] = k
        merges = [tuple(l.split()) for l in open(os.path.join(model_dir, "merges.txt")).read().split("\n")[1:] if l.strip()]
        self.ranks = {m: i for i, m in enumerate(merges)}
        bs = list(range(ord("!"), ord("~") + 1)) + list(range(ord("¡"), ord("¬") + 1)) + list(range(ord("®"), ord("ÿ") + 1))
        cs = bs[:]
        n = 0
        for b in range(256):
            if b not in bs:
                bs.append(b); cs.append(256 + n); n += 1
        self.b2u = {b: chr(c) for b, c in zip(bs, cs)}
        self.u2b = {v: k for k, v in self.b2u.items()}
        self.pat = re.compile(r"""'s|'t|'re|'ve|'m|'ll|'d| ?[A-Za-z]+| ?[0-9]+| ?[^\sA-Za-z0-9]+|\s+(?!\S)|\s+""")

    def _bpe(self, word):
        parts = list(word)
        while len(parts) > 1:
            pairs = [(self.ranks.get((parts[i], parts[i + 1]), 1 << 30), i) for i in range(len(parts) - 1)]
            r, i = min(pairs)
            if r == 1 << 30:
                break
            parts = parts[:i] + [parts[i] + parts[i + 1]] + parts[i + 2:]
        return parts

    def encode(self, text):
        ids = []
        for tok in self.pat.findall(text):
            u = "".join(self.b2u[b] for b in tok.encode("utf-8"))
            ids += [self.vocab[p] for p in self._bpe(u)]
        return ids

    def decode(self, ids):
        s = "".join(self.inv.get(i, "") for i in ids if i < 50257)
        return bytearray(self.u2b[c] for c in s if c in self.u2b).decode("utf-8", "replace")


class Whisper:
    def __init__(self, model_dir, threads=4):
        so = ort.SessionOptions()
        so.intra_op_num_threads = threads
        so.inter_op_num_threads = 1
        t0 = time.perf_counter()
        self.enc = ort.InferenceSession(os.path.join(model_dir, "onnx/" + os.environ.get("NEU_ENCODER", "encoder_dyn_quantized.onnx") + ""), so, providers=["CPUExecutionProvider"])
        self.dec = ort.InferenceSession(os.path.join(model_dir, "onnx/decoder_model_merged_quantized.onnx"), so, providers=["CPUExecutionProvider"])
        self.load_ms = (time.perf_counter() - t0) * 1000
        self.tok = BPE(model_dir)
        gc = json.load(open(os.path.join(model_dir, "generation_config.json")))
        self.suppress = np.array(gc["suppress_tokens"], dtype=np.int64)
        cfg = json.load(open(os.path.join(model_dir, "config.json")))
        self.layers = cfg["decoder_layers"]
        self.heads = cfg["decoder_attention_heads"]
        self.dim = cfg["d_model"] // self.heads
        self.enc_out = [o.name for o in self.enc.get_outputs()][0]

    def transcribe(self, audio, window_s=30.0, prompt=None, max_tokens=64):
        t0 = time.perf_counter()
        n_frames = int(round(window_s * 100))
        n_frames = min(3000, max(200, n_frames - n_frames % 2))
        feats = log_mel(audio, n_frames)[None]
        t1 = time.perf_counter()
        hs = self.enc.run([self.enc_out], {"input_features": feats})[0]
        t2 = time.perf_counter()
        prefix = []
        if prompt:
            prefix = [SOPREV] + self.tok.encode(" " + prompt.strip())[-120:]
        ids = prefix + [SOT, EN, TRANSCRIBE, NOTS]
        L, H, D = self.layers, self.heads, self.dim
        empty = np.zeros((1, H, 0, D), np.float32)
        feed = {"input_ids": np.array([ids], np.int64), "encoder_hidden_states": hs,
                "use_cache_branch": np.array([False])}
        for i in range(L):
            for k in ("decoder.key", "decoder.value", "encoder.key", "encoder.value"):
                feed[f"past_key_values.{i}.{k}"] = empty
        out_names = [o.name for o in self.dec.get_outputs()]
        out_tokens = []
        enc_kv = None
        for step in range(max_tokens):
            res = dict(zip(out_names, self.dec.run(out_names, feed)))
            logits = res["logits"][0, -1].copy()
            logits[self.suppress] = -np.inf
            logits[50258:] = -np.inf  # no special tokens except EOT (50257)
            if step == 0:
                logits[[220, EOT]] = -np.inf  # begin_suppress_tokens
            nxt = int(np.argmax(logits))
            if nxt == EOT:
                break
            out_tokens.append(nxt)
            if enc_kv is None:
                enc_kv = {f"past_key_values.{i}.encoder.{k}": res[f"present.{i}.encoder.{k}"] for i in range(L) for k in ("key", "value")}
            feed = {"input_ids": np.array([[nxt]], np.int64), "encoder_hidden_states": hs,
                    "use_cache_branch": np.array([True])}
            feed.update(enc_kv)
            for i in range(L):
                for k in ("key", "value"):
                    feed[f"past_key_values.{i}.decoder.{k}"] = res[f"present.{i}.decoder.{k}"]
            # repetition guard: stop on 4x repeated token run (hallucination loop)
            if len(out_tokens) >= 8 and len(set(out_tokens[-8:])) <= 2:
                break
        t3 = time.perf_counter()
        text = self.tok.decode(out_tokens).strip()
        return text, {"mel_ms": (t1 - t0) * 1e3, "enc_ms": (t2 - t1) * 1e3, "dec_ms": (t3 - t2) * 1e3,
                      "tokens": len(out_tokens), "total_ms": (t3 - t0) * 1e3}


def read_wav(path):
    with wave.open(path, "rb") as w:
        sr, ch, sw, n = w.getframerate(), w.getnchannels(), w.getsampwidth(), w.getnframes()
        raw = w.readframes(n)
    a = np.frombuffer(raw, dtype=np.int16 if sw == 2 else np.uint8).astype(np.float32)
    if sw == 2:
        a /= 32768.0
    else:
        a = (a - 128) / 128.0
    if ch > 1:
        a = a.reshape(-1, ch).mean(1)
    if sr != SR:  # linear resample (fixtures only)
        x = np.linspace(0, len(a) - 1, int(len(a) * SR / sr))
        a = np.interp(x, np.arange(len(a)), a).astype(np.float32)
    return a


if __name__ == "__main__":
    m = Whisper(sys.argv[1])
    for p in sys.argv[2:]:
        print(p, m.transcribe(read_wav(p)))
