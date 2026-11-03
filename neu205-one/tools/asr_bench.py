#!/usr/bin/env python3
"""Host ASR benchmark: Whisper tiny/base/small (q8 ONNX) x prompt x encoder window.

Usage: asr_bench.py MODELS_ROOT CORPUS_JSON OUT_JSON
CORPUS_JSON: [{"wav": path, "reference": str, "supported": bool}]
All metrics are HOST, SYNTHETIC-SPEECH, ASR-ONLY. Not phone, not acoustic.
"""
import json, os, re, sys, time
sys.path.insert(0, os.path.dirname(__file__))
from whisper_host import Whisper, read_wav

# Prompt derived only from the course book's table of contents (no test leakage).
TOC_PROMPT = ("NEU205 neuroscience lecture questions about the spinal cord, brain stem, cerebellum, "
              "fourth ventricle, diencephalon, cerebrum, meninges, arterial supply of the brain, scalp, face, "
              "parotid gland, orbit, cervical fascia, carotid sheath, posterior triangle, thyroid gland, "
              "cranial nerves, pharynx, larynx, ear, sensory and motor physiology, histology.")


def norm(s):
    s = s.lower().replace("-", " ")
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    return s.split()


def wer(ref, hyp):
    r, h = norm(ref), norm(hyp)
    d = list(range(len(h) + 1))
    for i in range(1, len(r) + 1):
        prev, d[0] = d[0], i
        for j in range(1, len(h) + 1):
            cur = min(d[j] + 1, d[j - 1] + 1, prev + (r[i - 1] != h[j - 1]))
            prev, d[j] = d[j], cur
    return d[len(h)], len(r)


def main(root, corpus_path, out_path):
    corpus = json.load(open(corpus_path))
    models = {"tiny": "sts-whisper-tiny/package/models/Xenova/whisper-tiny",
              "base": "sts-whisper-base/package/models/Xenova/whisper-base",
              "small": "sts-whisper-small/package/models/Xenova/whisper-small"}
    results = []
    for name, rel in models.items():
        m = Whisper(os.path.join(root, rel))
        audio = [read_wav(c["wav"]) for c in corpus]
        m.transcribe(audio[0])  # warm-up, not counted
        for prompt_on in (False, True):
            for window in ("30s", "dyn"):
                errs = words = exact = 0
                lat = []
                rows = []
                for c, a in zip(corpus, audio):
                    w = 30.0 if window == "30s" else min(30.0, len(a) / 16000 + 1.0)
                    text, t = m.transcribe(a, window_s=w, prompt=TOC_PROMPT if prompt_on else None)
                    e, n = wer(c["reference"], text)
                    errs += e; words += n
                    ex = norm(c["reference"]) == norm(text)
                    exact += ex
                    lat.append(t["total_ms"])
                    rows.append({"reference": c["reference"], "hyp": text, "exact": ex, **{k: round(v, 1) for k, v in t.items()}})
                lat.sort()
                r = {"model": name, "prompt": prompt_on, "window": window, "load_ms": round(m.load_ms),
                     "exact": exact, "n": len(corpus), "wer": round(errs / words, 4),
                     "p50_ms": round(lat[len(lat) // 2]), "max_ms": round(lat[-1]), "rows": rows}
                print(json.dumps({k: r[k] for k in r if k != "rows"}), flush=True)
                results.append(r)
    json.dump({"scope": "HOST x86 4-core, onnxruntime CPU, synthetic espeak speech from v8 receipts; NOT phone/acoustic",
               "toc_prompt": TOC_PROMPT, "results": results}, open(out_path, "w"), indent=1)


if __name__ == "__main__":
    main(*sys.argv[1:4])
