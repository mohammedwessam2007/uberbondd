#!/usr/bin/env python3
"""Build a blinded grading packet from one or two prediction runs (owner-private).

Each item shows question, reference (required points or must-contain + source quote/page text)
and 1-2 answers labelled X/Y in random order. The X/Y -> run mapping is written to a separate
keymap file the grader never sees. No solver config, retrieval detail or run name is exposed.
"""
import argparse, json, random, secrets
from pathlib import Path


def load_preds(p):
    return {r['id']: r for r in map(json.loads, Path(p).read_text().splitlines()) if r.get('id') != '__run__'}


def main():
    a = argparse.ArgumentParser(description=__doc__)
    a.add_argument('--reference', type=Path, required=True, help='DEV probes JSON list or sealed gold JSONL')
    a.add_argument('--pages', type=Path, required=True)
    a.add_argument('--runs', nargs='+', required=True, help='name=predictions.jsonl (1 or 2)')
    a.add_argument('--packet', type=Path, required=True)
    a.add_argument('--keymap', type=Path, required=True)
    x = a.parse_args()
    raw = x.reference.read_text()
    ref = json.loads(raw) if raw.lstrip().startswith('[') else [json.loads(l) for l in raw.splitlines() if l.strip()]
    pages = {r['pdf_page_1based']: r['text'] for r in map(json.loads, x.pages.read_text().splitlines())}
    runs = [(n, load_preds(p)) for n, p in (s.split('=', 1) for s in x.runs)]
    rng = random.SystemRandom(); packet, keymap = [], {}
    for r in ref:
        if not all(r['id'] in preds for _, preds in runs):
            continue
        supported = r.get('supported', r.get('kind') == 'supported')
        pg = [e['pdf_page_1based'] for e in r.get('evidence', [])] or r.get('pages') or []
        item_id = 'G' + secrets.token_hex(5)
        order = runs[:]; rng.shuffle(order)
        labels = dict(zip('XY', order))
        q = r['question'] + ('\n' + '\n'.join(f'{k}. {v}' for k, v in r['options'].items()) if r.get('options') else '')
        packet.append(dict(item=item_id, supported_by_book=supported, question=q,
                           required_points=r.get('required_points') or r.get('must_contain_any'),
                           source_quote=(r.get('evidence') or [{}])[0].get('quote') or r.get('source_quote'),
                           source_page_text={p: pages[p] for p in pg if p in pages},
                           answers={l: (preds[r['id']].get('answer') or '[no answer: pipeline abstained]') for l, (_, preds) in labels.items()}))
        keymap[item_id] = dict(ref_id=r['id'], labels={l: n for l, (n, _) in labels.items()})
    rng.shuffle(packet)
    x.packet.write_text(json.dumps(packet, indent=1)); x.keymap.write_text(json.dumps(keymap))
    print(json.dumps(dict(items=len(packet), runs=[n for n, _ in runs])))


if __name__ == '__main__':
    main()
