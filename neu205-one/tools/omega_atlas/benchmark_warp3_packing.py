#!/usr/bin/env python3
"""Exposed DEV-only alternatives to WARP3 ranking and packing, aggregate output only.

This duplicates the research selection algorithm to vary one parameter at a time;
for every question it asserts baseline window IDs equal production WARP3.pack.
It does not modify the runtime, use a fresh exam, or establish medical correctness.
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

from warp2_offline_page_index import extract_verified_pages, hash_bytes
from warp3_evidence_packets import WARP3

# (page prior, maximum overlap, windows per page, word-index weight)
VARIANTS = {
    'baseline': (.045, .5, 2, .5),
    'weak_page_prior': (.02, .5, 2, .5),
    'no_page_prior': (0, .5, 2, .5),
    'strong_page_prior': (.09, .5, 2, .5),
    'more_page_windows': (.045, .5, 3, .5),
    'less_overlap': (.045, .25, 2, .5),
    'more_overlap': (.045, .75, 2, .5),
    'favor_words': (.045, .5, 2, .75),
    'favor_chars': (.045, .5, 2, .25),
}


def pack_variant(index, question, config):
    prior, overlap_limit, page_cap, word_weight = config
    pages = index.locator.candidate_pages(question)['pages']
    page_rank = {item['page']: rank for rank, item in enumerate(pages)}
    ranges = sorted((index.by_page[p][0], index.by_page[p][-1] + 1) for p in page_rank)
    char = index.char_index.scores_in_ranges(question, ranges)
    words = index.word_index.scores_in_ranges(question, ranges)
    ids = [i for page in page_rank for i in index.by_page[page]]
    def key(i):
        c = char.get(i, 0)
        w = words.get(i, 0)
        # Preserve original floating point evaluation order for the baseline.
        similarity = (c + w) / 2 if word_weight == .5 else (1 - word_weight) * c + word_weight * w
        return (-(similarity + prior / (1 + page_rank[index.windows[i].page] / 4)), i)
    ids.sort(key=key)
    selected = []
    spent = 0
    page_counts = defaultdict(int)
    for i in ids:
        candidate = index.windows[i]
        if len(selected) == 8:
            break
        if spent + candidate.words > 600 or page_counts[candidate.page] >= page_cap:
            continue
        if any(other.page == candidate.page and
               max(0, min(other.char_end, candidate.char_end) - max(other.char_start, candidate.char_start)) /
               max(1, min(other.char_end - other.char_start, candidate.char_end - candidate.char_start)) > overlap_limit
               for other in (index.windows[j] for j in selected)):
            continue
        selected.append(i)
        spent += candidate.words
        page_counts[candidate.page] += 1
    # Include the same source hash validation work in every timed candidate.
    for i in selected:
        index.warrant(i, metadata_only=True)
    return selected, spent


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
    norm = lambda text: re.sub(r'\W+', ' ', text.casefold()).strip()
    result = {name: {'quote_hits': 0, 'gains': 0, 'losses': 0, 'different_selections': 0,
                     'total_words': 0, 'times': []} for name in VARIANTS}
    names = list(VARIANTS)
    for n, case in enumerate(cases):
        needle = norm(case['source_quote'])
        output = {}
        # Rotate and reverse execution order across questions to reduce order bias.
        rotation = n % len(names)
        order = names[rotation:] + names[:rotation]
        if n % 2:
            order.reverse()
        for name in order:
            t = time.perf_counter()
            ids, spent = pack_variant(index, case['question'], VARIANTS[name])
            result[name]['times'].append((time.perf_counter() - t) * 1000)
            hit = any(needle in norm(pages[index.windows[i].page - 1][index.windows[i].char_start:index.windows[i].char_end]) for i in ids)
            output[name] = (ids, hit)
            result[name]['quote_hits'] += int(hit)
            result[name]['total_words'] += spent
        if output['baseline'][0] != index.pack(case['question'], max_windows=8, word_budget=600)['window_ids']:
            raise AssertionError('Research baseline differs from WARP3.pack')
        base_ids, base_hit = output['baseline']
        for name, (ids, hit) in output.items():
            result[name]['different_selections'] += int(ids != base_ids)
            result[name]['gains'] += int(hit and not base_hit)
            result[name]['losses'] += int(base_hit and not hit)
    for values in result.values():
        timings = sorted(values.pop('times'))
        values['host_ms_p50'] = round(statistics.median(timings), 3)
        values['host_ms_p95'] = round(timings[math.ceil(.95 * len(timings)) - 1], 3)
        values['mean_packed_words'] = round(values.pop('total_words') / len(cases), 2)
    receipt = {'evaluation_class': 'HISTORICAL_EXPOSED_DEV_ONLY_NOT_MEDICAL_ANSWERS',
               'number_of_questions': len(cases), 'source_pdf_sha256': hash_bytes(pdf),
               'window_words': 120, 'stride_words': 40, 'word_budget': 600, 'max_windows': 8,
               'order': 'rotating_and_alternating', 'baseline_verified_against_pack': True,
               'source_or_questions_exported': False, 'clinical_or_model_accuracy_measured': False,
               'android_or_model_inference_measured': False, 'results': result}
    fd = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as stream:
        json.dump(receipt, stream, sort_keys=True, indent=2)
        stream.write('\n')
    print(json.dumps(receipt, sort_keys=True))


if __name__ == '__main__':
    main()
