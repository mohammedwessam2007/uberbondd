# NEU205 ONE (native, offline)

One Android app: tap **Start**, ask neuroscience questions aloud, hear short answers from the
owner's own course book through the phone speaker, ask follow-ups, tap **Stop**. Everything runs
on the phone; the manifest has no INTERNET permission.

```
core/   pure Java (host + Android): KnowledgeBase, Dialogue (retrieval + context), Conversation
        (state machine), audio/{UtteranceSegmenter, LogMel, WhisperTokens}
app/    Android: MainActivity (one screen), VoiceService (foreground mic), AudioMic, WhisperOnnx
        (ONNX Runtime), PhoneSpeaker (offline TTS), Engine (warm models), Hub (diagnostics)
tools/  build_kb.py, whisper_host.py, asr_bench.py, e2e_host.py, patch_encoder_dynamic_ctx.py,
        export_tokens.py, zipalign.py, build_apk.sh, test_core.sh
docs/   checkpoint, recovery matrix, phone acceptance script
```

**Privacy:** this repository is public. The study pack, models, course-derived tests and all
evidence that quotes the book stay in the owner's private bundle (`.gitignore` blocks them).

Status and exact numbers: `docs/NEU205_PHOENIX_CHECKPOINT_v03.md`.
