#!/usr/bin/env python3
"""Compile independent author drafts into sealed_source_eval.py gold + question-only files.

Prints counts/hashes only, never question or book text, so the pipeline operator stays blind.
IDs are random and do not reveal answerability. Inputs and outputs are owner-private.
"""
import argparse, hashlib, json, random, secrets
from pathlib import Path

STATUS = 'provisional_independent_model_source_review_not_clinical_validation'


def sha(b):
    return hashlib.sha256(b).hexdigest()


def main():
    a = argparse.ArgumentParser(description=__doc__)
    a.add_argument('--drafts', type=Path, nargs='+', required=True)
    a.add_argument('--pages', type=Path, required=True)
    a.add_argument('--pdf', type=Path, required=True)
    a.add_argument('--gold', type=Path, required=True)
    a.add_argument('--questions', type=Path, required=True)
    x = a.parse_args()
    for out in (x.gold, x.questions):
        if out.exists():
            raise SystemExit(f'Refusing to overwrite {out}')
    pages = {r['pdf_page_1based']: r['text'] for r in map(json.loads, x.pages.read_text().splitlines())}
    pdf_sha, pages_sha = sha(x.pdf.read_bytes()), sha(x.pages.read_bytes())
    rows = [json.loads(l) for d in x.drafts for l in d.read_text().splitlines() if l.strip()]
    random.SystemRandom().shuffle(rows)
    gold, qs, skipped = [], [], 0
    for r in rows:
        rid = 'Q' + secrets.token_hex(5)
        g = dict(id=rid, question=r['question'], supported=bool(r['supported']), domain=r.get('domain', 'unknown'),
                 task_type=r['task_type'], key_status=STATUS, source_pdf_sha256=pdf_sha, source_pages_sha256=pages_sha,
                 required_points=r.get('required_points') or ['States that the book does not cover this.'])
        if r.get('options'):
            g['options'] = r['options']
        if g['supported']:
            text = pages.get(r['page'], '')
            if r['quote'] not in text:
                skipped += 1; continue
            g['evidence'] = [dict(pdf_page_1based=r['page'], quote=r['quote'], quote_sha256=sha(r['quote'].encode()),
                                  page_text_sha256=sha(text.encode()))]
        else:
            anchors = r['anchors']
            g['evidence'] = []
            g['absence_audit'] = dict(source_pages_scanned=len(pages), manually_reviewed_scope_rationale=r.get('rationale', ''),
                                      anchors=anchors, literal_case_insensitive_hit_pages={
                                          k: [p for p, t in pages.items() if k.casefold() in t.casefold()] for k in anchors})
        question = g['question'] + ('\n' + '\n'.join(f'{k}. {v}' for k, v in g['options'].items()) if 'options' in g else '')
        gold.append(g); qs.append(dict(id=rid, question=question))
    x.gold.write_text(''.join(json.dumps(g) + '\n' for g in gold))
    x.questions.write_text(''.join(json.dumps(q) + '\n' for q in qs))
    print(json.dumps(dict(compiled=len(gold), supported=sum(g['supported'] for g in gold),
                          unsupported=sum(not g['supported'] for g in gold), skipped_bad_quote=skipped,
                          gold_sha256=sha(x.gold.read_bytes()), questions_sha256=sha(x.questions.read_bytes()))))


if __name__ == '__main__':
    main()
