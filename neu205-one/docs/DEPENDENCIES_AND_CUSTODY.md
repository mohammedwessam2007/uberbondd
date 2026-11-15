# Dependencies, provenance and private custody

No textbook, original model, audio recording, signing key or pairing credential is committed in
the code repository. The private delivery contains course assets solely for the owner's use.
Do not publish that delivery or the recovered backups to a public repository.

| Component | Provenance/version | License/custody |
|---|---|---|
| Android audio/VAD recovery | Owner-supplied v6/v8 archives; originals preserved | Owner project source; no new public licensing assertion |
| Native Whisper Java algorithm and frozen BM25/GGUF reader | `uberbond2007/uberbondd` commit `448d55f0497f7f41932869edf30084419574752a` | Owner project source; provenance retained |
| Frozen Evidence API | Same commit, `docs/NEU205_EVIDENCE_API_V1.md` | Copied unchanged; transport adapter is separate |
| ONNX Runtime Android/JVM | Microsoft Maven Central artifacts 1.31.1, publisher checksum verified | MIT; retain notices in upstream artifacts |
| Whisper-small ONNX weights/tokenizer | `sts-whisper-small@1.0.0`, npm SHA512 integrity verified | Package declares Apache-2.0; derived Xenova export; original HF parity was not independently obtained |
| Whisper encoder adaptation | Recovered `patch_encoder_dynamic_ctx.py`, original encoder unchanged | Patched copy's SHA matches prior checkpoint; shortened-window accuracy only tested on synthetic host probes |
| Android SDK/NDK | Official Google platform37.2/build-tools37.0.0/NDK29.0.14206865 | Android SDK terms; downloaded via official CLI verification |
| Java compiler | Debian OpenJDK21.0.12.1, signed package metadata | GPLv2 with Classpath Exception |
| llama.cpp CPU runtime | Official commit `28b812d6cb9cfe569d368c2774c3886ad4fe10e8` | MIT; license included with runtime |
| JUnit/Robolectric | 4.13.2 / 4.14.1 | EPL1.0 / MIT; Gradle dependency verification retained |
| Actual Qwen GGUF | NOT PRESENT in backup or host | Identity and weight license UNKNOWN; no weights redistributed |
| NEU205 textbook | Original PDF SHA `c3298e8c5f7f807604be10f7376d67f05eb315dd982276263e8f6ad2e8e70940` | Owner-private course content, not a public dependency |

The npm archive integrity is
`sha512-NoW0Id+PSL22BoV+34HXs0uT0et1Y63Cks/QCosYe0khaGMr6y/fBEup2k1+5fut3jxrZg1k1SrZ0gOpAU/LsQ==`.
Encoder, decoder and tokenizer hashes reproduce the prior source-backed checkpoint. This verifies
recovery consistency and package bytes; it is not an upstream model-signature or medical-accuracy claim.

The two uploaded backup parts reconstructed a 38,908,112-byte ZIP, SHA256
`a21ba31a36f1897b435782a81ad3dac9ba4e3c82bd6f09d88e09609448612bb9`.
All 35 manifest entries passed byte-size and SHA checks. Extraction paths were checked against
their destination root. Main PDF hash was independently checked. Historical receipts remain labeled
historical and are not counted as this run's tests. Original Qwen files on the phone were never
present in these backups, and no phone backup is claimed.
