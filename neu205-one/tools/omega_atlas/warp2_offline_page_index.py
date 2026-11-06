#!/usr/bin/env python3
"""WARP v0.2, reproducible offline source-page candidate index (SOURCE CODE ONLY).

Two sparse retrieval views, neither trained on exam questions:
* character ngrams within word boundaries (3-5), robust to OCR punctuation/morphology;
* whole-word unigrams/bigrams, robust to important multiword phrases.

Verified original PDF is extracted ONCE at index build, never parsed during query.
No model, no medically certified entailment, no patient data, no network calls.
Returns candidate source locations; DOES NOT assert the page answers the question.
"""
from __future__ import annotations
from collections import Counter, defaultdict
from dataclasses import dataclass
import hashlib
import math
import re
import time
from typing import Iterable

WORD = re.compile(r"(?u)\b\w\w+\b")
SENT_BOUND = re.compile(r"(?<=[.!?:;])\s+(?=[A-Z(0-9])")
PDF_SHA = "c3298e8c5f7f807604be10f7376d67f05eb315dd982276263e8f6ad2e8e70940"


def hash_bytes(x: bytes) -> str:
    return hashlib.sha256(x).hexdigest()


def _chargrams(text: str) -> Iterable[str]:
    # sklearn char_wb semantics: padded word-local ngrams, never cross-word phrases.
    for w in re.sub(r"\s+", " ", text.casefold()).split():
        padded = " " + w + " "
        for n in (3, 4, 5):
            for start in range(max(0, len(padded) - n + 1)):
                yield padded[start:start + n]


def _wordgrams(text: str) -> Iterable[str]:
    tok = WORD.findall(text.casefold())
    for i, w in enumerate(tok):
        yield w
        if i + 1 < len(tok):
            yield w + " " + tok[i + 1]


@dataclass(frozen=True)
class SourceSpan:
    pdf_page: int
    char_start: int
    char_end: int
    page_sha256: str
    quote_sha256: str
    exact_source_bytes_verified: bool
    semantic_relation_verified: bool = False


class SparseTfidf:
    """Compact inverted normalized TF-IDF, no sklearn/Python model dependency.

    The online path traverses precompiled postings only. It does not open the PDF
    or scan all source text per request. Small final rank sorting is metadata-only.
    """
    def __init__(self, pages: list[str], analyzer):
        n = len(pages)
        freqs = [Counter(analyzer(t)) for t in pages]
        df = Counter(k for f in freqs for k in f)
        self.idf = {k: math.log((1 + n) / (1 + v)) + 1.0 for k, v in df.items()}
        self.analyzer = analyzer
        self.postings = defaultdict(list)
        for i, f in enumerate(freqs):
            weights = {k: (1.0 + math.log(v)) * self.idf[k] for k, v in f.items()}
            length = math.sqrt(sum(x * x for x in weights.values())) or 1
            for k, v in weights.items():
                self.postings[k].append((i, v / length))
        self.page_count = n

    def scores(self, query: str) -> dict[int, float]:
        freq = Counter(self.analyzer(query))
        vec = {k: (1.0 + math.log(v)) * self.idf[k] for k, v in freq.items() if k in self.idf}
        length = math.sqrt(sum(v * v for v in vec.values())) or 1
        result = defaultdict(float)
        for k, v in vec.items():
            weighted = v / length
            for page_id, page_weight in self.postings[k]:
                result[page_id] += weighted * page_weight
        return result

    def rank(self, question: str, top: int) -> list[tuple[int, float]]:
        scores = self.scores(question)
        return sorted(scores.items(), key=lambda pair: (-pair[1], pair[0]))[:top]


class WARP2:
    """Precompiled, independent high-recall source-page locator.

    `page_texts` must be extracted from the verified original PDF by a version-
    pinned extraction routine. SHA ensures the actual source document is exact;
    page hashes prevent silent changes to the extraction snapshot.
    """
    def __init__(self, page_texts: list[str], source_pdf_sha256: str, expected_pages: int = 299):
        if source_pdf_sha256 != PDF_SHA:
            raise ValueError('Original PDF identity mismatch')
        if not isinstance(page_texts, list) or len(page_texts) != expected_pages:
            raise ValueError('Source page count mismatch')
        if any(not isinstance(x, str) or not x.strip() for x in page_texts):
            raise ValueError('Empty or malformed source page')
        self._pages = tuple(page_texts)
        self._page_sha = tuple(hash_bytes(x.encode('utf-8')) for x in page_texts)
        self.character_index = SparseTfidf(page_texts, _chargrams)
        self.phrase_index = SparseTfidf(page_texts, _wordgrams)
        self.index_source_pdf_sha256 = source_pdf_sha256

    def check(self, page: int) -> bool:
        if not 1 <= page <= len(self._pages):
            return False
        return hash_bytes(self._pages[page - 1].encode()) == self._page_sha[page - 1]

    def candidate_pages(self, question: str, per_route: int = 20, cancel=None) -> dict:
        if not isinstance(question, str) or not 1 <= len(question.strip()) <= 1000:
            raise ValueError('Question must be 1-1000 non-whitespace characters')
        if not isinstance(per_route, int) or not 1 <= per_route <= 40:
            raise ValueError('Per-route candidate count must be 1-40')
        if cancel is not None and cancel():
            return {'status': 'CANCELLED', 'pages': []}
        char = self.character_index.rank(question, per_route)
        if cancel is not None and cancel():
            return {'status': 'CANCELLED', 'pages': []}
        phrase = self.phrase_index.rank(question, per_route)
        # Rank fusion prioritizes both independent candidate lists; no gold/key data.
        scores = defaultdict(float)
        routes = defaultdict(set)
        for name, ranking in [('character', char), ('phrase', phrase)]:
            for rank, (idx, sim) in enumerate(ranking):
                scores[idx] += 1.0 / (20.0 + rank + 1)
                routes[idx].add(name)
        if cancel is not None and cancel():
            return {'status': 'CANCELLED', 'pages': []}
        ordered = sorted(scores, key=lambda i: (-scores[i], i))
        # NOTE: candidate pages are NOT evidence to feed Qwen as a batch; an
        # independent entailment-aware reranker must reduce them to short spans.
        return {'status': 'CANDIDATES_ONLY_NOT_ANSWER',
                'pages': [{'page': i + 1, 'score': round(scores[i], 8),
                           'routes': tuple(sorted(routes[i])),
                           'page_sha256': self._page_sha[i],
                           'relation_semantically_verified': False}
                          for i in ordered],
                'candidate_page_count': len(ordered),
                'total_original_pages': len(self._pages),
                'online_full_pdf_scan': False,
                'model_answer_verified': False}

    def exact_span(self, page: int, start: int, end: int):
        if not self.check(page):
            raise ValueError('Page digest mismatch')
        text = self._pages[page - 1]
        if not (isinstance(start, int) and isinstance(end, int) and 0 <= start < end <= len(text)):
            raise ValueError('Source offset invalid')
        span = text[start:end]
        return SourceSpan(page, start, end, self._page_sha[page - 1],
                          hash_bytes(span.encode()), True)

    def limited_excerpt(self, question: str, page: int, max_words: int = 130, cancel=None):
        """Source-only quote; no 'entails answer' conclusion from lexical similarity."""
        if not isinstance(question, str) or not 1 <= len(question.strip()) <= 1000:
            raise ValueError('Invalid question')
        if not 20 <= max_words <= 300:
            raise ValueError('Word budget outside 20-300')
        if cancel is not None and cancel():
            return {'status': 'CANCELLED', 'text': None}
        if not self.check(page):
            raise ValueError('Page is corrupt')
        source = self._pages[page - 1]
        cuts = [0] + [m.end() for m in SENT_BOUND.finditer(source)] + [len(source)]
        qs = set(_wordgrams(question)); parts = []
        for a, b in zip(cuts, cuts[1:]):
            s = source[a:b]
            ts = set(_wordgrams(s))
            score = len(qs & ts) / max(1, len(qs))
            parts.append((score, a, b, s))
        best = sorted(parts, key=lambda x: (-x[0], x[1]))[0]
        count = len(best[3].split())
        if count > max_words:
            return {'status': 'EVIDENCE_SENTENCE_EXCEEDS_BUDGET', 'text': None}
        if cancel is not None and cancel():
            return {'status': 'CANCELLED', 'text': None}
        cert = self.exact_span(page, best[1], best[2])
        return {'status': 'EXACT_SOURCE_ONLY_NO_ENTAILMENT', 'text': best[3],
                'page': page, 'char_start': cert.char_start, 'char_end': cert.char_end,
                'page_sha256': cert.page_sha256, 'excerpt_sha256': cert.quote_sha256,
                'medical_correctness_verified': False}


def extract_verified_pages(pdf_bytes: bytes) -> list[str]:
    if not isinstance(pdf_bytes, bytes) or hash_bytes(pdf_bytes) != PDF_SHA:
        raise ValueError('Source PDF SHA-256 mismatch')
    # Install pypdf for offline compiler ONLY, never on-device inference.
    from pypdf import PdfReader
    import io
    reader = PdfReader(io.BytesIO(pdf_bytes))
    if len(reader.pages) != 299:
        raise ValueError('Expected 299 original digital PDF pages')
    result = [(p.extract_text() or '') for p in reader.pages]
    if any(not s.strip() for s in result):
        raise ValueError('PDF extraction omitted a source page')
    return result
