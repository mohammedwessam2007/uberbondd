#!/usr/bin/env python3
"""Host G2: WAV -> Whisper-small (device config: window max(8s, len+1s), no prompt) -> Java dialogue.
Expectations are judged against THIS department book (not v8's cards). HOST/SYNTHETIC ONLY."""
import json, os, subprocess, sys, time
sys.path.insert(0, os.path.dirname(__file__))
from whisper_host import Whisper, read_wav
models, kb, corpus_path, out = sys.argv[1:5]  # argv[5] = private expectations JSON
# expected substring in the spoken reply when the book supports the question; None => must not ANSWER
# Expected substring per reference question (None => must not ANSWER), judged against THIS book.
# Course-derived, so it lives in an owner-private JSON file (argv[5]); the repository is public.
EXPECT = json.load(open(sys.argv[5]))
corpus = json.load(open(corpus_path))
m = Whisper(os.path.join(models, "sts-whisper-small/package/models/Xenova/whisper-small"))
m.transcribe(read_wav(corpus[0]["wav"]))
rows, hyps = [], []
for c in corpus:
    a = read_wav(c["wav"])
    w = min(30.0, max(8.0, len(a) / 16000 + 1.0))
    text, t = m.transcribe(a, window_s=w)
    hyps.append(text)
    rows.append({"reference": c["reference"], "hyp": text, "asr_ms": round(t["total_ms"])})
tf = out + ".transcripts.txt"
open(tf, "w").write("\n".join(hyps) + "\n")
here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
t0 = time.perf_counter()
res = subprocess.run(["java", "-cp", os.path.join(here, "build/core"), "ai.neu205.one.core.tools.BatchAnswer", kb, tf],
                     capture_output=True, text=True).stdout.strip().split("\n")
summary = {"correct": 0, "false_answer": 0, "missed": 0, "correct_abstain": 0}
for r, line in zip(rows, res):
    kind, cite, speech = (line.split("\t") + ["", ""])[:3]
    exp = EXPECT.get(r["reference"], "?")
    if exp is None:
        verdict = "correct_abstain" if kind != "ANSWER" else "false_answer"
    elif kind == "ANSWER" and exp in speech:
        verdict = "correct"
    elif kind == "ANSWER":
        verdict = "false_answer"
    else:
        verdict = "missed"
    summary[verdict] += 1
    r.update({"kind": kind, "citation": cite, "speech": speech, "verdict": verdict})
    print(f"{verdict:16} asr={r['asr_ms']}ms | {r['hyp']!r} -> {kind} {speech[:80]}")
print(json.dumps(summary))
json.dump({"scope": "HOST x86, synthetic espeak speech, Whisper-small q8 ONNX, Java dialogue; NOT phone/acoustic/TTS",
           "summary": summary, "rows": rows}, open(out, "w"), indent=1)
