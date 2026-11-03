#!/usr/bin/env python3
"""Retrieval tournament over independently authored book probes (see docs/PREREGISTRATION_RETRIEVAL_v1.md).

Usage: tournament.py WORKDIR SPLIT[dev|test] probes1.json [probes2.json ...]
WORKDIR holds corpus.jsonl and models/ (owner-private). Writes WORKDIR/tournament_<split>.json.
"""
import json, os, re, sys, time, statistics
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bm25 import BM25, tokens
from encoders import BiEncoder, CrossEncoder

BGE_PREFIX = "Represent this sentence for searching relevant passages: "


def norm(s):
    return re.sub(r"\s+", " ", s.lower()).strip()


def gold_chunks(probe, chunks, ntexts):
    q = norm(probe["source_quote"])
    qt = set(tokens(probe["source_quote"]))
    gold = []
    for i, c in enumerate(chunks):
        if q and q in ntexts[i]:
            gold.append(i)
        elif qt and len(qt & set(c["_tok"])) / len(qt) >= 0.85:
            gold.append(i)
    return set(gold)


def EdgeColbertMax(q, d):
    return float((q @ d.T.astype(np.float32)).max(axis=1).sum())


def rrf(*rankings, k=60):
    s = {}
    for r in rankings:
        for rank, i in enumerate(r):
            s[i] = s.get(i, 0) + 1.0 / (k + rank + 1)
    return [i for i, _ in sorted(s.items(), key=lambda x: -x[1])]


def main(work, split, files):
    chunks = [json.loads(l) for l in open(os.path.join(work, "corpus.jsonl"), encoding="utf-8")]
    texts = [c["section_path"] + " :: " + c["verbatim_text"] for c in chunks]
    ntexts = [norm(c["verbatim_text"]) for c in chunks]
    for c, t in zip(chunks, texts):
        c["_tok"] = tokens(t)
    probes = [p for f in files for p in json.load(open(f)) if p["kind"] == "supported" and (split == "all" or p["split"] == split)]
    golds = [gold_chunks(p, chunks, ntexts) for p in probes]
    no_gold = sum(1 for g in golds if not g)

    t0 = time.perf_counter(); bm = BM25(texts); bm_build = (time.perf_counter() - t0) * 1e3
    M = os.path.join(work, "models")
    enc = {
        "bge_fp32": (os.path.join(M, "bge-small-fp32.onnx"), os.path.join(M, "bge-tokenizer.json"), "cls", BGE_PREFIX),
        "bge_q8": (os.path.join(M, "bge-small-q8.onnx"), os.path.join(M, "bge-tokenizer.json"), "cls", BGE_PREFIX),
        "minilm_q8": (os.path.join(M, "minilm-q8.onnx"), os.path.join(M, "minilm-tokenizer.json"), "mean", ""),
    }
    dense, vecs, meta = {}, {}, {}
    for name, (onnx, tok, pool, pref) in enc.items():
        e = BiEncoder(onnx, tok, pool, pref)
        cache = os.path.join(work, f"vec_{name}.npy")
        if os.path.exists(cache):
            v = np.load(cache)
        else:
            t1 = time.perf_counter(); v = e.encode_docs(texts); meta[name + "_index_build_s"] = round(time.perf_counter() - t1, 1)
            np.save(cache, v)
        dense[name], vecs[name] = e, v
        meta[name + "_load_ms"] = round(e.load_ms); meta[name + "_index_bytes"] = int(v.nbytes); meta[name + "_model_bytes"] = os.path.getsize(onnx)
    ce = CrossEncoder(os.path.join(M, "msmarco-ce.onnx"), os.path.join(M, "msmarco-tokenizer.json"))
    colb, cdocs = None, None
    CB = os.environ.get("NEU205_COLBERT_DIR")
    if CB:  # genuine pretrained mxbai-edge-colbert-v0-17m (projection verified against official weights)
        from colbert import EdgeColbert
        colb = EdgeColbert(os.path.join(CB, "model.onnx"), os.path.join(CB, "tokenizer.json"), os.path.join(CB, "onnx_config.json"))
        cache = os.path.join(work, "colbert_docs.npz")
        if os.path.exists(cache):
            z = np.load(cache); cdocs = [z[f"d{i}"] for i in range(len(texts))]
        else:
            t1 = time.perf_counter(); cdocs = colb.encode_docs(texts); meta["colbert_index_build_s"] = round(time.perf_counter() - t1, 1)
            np.savez(cache, **{f"d{i}": d for i, d in enumerate(cdocs)})
        meta["colbert_load_ms"] = round(colb.load_ms); meta["colbert_index_bytes"] = int(sum(d.nbytes for d in cdocs))

    def run(name, q):
        if name == "bm25":
            return [i for i, _ in bm.search(q, 50)]
        if name in dense:
            s = vecs[name] @ dense[name].encode_query(q)
            return list(np.argsort(-s)[:50])
        if name == "colbert":
            qv = colb.encode_query(q)
            sc = np.array([EdgeColbertMax(qv, d) for d in cdocs])
            return list(np.argsort(-sc, kind="stable")[:50])
        if name == "rrf_colbert":
            return rrf(run("bm25", q), run("colbert", q))[:50]
        if name.startswith("rrf_"):
            d = name[4:].replace("+ce", "")
            r = rrf(run("bm25", q), run(d, q))[:50]
            if name.endswith("+ce"):
                top = r[:30]
                sc = ce.score(q, [texts[i] for i in top])
                r = [top[i] for i in np.argsort(-sc)] + r[30:]
            return r
        if name == "bm25+ce":
            top = run("bm25", q)[:30]
            sc = ce.score(q, [texts[i] for i in top])
            return [top[i] for i in np.argsort(-sc)]
        raise ValueError(name)

    strategies = ["bm25", "bge_fp32", "bge_q8", "minilm_q8", "rrf_bge_fp32", "rrf_bge_q8", "rrf_minilm_q8",
                  "bm25+ce", "rrf_bge_q8+ce", "rrf_bge_fp32+ce"]
    if os.environ.get("NEU205_STRATEGIES"):  # TEST runs evaluate only the pre-registered selections
        strategies = os.environ["NEU205_STRATEGIES"].split(",")
    out = {"split": split, "n_probes": len(probes), "probes_without_gold_chunk": no_gold, "chunks": len(chunks),
           "bm25_build_ms": round(bm_build), "meta": meta, "results": {}}
    for s in strategies:
        hits = {1: 0, 5: 0, 10: 0, 20: 0}; mrr = 0.0; lat = []; page5 = 0
        part = {}
        for p, g in zip(probes, golds):
            t1 = time.perf_counter(); r = run(s, p["question"]); lat.append((time.perf_counter() - t1) * 1e3)
            first = next((k for k, i in enumerate(r[:20]) if i in g), None)
            for k in hits:
                if first is not None and first < k: hits[k] += 1
            if first is not None: mrr += 1.0 / (first + 1)
            pages = set(p["pages"])
            if any(any(chunks[i]["book_pdf_start_page"] - 1 <= pg <= chunks[i]["book_pdf_end_page"] + 1 for pg in pages) for i in r[:5]):
                page5 += 1
            key = "p001-100" if p["pages"][0] <= 100 else ("p101-200" if p["pages"][0] <= 200 else "p201-299")
            part.setdefault(key, [0, 0]); part[key][1] += 1; part[key][0] += int(first is not None and first < 5)
        n = len(probes); lat.sort()
        out["results"][s] = {f"R@{k}": round(v / n, 4) for k, v in hits.items()} | {
            "MRR@20": round(mrr / n, 4), "page_hit@5": round(page5 / n, 4),
            "R@5_by_part": {k: f"{a}/{b}" for k, (a, b) in sorted(part.items())},
            "p50_ms": round(lat[n // 2], 2), "p95_ms": round(lat[int(n * 0.95)], 2)}
        print(s, json.dumps(out["results"][s]), flush=True)
    json.dump(out, open(os.path.join(work, f"tournament_{split}.json"), "w"), indent=1)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3:])
