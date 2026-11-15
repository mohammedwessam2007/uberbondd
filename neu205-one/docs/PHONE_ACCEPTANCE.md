# Owner acceptance and rollback — not performed

The candidate has not been installed on your OnePlus. No phone permissions, Termux settings,
models, pairing secrets, original apps, or services were changed. Physical acceptance is a
separate, explicit authorization gate. All steps below cost $0; model downloads are not required.

## Three owner-only actions

1. **Review and explicitly authorize the isolated candidate.** Check the APK SHA-256 and signing
   certificate in `DELIVERY_MANIFEST.json`. Authorize only installation of `ai.neu205.one` and its
   first-use microphone/notification requests. Retain the rollback APKs. If that package is already
   installed with another signature, stop; do not uninstall it to bypass the signature conflict.
   Accessibility, Shizuku, root and network-ASR permissions are unnecessary. Expect about 5 minutes.
2. **Complete private, one-time companion pairing.** After authorization, deploy the supplied code
   to a new `~/neu205-one` directory in your existing Termux, preserving any existing directory.
   Place the supplied private `book.pdf`, `corpus.jsonl` and `corpus.manifest.json` under `.private`.
   Keep the actual Qwen GGUF in its existing location; reference it without copying or converting it.
   Run `backend/prepare_model_identity.py ACTUAL_MODEL_PATH --out .private/qwen-identity.json`
   once. It reads the real architecture, quantization, chat-template hash and full file SHA-256.
   Create an owner-only random pairing token file and enter it only in the candidate's Settings.
   Never paste it into chat. See `backend/README.md` for the exact private layout and fixed launcher.
   If desired, explicitly opt into Termux's documented RUN_COMMAND permission and external-app
   setting yourself, then enable the candidate's optional Termux startup. The APK does not grant
   these or edit Termux settings. Install an offline English TTS voice before airplane-mode testing.
   Expect 10–15 minutes once; normal sessions then use Start/Stop only. A running verified Qwen
   listener can be reused; separately authorized owned startup is optional and defaults off.
3. **Perform physical acceptance after approval.** In airplane mode with Wi-Fi/mobile data off,
   tap Start, ask three *new* book-supported questions from different chapters, then ask “why?”,
   “simpler”, a pronoun follow-up, and a correction. Check the displayed digital PDF page against
   the book, listen for a correct natural answer through the phone speaker, and tap Stop during
   recognition, generation and speech. Nothing old may speak afterward. Long-press the orb to
   cancel a turn and return to Listening. This candidate is half-duplex; spoken barge-in is absent.
   Abort on a wrong medical term or unsupported answer. Then, only if the short check passes,
   collect 30 warm turns, 5 cold starts, a 30-minute session, lock/unlock, incoming-audio-focus
   loss, permission revocation, process death, low-storage and thermal/battery observations.
   Expect 5 minutes for the short test plus at least 35 minutes for the sustained gates.

## Measurement rules

Do not equate a TTS callback with audible onset. Record the physical end of the question and the
first **correct audible word**, plus an observation reference kept privately. Supply those timestamps
to `tools/measure_session.py`; it rejects non-acoustic observations. Measure WER and consequential
medical-term errors separately from retrieval Recall@k and independently scored Qwen answer/citation
accuracy. Do not tune the frozen historical exam after seeing its key. The clinical acceptance
thresholds must be agreed and frozen before held-out scoring; none are claimed passed here.

The host synthetic ASR probe still misrecognized “carotid sheath”. It cannot establish readiness
for real medical questions. CPU/GPU/NPU speed, RAM, battery, temperatures, Android 17 routing and
end-to-audible-word p50/p95 remain unknown until the physical measurements exist.

## Rollback

Tap Stop and close the candidate. Disable its optional Termux startup toggle. Stop only a companion
or Qwen PID whose private receipt proves this candidate created it; never kill a pre-existing
listener. If the actual PID identity cannot be established, leave it alone and investigate.

The original `ai.neu205.pocket`, `ai.neu205.pocket.v8`, and `ai.neu205.one.candidate` packages are
separate from `ai.neu205.one`. Their APKs and source archives are preserved byte-for-byte in the
private recovery bundle. Keep using the originals if acceptance fails. Removing the new candidate
is an owner decision and deletes its private session/pairing state; it is not required to restore
the separate original apps. Never replace a historical package with this new signing key.

The signing key is kept outside the source repository. Retain the separate private signing backup
securely for future candidates; do not upload it or the textbook/model assets to a public repository.
