#!/usr/bin/env python3
"""Summarize owner-observed acoustic measurements; never infer sound from TTS callbacks."""
import argparse
import json
import math
import statistics
from pathlib import Path


def summarize(rows):
    if not rows:
        raise ValueError('No observations')
    latencies = []
    for row in rows:
        if row.get('scope') != 'physical-phone-acoustic' or not row.get('observation_reference'):
            raise ValueError('Each row needs physical acoustic provenance')
        start, end = row['speech_end_ms'], row['first_correct_audible_word_ms']
        if not all(isinstance(v, (float, int)) and math.isfinite(v) for v in (start, end)) or end < start:
            raise ValueError('Invalid acoustic timestamps')
        latencies.append(end - start)
    ordered = sorted(latencies)
    return {'scope': 'physical-phone-acoustic', 'turns': len(rows),
            'p50_ms': statistics.median(ordered),
            'p95_ms': ordered[max(0, math.ceil(.95 * len(ordered)) - 1)],
            'max_ms': max(ordered), 'latency_target_pass': statistics.median(ordered) <= 2500
            and ordered[max(0, math.ceil(.95 * len(ordered)) - 1)] <= 5000,
            'release_qualified': False,
            'note': 'Latency alone cannot qualify a release; accuracy, lifecycle, thermal and offline gates remain.'}


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('observations', type=Path)
    a = p.parse_args()
    print(json.dumps(summarize(json.loads(a.observations.read_text())), indent=2))
