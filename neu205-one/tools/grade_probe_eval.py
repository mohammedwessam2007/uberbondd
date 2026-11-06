#!/usr/bin/env python3
"""Lexical DEV/regression grader for EXPOSED probe sets (must_contain_any + refusal detection).

Diagnostic only: lexical matching misses paraphrases and can be fooled by a wrong answer that
mentions the right term. Fresh sealed results must use the independent rubric grader instead.
Prints aggregate counts; --show-failures prints ids/codes only (no book text) unless --verbose.
"""
import argparse, json, re, unicodedata
from collections import Counter
from pathlib import Path

REFUSAL = re.compile(r"not_in_book|not (covered|mentioned|found|included|provided|specified|stated|described|discussed)"
                     r"|(does|do) not (say|mention|contain|cover|include|provide|specify|state|describe|discuss)"
                     r"|no (information|mention|details?)|(excerpts?|passages?|text|book|textbook) (do|does) not"
                     r"|insufficient|(cannot|could not|couldn.t) (answer|find|determine|locate)|could you clarify|please clarify|unable to", re.I)


def norm(s):
    s = unicodedata.normalize('NFKC', s).lower()
    return re.sub(r'[^a-z0-9%.+-]+', ' ', s).strip()


def verdict(probe, row):
    ans = row.get('answer', '')
    refused = row.get('status') != 'completed' or bool(REFUSAL.search(ans))
    if probe['kind'] == 'supported':
        hit = any(norm(m) in norm(ans) for m in probe['must_contain_any'])
        return 'correct' if hit else ('refused' if refused else 'wrong')
    return 'correct_refusal' if refused else 'false_answer'


def main():
    a = argparse.ArgumentParser(description=__doc__)
    a.add_argument('--probes', type=Path, required=True)
    a.add_argument('--predictions', type=Path, required=True)
    a.add_argument('--show-failures', action='store_true')
    a.add_argument('--verbose', action='store_true')
    x = a.parse_args()
    probes = {p['id']: p for p in json.loads(x.probes.read_text())}
    rows = [r for r in (json.loads(l) for l in x.predictions.read_text().splitlines() if l.strip()) if r['id'] != '__run__']
    c = Counter(); by_cat = Counter(); ttft = []; codes = Counter()
    for r in rows:
        p = probes[r['id']]; v = verdict(p, r); c[v] += 1; by_cat[(p.get('category'), v)] += 1
        if r.get('failure_code'): codes[r['failure_code']] += 1
        if r.get('ttft_ms'): ttft.append(r['ttft_ms'])
        if x.show_failures and v in ('wrong', 'refused', 'false_answer'):
            line = dict(id=r['id'], verdict=v, code=r.get('failure_code'), gold_pages=p.get('pages'), got_pages=r.get('source_pages'),
                        gold_page_retrieved=bool(set(p.get('pages') or []) & set(r.get('source_pages') or [])))
            if x.verbose: line.update(q=p['question'], must=p.get('must_contain_any'), ans=r.get('answer'))
            print(json.dumps(line))
    ttft.sort()
    pct = lambda q: ttft[min(len(ttft) - 1, int(q * len(ttft)))] if ttft else None
    print(json.dumps(dict(n=len(rows), verdicts=dict(c), pipeline_codes=dict(codes), ttft_p50_ms=pct(.5), ttft_p95_ms=pct(.95),
                          by_category={f'{k[0]}:{k[1]}': v for k, v in sorted(by_cat.items())}), indent=1))


if __name__ == '__main__':
    main()
