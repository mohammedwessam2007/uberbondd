#!/usr/bin/env python3
"""Freeze real local Qwen predictions without opening an evaluation key or assigning grades."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from bridge import Brain, Settings


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def questions(path):
    rows = [json.loads(line) for line in Path(path).read_text().splitlines() if line.strip()]
    ids = set()
    for row in rows:
        if not isinstance(row.get('id'), str) or row['id'] in ids:
            raise ValueError('Unique question IDs required')
        if not isinstance(row.get('question'), str) or not 1 <= len(row['question']) <= 1000:
            raise ValueError('Question outside frozen request limits')
        # No answers, explanations, source quotes, evidence IDs or keys may enter solver input.
        if any(k in row for k in ['answer', 'correct_answer', 'gold', 'key', 'source_quote', 'expected']):
            raise ValueError('Questions file contains answer-key material')
        ids.add(row['id'])
    if not rows:
        raise ValueError('An empty run proves no accuracy')
    return rows


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--questions', type=Path, required=True)
    p.add_argument('--sealed-key-sha256', required=True, help='Digest only; key contents are never read')
    p.add_argument('--assets', type=Path, required=True)
    p.add_argument('--model-identity', type=Path, required=True)
    p.add_argument('--out', type=Path, required=True)
    p.add_argument('--memory-mode', choices=['baseline', 'v11'], default='baseline')
    p.add_argument('--active-memory', type=Path)
    p.add_argument('--active-memory-manifest', type=Path)
    p.add_argument('--word-budget', type=int, choices=[110, 160, 220], default=160)
    p.add_argument('--mode', choices=['study', 'exam_mcq'], default='study')
    p.add_argument('--memory-tools', action='store_true')
    a = p.parse_args()
    rows = questions(a.questions)
    if len(a.sealed_key_sha256) != 64 or any(c not in '0123456789abcdef' for c in a.sealed_key_sha256):
        p.error('Frozen key SHA256 required before predictions')
    settings = Settings(a.assets / 'corpus.jsonl', a.assets / 'corpus.manifest.json',
                        a.assets / 'book.pdf', 'local-unbound-evaluation-context-only',
                        model_identity=str(a.model_identity))
    if a.memory_mode == 'v11':
        if not a.active_memory or not a.active_memory_manifest:
            p.error('v11 requires its verified active-memory database and manifest')
        settings.active_memory = str(a.active_memory)
        settings.active_memory_manifest = str(a.active_memory_manifest)
        settings.memory_mode_default = 'v11'
        settings.memory_word_budget = a.word_budget
        settings.memory_tools = a.memory_tools
    brain = Brain(settings)
    readiness = brain.health(native_asr=True)
    if not readiness['ready']:
        p.error('Real Qwen/corpus readiness failed: ' + ','.join(readiness['blockers']))
    config = {'scope': 'HOST_REAL_QWEN_NOT_PHONE', 'questions_sha256': sha(a.questions),
              'sealed_key_sha256': a.sealed_key_sha256, 'model_sha256': brain.identity_info['sha256'],
              'corpus_sha256': brain.s.corpus_sha256, 'questions_requested': len(rows),
              'memory_mode': a.memory_mode, 'mode': a.mode, 'word_budget': a.word_budget,
              'memory_tools': a.memory_tools,
              'active_memory_sha256': sha(a.active_memory) if a.active_memory else None,
              'grading_executed': False, 'accuracy_claim': None}
    config_sha = hashlib.sha256(json.dumps(config, sort_keys=True).encode()).hexdigest()
    a.out.parent.mkdir(parents=True, exist_ok=True)
    partial = a.out.with_suffix(a.out.suffix + '.partial')
    if a.out.exists() or partial.exists():
        p.error('Preserve existing frozen/partial output; select a new run path')
    fd = os.open(partial, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    with os.fdopen(fd, 'w') as out:
        out.write(json.dumps({'run': config, 'config_sha256': config_sha}) + '\n'); out.flush()
        for index, row in enumerate(rows):
            request_id = f'eval-{index:05d}'
            flight = brain.begin(request_id); started = time.monotonic()
            text = ''; first = None; evidence = []; error = None
            try:
                request = {'request_id': request_id, 'utterance_text': row['question'],
                           'conversation_topics': [], 'history': [], 'corpus_sha256': brain.s.corpus_sha256,
                           'memory_mode': a.memory_mode, 'generation_id': request_id, 'mode': a.mode}
                for event in brain.answer(request, flight):
                    if event['type'] == 'token':
                        if first is None: first = time.monotonic()
                        text += event['text']
                    if event['type'] == 'evidence': evidence = event.get('source_pages', [])
            except Exception as failure:
                error = getattr(failure, 'code', type(failure).__name__)
            finally:
                brain.finish(request_id)
            record = {'id': row['id'], 'answer': text, 'status': 'completed' if error is None else 'failed',
                      'confidence': None, 'source_pages': evidence, 'error': error,
                      'ttft_ms': None if first is None else (first - started) * 1000,
                      'elapsed_ms': (time.monotonic() - started) * 1000}
            out.write(json.dumps(record, ensure_ascii=False) + '\n'); out.flush(); os.fsync(out.fileno())
            print(f'Completed {index + 1}/{len(rows)}; no grades opened', flush=True)
    os.replace(partial, a.out)
    a.out.with_suffix(a.out.suffix + '.sha256').write_text(sha(a.out) + '\n')
    print('Predictions frozen. Independent grading is a separate operation.')


if __name__ == '__main__':
    main()
