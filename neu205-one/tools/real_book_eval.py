#!/usr/bin/env python3
"""Run questions through the PRODUCTION Brain (real PDF hash, real 299-page corpus, real Qwen).

Owner-private inputs/outputs only; prints nothing from the book. Questions file: JSON list of
{id, question, ...}; only `question` reaches the model. Output: JSONL predictions with evidence
pages, prompt-budget receipt, timings and status. Grading is a separate step (grade_book_eval.py).
Never starts/stops a model server; never contacts the network beyond 127.0.0.1.
"""
import argparse, datetime, hashlib, json, subprocess, sys, time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from bridge import Brain, Settings, Flight, Failure  # noqa: E402
from evidence_adapter import SCHEMA  # noqa: E402

# Server/host faults are not model answers: never record them as predictions.
INFRA = {'QWEN_UNAVAILABLE', 'QWEN_TIMEOUT', 'QWEN_STREAM_TRUNCATED', 'QWEN_FAILED', 'INVALID_QWEN_STREAM'}


def make_brain(a):
    kw = dict(model_identity=str(a.identity), qwen_url=a.qwen_url)
    if a.active_memory:
        kw.update(active_memory=str(a.active_memory), active_memory_manifest=str(a.active_memory) + '.manifest.json',
                  memory_mode_default='v11', memory_tools=a.memory_tools, memory_word_budget=a.word_budget)
    b = Brain(Settings(a.corpus, a.manifest, a.pdf, 'eval-only-token', **kw))
    if not b.identity_current():
        raise SystemExit('Qwen identity receipt did not verify against the actual GGUF')
    return b


def ask(b, rid, question, mode, response_mode):
    req = dict(schema=SCHEMA, request_id=rid, generation_id=rid, utterance_text=question, conversation_topics=[],
               max_passages=5, latency_budget_ms=150, corpus_sha256=b.s.corpus_sha256, memory_mode=mode,
               mode=response_mode)
    t = time.monotonic(); first = None; text = ''; pages = []; budget = None; status = 'completed'; code = None; prefix = None
    try:
        for ev in b.answer(req, Flight()):
            if ev['type'] == 'evidence':
                pages = ev['source_pages']; budget = ev.get('prompt_budget', budget)
            elif ev['type'] == 'token':
                first = first or time.monotonic() - t; text += ev['text']
            elif ev['type'] == 'done':
                prefix = ev.get('system_prefix_sha256')
    except Failure as e:
        status, code = 'refused_by_pipeline', e.code
    return dict(utc=datetime.datetime.now(datetime.timezone.utc).isoformat(), system_prefix_sha256=prefix, answer=text.strip(), status=status, failure_code=code, source_pages=pages,
                prompt_tokens=(budget or {}).get('prompt_tokens_or_upper_bound'),
                ttft_ms=round(first * 1000) if first else None, total_ms=round((time.monotonic() - t) * 1000))


def main():
    p = argparse.ArgumentParser(description=__doc__)
    for k in ('corpus', 'manifest', 'pdf', 'identity', 'questions', 'out'):
        p.add_argument('--' + k, type=Path, required=True)
    p.add_argument('--qwen-url', default='http://127.0.0.1:8080')
    p.add_argument('--mode', choices=('baseline', 'v11'), default='baseline')
    p.add_argument('--response-mode', choices=('study', 'exam_mcq'), default='study')
    p.add_argument('--active-memory', type=Path)
    p.add_argument('--memory-tools', action='store_true')
    p.add_argument('--word-budget', type=int, default=160)
    p.add_argument('--limit', type=int)
    a = p.parse_args()
    b = make_brain(a)
    done = set()
    if a.out.exists():
        done = {json.loads(l)['id'] for l in a.out.read_text().splitlines() if l.strip()}
    raw = a.questions.read_text()
    rows = (json.loads(raw) if raw.lstrip().startswith('[') else [json.loads(l) for l in raw.splitlines() if l.strip()])[:a.limit]
    with a.out.open('a') as f:
        if not done:
            head = subprocess.run(['git', 'rev-parse', 'HEAD'], capture_output=True, text=True, cwd=Path(__file__).parent).stdout.strip()
            dirty = subprocess.run(['git', 'diff', 'HEAD', '--', '../backend'], capture_output=True, text=True, cwd=Path(__file__).parent).stdout
            f.write(json.dumps(dict(id='__run__', model_sha256=b.identity_info['sha256'], corpus_sha256=b.s.corpus_sha256,
                                    code_head=head, backend_uncommitted_diff_sha256=hashlib.sha256(dirty.encode()).hexdigest(),
                                    mode=a.mode, response_mode=a.response_mode, questions_sha256=hashlib.sha256(a.questions.read_bytes()).hexdigest())) + '\n')
        for r in rows:
            if r['id'] in done:
                continue
            out = dict(id=r['id'], **ask(b, r['id'], r['question'], a.mode, a.response_mode))
            if out['failure_code'] in INFRA:
                raise SystemExit(f"infrastructure failure {out['failure_code']} on {r['id']}; not recorded, retry")
            f.write(json.dumps(out) + '\n'); f.flush()


if __name__ == '__main__':
    main()
