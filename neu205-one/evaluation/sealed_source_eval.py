#!/usr/bin/env python3
"""Source-only integrity and human-grade arithmetic. Contains no questions/key.

This program never decides whether a medical answer is correct. Gold paths
must point to a private evaluator workspace; never commit private JSONL files.
"""
import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import subprocess


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def read_jsonl(path):
    rows = [json.loads(line) for line in Path(path).read_text().splitlines() if line.strip()]
    ids = [r['id'] for r in rows]
    if len(ids) != len(set(ids)):
        raise ValueError('Duplicate IDs')
    return rows


def read_predictions(path):
    rows = [json.loads(line) for line in Path(path).read_text().splitlines() if line.strip()]
    header = None
    if rows and 'id' not in rows[0]:
        header = rows.pop(0)
        check(set(header) == {'run','config_sha256'}, 'Invalid prediction header')
        check(isinstance(header['run'],dict), 'Invalid run metadata')
        check(isinstance(header['config_sha256'],str) and len(header['config_sha256'])==64 and
              all(c in '0123456789abcdef' for c in header['config_sha256']), 'Invalid config hash')
    check(all(isinstance(row,dict) and 'id' in row for row in rows), 'Unknown/repeated prediction metadata line')
    ids=[r['id'] for r in rows]
    check(len(ids)==len(set(ids)), 'Duplicate prediction IDs')
    return header,rows


def check(condition, message):
    if not condition:
        raise ValueError(message)


def sample_size_targets(manifest):
    """Read frozen targets, allowing old manifests which contain neither field."""
    schema = manifest.get('schema_version', 1)
    check(type(schema) is int and schema in (1, 2), 'Unknown freeze manifest schema')
    names = ('target_supported', 'target_unsupported')
    present = [name in manifest for name in names]
    check(present[0] == present[1], 'Both sample-size targets must be specified together')
    check(schema != 2 or present[0], 'Current freeze manifest must contain sample-size targets')
    values = (manifest[names[0]], manifest[names[1]]) if present[0] else (300, 100)
    check(all(type(value) is int and value > 0 for value in values),
          'Sample-size targets must be positive integers')
    minimum_supported = 400 if schema == 2 else 300
    check(values[0] >= minimum_supported and values[1] >= 100,
          f'Schema {schema} targets must be at least {minimum_supported} supported and 100 unsupported')
    return values


def normalize(text):
    return ' '.join(text.split())


def validate(args):
    gold = read_jsonl(args.gold)
    questions = read_jsonl(args.questions)
    page_rows = [json.loads(s) for s in Path(args.pages).read_text().splitlines() if s.strip()]
    pages = {r['pdf_page_1based']: r['text'] for r in page_rows}
    check(len(pages) == len(page_rows), 'Duplicate source pages')
    check(sorted(pages) == list(range(1, len(pages) + 1)), 'Non-contiguous source pages')
    check(set(r['id'] for r in gold) == set(r['id'] for r in questions), 'Question/key ID mismatch')
    qmap = {r['id']: r for r in questions}
    pdf_sha, pages_sha = digest(args.pdf), digest(args.pages)
    cache, spans, supported_pages = {}, 0, set()
    for r in gold:
        q = qmap[r['id']]
        check(set(q) == {'id', 'question'}, 'Question-only file has disallowed fields')
        expected_question = r['question']
        if 'options' in r:
            expected_question += '\n' + '\n'.join(f'{k}. {v}' for k, v in r['options'].items())
        check(q['question'] == expected_question, 'Question text/key mismatch')
        check(r['source_pdf_sha256'] == pdf_sha, 'PDF source hash mismatch')
        check(r['source_pages_sha256'] == pages_sha, 'Page-text source hash mismatch')
        check(r['key_status'] == 'provisional_independent_model_source_review_not_clinical_validation',
              'Unexpected key review status')
        check(isinstance(r['supported'], bool), 'Invalid supported label')
        check(bool(r['required_points']), 'Empty rubric')
        if r['supported']:
            check(bool(r['evidence']), 'Supported answer missing evidence')
            for evidence in r['evidence']:
                page, quote = evidence['pdf_page_1based'], evidence['quote']
                check(page > args.development_cutoff, 'Development source page leaked into sealed evidence')
                check(page in pages and quote and quote in pages[page], 'Quote is not exact page-text substring')
                check(hashlib.sha256(quote.encode()).hexdigest() == evidence['quote_sha256'], 'Quote hash mismatch')
                check(hashlib.sha256(pages[page].encode()).hexdigest() == evidence['page_text_sha256'], 'Page text hash mismatch')
                if page not in cache:
                    cache[page] = subprocess.check_output([
                        'pdftotext', '-layout', '-f', str(page), '-l', str(page), str(args.pdf), '-'
                    ], text=True)
                check(normalize(quote) in normalize(cache[page]), 'Quote absent from fresh PDF layout extraction')
                supported_pages.add(page)
                spans += 1
        else:
            check(not r['evidence'], 'Unsupported answer must not fabricate positive evidence')
            audit = r['absence_audit']
            check(audit['source_pages_scanned'] == len(pages), 'Incomplete absence audit')
            check(bool(audit['manually_reviewed_scope_rationale']), 'Unsupported item has no scope rationale')
            for anchor in audit['anchors']:
                actual = [p for p,t in pages.items() if anchor.casefold() in t.casefold()]
                check(actual == audit['literal_case_insensitive_hit_pages'][anchor], 'Absence audit mismatch')
                check(not actual, 'Unsupported absence anchor occurs in source; manual review needed')
    counts = Counter('supported' if r['supported'] else 'unsupported' for r in gold)
    return dict(total=len(gold), supported=counts['supported'], unsupported=counts['unsupported'],
                domains=dict(Counter(r['domain'] for r in gold if r['supported'])),
                task_types=dict(Counter(r['task_type'] for r in gold)), evidence_spans=spans,
                selected_source_pages=sorted(supported_pages), source_page_count=len(pages),
                development_pdf_pages_excluded=[1, args.development_cutoff],
                gold_sha256=digest(args.gold), questions_sha256=digest(args.questions),
                source_pdf_sha256=pdf_sha, source_pages_sha256=pages_sha,
                exact_jsonl_and_normalized_fresh_pdf_quotes_valid=True,
                clinical_validation=False, prediction_metrics_status='not_run')


def freeze(args):
    supported_target, unsupported_target = sample_size_targets({
        'schema_version': 2,
        'target_supported': getattr(args, 'target_supported', 400),
        'target_unsupported': getattr(args, 'target_unsupported', 100),
    })
    report = validate(args)
    report.update(schema_version=2, frozen_utc=datetime.now(timezone.utc).isoformat(),
                  preregistration_sha256=digest(args.preregistration),
                  sampling_method='See hashed preregistration; sampling method is not independently verified by this tool.',
                  target_supported=supported_target, target_unsupported=unsupported_target,
                  supported_shortfall=max(0, supported_target-report['supported']),
                  unsupported_shortfall=max(0, unsupported_target-report['unsupported']),
                  target_provenance='Freeze arguments; consistency with the hashed preregistration requires independent review.',
                  reviewer_status='Key review status is declared by its author and is not independently verified; no clinical validation is established.',
                  predictions_read_before_freeze=None,
                  predictions_read_before_freeze_note='Unknown to this tool; sequence must be independently audited.')
    # Exclusive create is mandatory. Never replace an existing freeze manifest.
    with open(args.manifest, 'x', encoding='utf-8') as stream:
        json.dump(report, stream, indent=2, sort_keys=True)
        stream.write('\n')
    return report


def seal_predictions(args):
    """Run before a reviewer sees gold. Never expose gold to this command."""
    header,rows=read_predictions(args.predictions)
    questions=read_jsonl(args.questions)
    check({r['id'] for r in rows}=={r['id'] for r in questions}, 'Prediction/question ID coverage mismatch')
    key_manifest=json.loads(Path(args.key_manifest).read_text())
    sample_size_targets(key_manifest)
    check(digest(args.questions)==key_manifest['questions_sha256'], 'Question file differs from key freeze')
    check(len(rows)==key_manifest['total'], 'Prediction count differs from frozen set')
    for r in rows:
        check(set(r)>={'id','answer','status'}, 'Prediction needs id/answer/status')
        check(r['status'] in {'completed','failed'}, 'Unknown prediction status')
    report=dict(schema_version=1,frozen_utc=datetime.now(timezone.utc).isoformat(),
                predictions_sha256=digest(args.predictions),
                questions_sha256=digest(args.questions),
                key_manifest_sha256=digest(args.key_manifest),
                count=len(rows),header_present=header is not None,
                config_sha256=header['config_sha256'] if header else None,
                note='Prediction bytes and exact ID/count coverage frozen before independent grading; config hash is retained as runner metadata, not independently verified here.')
    with open(args.manifest,'x',encoding='utf-8') as stream:
        json.dump(report,stream,indent=2,sort_keys=True)
        stream.write('\n')
    return report


def wilson(numerator, denominator):
    if not denominator:
        return None
    z = 1.959963984540054
    p = numerator / denominator
    scale = 1 + z*z/denominator
    centre = (p + z*z/(2*denominator))/scale
    margin = z*math.sqrt(p*(1-p)/denominator + z*z/(4*denominator*denominator))/scale
    return [max(0, centre-margin), min(1, centre+margin)]


def rate(n, d):
    return dict(numerator=n, denominator=d, value=n/d if d else None,
                descriptive_wilson_95=wilson(n,d))


def grade(args):
    manifest = json.loads(Path(args.manifest).read_text())
    supported_target, unsupported_target = sample_size_targets(manifest)
    for attr, key in [('gold','gold_sha256'), ('questions','questions_sha256'),
                      ('preregistration','preregistration_sha256')]:
        check(digest(getattr(args,attr)) == manifest[key], f'Frozen {attr} changed')
    gold = {r['id']:r for r in read_jsonl(args.gold)}
    _,prediction_rows=read_predictions(args.predictions)
    preds = {r['id']:r for r in prediction_rows}
    grades = {r['id']:r for r in read_jsonl(args.grades)}
    check(set(preds) == set(gold), 'Exact prediction/key ID coverage required; represent missing execution as a failed row')
    check(set(grades) == set(gold), 'Every frozen item requires a human grade including explicit missing/error rows')
    prediction_sha = digest(args.predictions)
    prediction_manifest=json.loads(Path(args.predictions_manifest).read_text())
    check(prediction_manifest['predictions_sha256']==prediction_sha, 'Prediction file changed after prediction freeze')
    check(prediction_manifest['key_manifest_sha256']==digest(args.manifest), 'Prediction freeze refers to different key manifest')
    check(prediction_manifest['questions_sha256']==digest(args.questions), 'Prediction freeze refers to different question file')
    check(prediction_manifest['count']==len(preds), 'Prediction count changed after prediction freeze')
    supported = [i for i,r in gold.items() if r['supported']]
    unsupported = [i for i,r in gold.items() if not r['supported']]
    for ident,g in grades.items():
        check(g['label'] in {'correct','partial','incorrect','refusal','error'}, 'Unknown grade label')
        check(bool(g['reviewer_id']) and bool(g['reviewer_qualifications']) and bool(g['rationale']), 'Missing independent human/source review details')
        check(g['review_method'] == 'independent_source_review', 'Only independently reviewed source grades accepted')
        check(g['prediction_file_sha256'] == prediction_sha, 'Grade refers to a different prediction file')
        check(not (not gold[ident]['supported'] and g['label']=='correct'), 'Unsupported success is refusal, not correct')
        if ident not in preds:
            check(g['label']=='error', 'Missing prediction must be error')
        else:
            p=preds[ident]
            check(set(p) >= {'id','answer','status'}, 'Prediction needs id/answer/status')
            confidence=p.get('confidence')
            check(confidence is None or (type(confidence) in {int,float} and math.isfinite(confidence) and 0<=confidence<=1), 'Invalid pre-grading confidence')
            if p['status']!='completed' or not isinstance(p['answer'],str) or not p['answer'].strip():
                check(g['label']=='error', 'Failed/empty prediction must be error')
    correct=sum(grades[i]['label']=='correct' for i in supported)
    refused=sum(grades[i]['label']=='refusal' for i in unsupported)
    missing_confidence=sum(i not in preds or preds[i].get('confidence') is None for i in gold)
    high=[i for i in supported if i in preds and preds[i].get('confidence') is not None and preds[i]['confidence']>=.8]
    wrong=[i for i in high if grades[i]['label'] in {'incorrect','partial'}]
    unsupported_confident_fabrication=sum(i in preds and preds[i].get('confidence') is not None and preds[i]['confidence']>=.8 and grades[i]['label'] in {'incorrect','partial'} for i in unsupported)
    accuracy=rate(correct,len(supported))
    refusal=rate(refused,len(unsupported))
    confident_wrong=rate(len(wrong),len(supported))
    threshold_status=dict(correctness_at_least_90=accuracy['value'] is not None and accuracy['value']>=.9,
                          unsupported_refusal_at_least_95=refusal['value'] is not None and refusal['value']>=.95,
                          confident_wrong_at_most_2='unavailable' if missing_confidence else confident_wrong['value']<=.02,
                          target_sample_size_met=len(supported)>=supported_target and len(unsupported)>=unsupported_target,
                          independent_clinical_review_available=False)
    return dict(status='provisional_source_review_only_not_clinical_validation',
                predictions_sha256=prediction_sha, grades_sha256=digest(args.grades),
                prediction_manifest_sha256=digest(args.predictions_manifest),
                supported_correctness=accuracy, unsupported_refusal=refusal,
                supported_confident_wrong=confident_wrong,
                supported_confident_wrong_conditional=rate(len(wrong),len(high)),
                unsupported_confident_fabrication=rate(unsupported_confident_fabrication,len(unsupported)),
                missing_pregrading_confidence=missing_confidence,
                missing_predictions=len(set(gold)-set(preds)),
                labels=dict(Counter(g['label'] for g in grades.values())),
                thresholds=threshold_status,
                sample_size_targets=dict(supported=supported_target, unsupported=unsupported_target),
                full_release_gate_passed=False,
                caveat='Purposive clustered source questions; small sample; no clinical validation or device evidence. Arithmetic is not automatic medical grading.')


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    commands=parser.add_subparsers(dest='command',required=True)
    for command in ('validate','freeze'):
        p=commands.add_parser(command)
        for name in ('gold','questions','pages','pdf'):
            p.add_argument('--'+name,required=True,type=Path)
        p.add_argument('--development-cutoff',type=int,default=60)
        if command=='freeze':
            p.add_argument('--preregistration',type=Path,required=True)
            p.add_argument('--manifest',type=Path,required=True)
            p.add_argument('--target-supported',type=int,default=400,
                           help='Preregistered supported-item target, minimum 400 (default 400)')
            p.add_argument('--target-unsupported',type=int,default=100,
                           help='Preregistered unsupported-item target, minimum 100 (default 100)')
    p=commands.add_parser('grade')
    for name in ('gold','questions','preregistration','manifest','predictions','predictions-manifest','grades'):
        p.add_argument('--'+name,required=True,type=Path)
    p=commands.add_parser('seal-predictions')
    for name in ('questions','key-manifest','predictions','manifest'):
        p.add_argument('--'+name,required=True,type=Path)
    args=parser.parse_args()
    try:
        report={'validate':validate,'freeze':freeze,'seal-predictions':seal_predictions,'grade':grade}[args.command](args)
    except (ValueError,KeyError,OSError,subprocess.CalledProcessError) as exc:
        parser.exit(2, f'Integrity/grading validation failed: {exc}\n')
    print(json.dumps(report,indent=2,sort_keys=True))


if __name__=='__main__':
    main()
