The Android candidate accepts only `neu205.android-pack.v1` ZIPs signed by the same certificate as the installed APK. Trust is obtained from Android's installed-package signing identity, never from an imported certificate. The original PDF identity stays pinned; the APK signer attests the derived corpus digest. That digest must match the signed file list, actual corpus bytes and 299-page corpus manifest. Bundled corpus bytes retain their original fixed pin. Every listed member is size/hash checked before selecting a private version directory. Encrypted ZIPs, symlinks, traversal, unlisted members, partial ASR sets and mismatched corpus/ASR metadata are rejected. Atomic same-filesystem renames switch the pointer; the prior verified version supports rollback. This does not claim filesystem power-loss durability on an untested phone.

Prepare a private pack using the existing private signing directory (never export the keystore):

```
JAVA_HOME=/workspace/neu205-tools/debian/usr/lib/jvm/java-21-openjdk-amd64
PATH="$JAVA_HOME/bin:$PATH" python3 tools/build-study-pack.py \
  --assets /workspace/neu205-private/assets \
  --source-pdf /private/path/to/original-textbook.pdf \
  --output /workspace/neu205-private/delivery/neu205-study-pack.zip \
  --keystore /workspace/neu205-private/signing/candidate.p12 \
  --password-file /workspace/neu205-private/signing/password --with-asr
```

Optionally include `--model-receipt` pointing at a privately prepared JSON object with `sha256`, `bytes`, `architecture` (supported Qwen GGUF architecture), and `name`. The preparer must independently verify the expected downloaded model; the importer never trusts the selected GGUF's self-declared digest. No model receipt is fabricated when weights are unavailable.

On the phone, only after explicit owner authorization to install/open the candidate: stop the conversation; Settings → Import signed study pack selects the ZIP through Android's document picker. Verification happens in private staging, supports cancellation, and leaves bundled originals intact. Restore previous imported pack switches to a previously verified version. Failure/cancellation leaves the active pointer unchanged before the commit point. Rotation cancels an in-flight import; a committed pack remains selected. Start is blocked during an import.

Validate existing Qwen GGUF requires an authenticated model receipt from the signed pack, reads the selected file once, verifies full SHA-256/size, supported GGUF header, architecture, tensor offsets and chat-template presence, and retains a persisted **read-only** SAF URI plus private metadata. It does not copy multi-GB weights, modify the original, or make that URI accessible to Termux. Start prefers native Qwen when a model reference exists: it verifies the exact open descriptor again before loading, requires `qwen35`, and keeps that descriptor open during inference. Choose a locally available seekable document. A changed active pack requires model revalidation. A missing native library or invalid model fails closed without silently routing to a companion. Metadata sharing excludes the model URI and all keys/content.

Experimental v11 memory and MCQ study switches are off by default. Turning v11 on adds `memory_mode`, `mode`, and bounded session `generation_id` to the existing authenticated turn request. The standard evidence/cancel contract remains intact. No early ASR speculation is enabled: the current non-streaming Whisper decoder has no measured stable-prefix performance evidence justifying duplicate inference. Spoken barge-in, physical thermal behavior, device routing and import performance remain phone acceptance tests, not host claims.
