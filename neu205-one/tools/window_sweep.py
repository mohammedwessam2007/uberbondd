import json, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from whisper_host import Whisper, read_wav
from asr_bench import wer, TOC_PROMPT
root, corpus_path, out = sys.argv[1:4]
corpus = json.load(open(corpus_path))
res = []
for name in ("base", "small"):
    m = Whisper(f"{root}/sts-whisper-{name}/package/models/Xenova/whisper-{name}")
    audio = [read_wav(c["wav"]) for c in corpus]
    m.transcribe(audio[0])
    for win in (8.0, 10.0, 15.0, 20.0):
        for prompt in (False, True):
            e = n = 0; lat = []; hyps = []
            for c, a in zip(corpus, audio):
                t, tm = m.transcribe(a, window_s=win, prompt=TOC_PROMPT if prompt else None)
                ee, nn = wer(c["reference"], t); e += ee; n += nn; lat.append(tm["total_ms"]); hyps.append(t)
            lat.sort()
            r = {"model": name, "window_s": win, "prompt": prompt, "wer": round(e / n, 4), "p50_ms": round(lat[5]), "max_ms": round(lat[-1]), "hyps": hyps}
            print(json.dumps({k: v for k, v in r.items() if k != "hyps"}), flush=True); res.append(r)
json.dump(res, open(out, "w"), indent=1)
