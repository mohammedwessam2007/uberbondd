# G0 — Source recovery and reconciliation matrix (2026-11-03)

Custody: handoff ZIP `b875d731…46b3`; all 26 manifest entries re-hashed OK; v8 `SHA256SUMS` OK;
v6 (83 entries) and v8 (15 + 3 nested archives) safely extracted (path-traversal / symlink /
size guards) into a private scratch workspace. Originals untouched. v0.2 **source** ZIP
(`74e0f946…acb9b`) and receipts ZIP (`10fe62b3…6257`) are **still absent** — v0.2 is assessed only
from its APK facts, checkpoint and audit; no v0.2 source review is claimed.

| Asset | What it actually is | Verdict | Reason / evidence |
|---|---|---|---|
| v6 `ai.neu205.pocket` Android + Python backend | Java service + Termux HTTP backend (`recall.py`) | **RETIRE as runtime, keep archived** | Needs Termux backend + pairing key (one-tap failure); never phone-tested. |
| v8 `ai.neu205.pocket.v8` | Java service, adaptive VAD, TTS-to-file playback, Termux Whisper bridge | **REUSE donors, retire runtime** | `UtteranceSegmenter` ported verbatim into `core/audio` (10/10 fixtures segment). Offline-voice selection rule reused in `PhoneSpeaker`. Termux bridge retired (one-tap failure; host ASR p50 20.3 s, 1/7). |
| v8 Whisper `small.en` GGML + arm64 `whisper-server` | whisper.cpp v1.8.2 cross-compile, never phone-executed | **SUPERSEDED** | Replaced by in-app ONNX Runtime Whisper (no second process, no port, no key). |
| v8 `extra_cards.json` (37 cards) | Hand-written cards; some facts not found in the supplied book (e.g. a digastric nerve-supply card) | **NOT IMPORTED** | Every answer now comes from verbatim book units; a card without a book source is not used. |
| v6/v8 SQLite index (299 pages / 1,169 passages) | FTS index of the same PDF (sha `c3298e8c…`) | **SUPERSEDED** | Rebuilt directly from the text-only PDF as 1,287 heading/label units, 798 topics. |
| v0.1 / v0.2 `ai.neu205.one.candidate` APKs | Android SpeechRecognizer + 12-record JSON engine | **KEEP installed side-by-side; retire as product** | Depends on platform recognizer whose offline availability is unknown; 12 records only. |
| v0.2 course pack (12 entries + reviewed teaching text) | Owner-reviewed paraphrases citing `CERVICAL FASCIA.pdf` | **REUSE as overlay** | Teaching paraphrases power "explain it simply" for the carotid sheath; facts still cited to the book. |
| `NEU205_EOM_197_Answers.pdf` | 16 scanned pages, no text layer | **NOT INGESTED** | No local OCR; ingest later with an owner-approved OCR route. |
| Termux Qwen (`:8080`) / NEU205 backend (`:8767`) | Live on phone, not accessible here | **UNTOUCHED / NOT A DEPENDENCY** | Deterministic retrieval answers in < 1 ms; Qwen not required for Phase 1. Pairing key exposed → rotate only after owner approval. |

Architecture decision (spec §4): **A — native self-contained APK**. B (Termux orchestration)
fails "one app, one tap" by construction; C adds an HTTP hop with no accuracy gain. Falsifier for
A: on-device Whisper-small latency or memory on the OnePlus 15 — measurable only on the phone.
