#!/usr/bin/env python3
"""Exposed DEV-only, bounded term-coverage rerank experiment; aggregate output only.

No training or question-to-answer mapping: rerank only the 50 highest-ranked
WARP3 windows using compiled word sets and query-term IDF coverage. This is not
an entailment verifier or a production Android implementation.
"""
import argparse
from collections import defaultdict
import json
import math
import os
from pathlib import Path
import re
import statistics
import time
import zipfile

from warp2_offline_page_index import WORD, extract_verified_pages, hash_bytes
from warp3_evidence_packets import WARP3

STOP = frozenset('a an and are as at be by can did do does for from how in is it of on or the their these this to was what when where which who why with'.split())


def ranked_ids(index, question):
    loc = index.locator.candidate_pages(question)
    ranks = {d['page']: i for i, d in enumerate(loc['pages'])}
    ranges = sorted((index.by_page[p][0], index.by_page[p][-1] + 1) for p in ranks)
    char = index.char_index.scores_in_ranges(question, ranges)
    word = index.word_index.scores_in_ranges(question, ranges)
    ids = [i for page in ranks for i in index.by_page[page]]
    ids.sort(key=lambda i: (-((char.get(i, 0) + word.get(i, 0)) / 2 +
                              .045 / (1 + ranks[index.windows[i].page] / 4)), i))
    return ids


def select(index, candidates):
    selected = []
    spent = 0
    counts = defaultdict(int)
    for i in candidates:
        w = index.windows[i]
        if len(selected) == 8:
            break
        if spent + w.words > 600 or counts[w.page] >= 2:
            continue
        if any(other.page == w.page and
               max(0, min(other.char_end, w.char_end) - max(other.char_start, w.char_start)) /
               max(1, min(other.char_end - other.char_start, w.char_end - w.char_start)) > .5
               for other in (index.windows[j] for j in selected)):
            continue
        selected.append(i)
        spent += w.words
        counts[w.page] += 1
    for i in selected:
        index.warrant(i, metadata_only=True)
    return selected, spent


def run(index, word_sets, question, method):
    candidates = ranked_ids(index, question)
    if method == 'coverage_rrf':
        terms = set(WORD.findall(question.casefold())) - STOP
        weights = {term: index.word_index.idf[term] for term in terms if term in index.word_index.idf}
        if weights:
            # Coverage is a separate rank signal, not a source-claim or answer key.
            top = candidates[:50]
            original_rank = {item: rank for rank, item in enumerate(top)}
            coverage_order = sorted(top, key=lambda item: (-sum(weight for term, weight in weights.items()
                                                               if term in word_sets[item]), original_rank[item]))
            coverage_rank = {item: rank for rank, item in enumerate(coverage_order)}
            candidates = sorted(top, key=lambda item: (-(1 / (20 + original_rank[item] + 1) +
                                                           1 / (20 + coverage_rank[item] + 1)), original_rank[item]))
    return select(index, candidates)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--private-zip', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    with zipfile.ZipFile(args.private_zip) as archive:
        pdf = archive.read('private/NEU205 Neuroscience Text Only.pdf')
        cases = [case for name in ('probes_p001_100.json', 'probes_p101_200.json', 'probes_p201_299.json')
                 for case in json.loads(archive.read('private/v05/probes/' + name))
                 if case.get('split') == 'dev' and case.get('kind') == 'supported'
                 and case.get('pages') and case.get('source_quote')]
    if len(cases) != 150:
        raise ValueError('Unexpected historical DEV denominator')
    pages = extract_verified_pages(pdf)
    index = WARP3(pages, hash_bytes(pdf), window_words=120, stride_words=40)
    start = time.perf_counter()
    # Compiled once from original source windows, not from evaluation questions.
    word_sets = [frozenset(WORD.findall(pages[w.page - 1][w.char_start:w.char_end].casefold())) for w in index.windows]
    compile_ms = (time.perf_counter() - start) * 1000
    norm = lambda text: re.sub(r'\W+', ' ', text.casefold()).strip()
    results = {name: {'quote_hits': 0, 'gains': 0, 'losses': 0, 'different_selections': 0,
                      'words': 0, 'times': []} for name in ('baseline', 'coverage_rrf')}
    for n, case in enumerate(cases):
        observed = {}
        needle = norm(case['source_quote'])
        for name in (('baseline', 'coverage_rrf') if n % 2 == 0 else ('coverage_rrf', 'baseline')):
            start = time.perf_counter()
            ids, spent = run(index, word_sets, case['question'], name)
            results[name]['times'].append((time.perf_counter() - start) * 1000)
            hit = any(needle in norm(pages[index.windows[i].page - 1][index.windows[i].char_start:index.windows[i].char_end]) for i in ids)
            observed[name] = (ids, hit)
            results[name]['quote_hits'] += int(hit)
            results[name]['words'] += spent
        if observed['baseline'][0] != index.pack(case['question'], max_windows=8, word_budget=600)['window_ids']:
            raise AssertionError('Benchmark baseline differs from WARP3.pack')
        base_ids, base_hit = observed['baseline']
        for name, (ids, hit) in observed.items():
            results[name]['different_selections'] += int(ids != base_ids)
            results[name]['gains'] += int(hit and not base_hit)
            results[name]['losses'] += int(base_hit and not hit)
    for values in results.values():
        timings = sorted(values.pop('times'))
        values['host_ms_p50'] = round(statistics.median(timings), 3)
        values['host_ms_p95'] = round(timings[math.ceil(.95 * len(timings)) - 1], 3)
        values['mean_packed_words'] = round(values.pop('words') / len(cases), 2)
    receipt = {'evaluation_class': 'HISTORICAL_EXPOSED_DEV_ONLY_NOT_MEDICAL_ANSWERS',
               'number_of_questions': len(cases), 'source_pdf_sha256': hash_bytes(pdf),
               'word_budget': 600, 'window_words': 120, 'stride_words': 40, 'max_windows': 8,
               'rerank_window_limit': 50, 'compiled_window_count': len(word_sets),
               'additional_compile_ms': round(compile_ms, 3), 'baseline_verified_against_pack': True,
               'order': 'alternating', 'source_or_questions_exported': False,
               'clinical_or_model_accuracy_measured': False, 'android_or_model_inference_measured': False,
               'results': results}
    fd = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as stream:
        json.dump(receipt, stream, sort_keys=True, indent=2)
        stream.write('\n')
    print(json.dumps(receipt, sort_keys=True))


if __name__ == '__main__':
    main()
