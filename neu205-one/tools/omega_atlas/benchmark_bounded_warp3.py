#!/usr/bin/env python3
"""Reproduce the exposed 150-question DEV WARP3 experiment; write aggregates only.

This is a single-process research benchmark. It requires the original private
archive and must not export questions, quotations, source pages or keys. The
word-budget experiment is not a measurement of the native model token budget.
"""
import argparse
import json
import math
import os
import re
import statistics
import time
import zipfile
from pathlib import Path

from warp2_offline_page_index import SparseTfidf, extract_verified_pages, hash_bytes
from warp3_evidence_packets import WARP3


def normalized(text):
    return re.sub(r'\W+', ' ', text.casefold()).strip()


def percentile(values, fraction):
    return sorted(values)[math.ceil(fraction * len(values)) - 1]


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
    bounded_scores = SparseTfidf.scores_in_ranges
    times = {'full': [], 'bounded': []}
    hits = {'full': 0, 'bounded': 0}
    different_selections = 0
    score_mismatches = 0
    misses = {'candidate_page_absent': 0, 'complete_quote_not_in_candidate_windows': 0,
              'complete_quote_in_candidate_windows_but_not_packet': 0}
    try:
        for number, case in enumerate(cases):
            question = case['question']
            needle = normalized(case['source_quote'])
            def contains(window_id):
                window = index.windows[window_id]
                return needle in normalized(pages[window.page - 1][window.char_start:window.char_end])
            selected = {}
            for method in (('full', 'bounded') if number % 2 == 0 else ('bounded', 'full')):
                SparseTfidf.scores_in_ranges = (lambda self, query, ranges: self.scores(query)) if method == 'full' else bounded_scores
                start = time.perf_counter()
                packet = index.pack(question, max_windows=8, word_budget=600)
                times[method].append((time.perf_counter() - start) * 1000)
                selected[method] = packet['window_ids']
                hits[method] += int(any(contains(i) for i in selected[method]))
            different_selections += int(selected['full'] != selected['bounded'])
            page_ids = [item['page'] for item in index.locator.candidate_pages(question)['pages']]
            ranges = sorted((index.by_page[p][0], index.by_page[p][-1] + 1) for p in page_ids)
            for sparse in (index.char_index, index.word_index):
                all_scores = sparse.scores(question)
                restricted = bounded_scores(sparse, question, ranges)
                for start, end in ranges:
                    for document_id in range(start, end):
                        score_mismatches += int(all_scores.get(document_id, 0) != restricted.get(document_id, 0))
            if not any(contains(i) for i in selected['bounded']):
                if not any(page in page_ids for page in case['pages']):
                    misses['candidate_page_absent'] += 1
                elif not any(contains(i) for page in page_ids for i in index.by_page[page]):
                    misses['complete_quote_not_in_candidate_windows'] += 1
                else:
                    misses['complete_quote_in_candidate_windows_but_not_packet'] += 1
    finally:
        SparseTfidf.scores_in_ranges = bounded_scores
    output = {
        'evaluation_class': 'HISTORICAL_EXPOSED_DEV_ONLY_NOT_MEDICAL_ANSWERS',
        'number_of_questions': len(cases), 'pdf_sha256': hash_bytes(pdf),
        'window_words': 120, 'stride_words': 40, 'word_budget': 600,
        'max_windows': 8, 'alternating_order': True,
        'normalized_quote_hits': hits, 'different_selected_window_ids': different_selections,
        'candidate_window_score_mismatches': score_mismatches, 'miss_classification': misses,
        'host_lookup_ms': {name: {'p50': round(statistics.median(values), 3),
                                  'p95': round(percentile(values, .95), 3)}
                           for name, values in times.items()},
        'model_inference_or_android_measured': False,
        'semantic_entailment_or_medical_correctness_measured': False,
    }
    # Do not replace an earlier receipt; the experiment may be run repeatedly.
    # This output is aggregate-only, but preserve it in a private file anyway.
    fd = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as stream:
        json.dump(output, stream, indent=2, sort_keys=True)
        stream.write('\n')
    print(json.dumps(output, sort_keys=True))


if __name__ == '__main__':
    main()
