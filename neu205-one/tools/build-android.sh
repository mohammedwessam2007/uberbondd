#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../android"
: "${ANDROID_SDK_ROOT:=/workspace/neu205-tools/sdk}"
: "${ORT_AAR:=/workspace/neu205-tools/onnxruntime-android-1.31.1.aar}"
: "${NEU205_ASSETS:=/workspace/neu205-private/assets}"
: "${NEU205_ABI:=arm64-v8a}"
: "${NEU205_SIGNING_DIR:=/workspace/neu205-private/signing}"
: "${NEU205_QWEN_LIB:?Verified stripped ARM64 JNI library required}"
# A replacement signer would break the installed app's identity and pack trust.
test -f "$NEU205_SIGNING_DIR/candidate.p12" && test -f "$NEU205_SIGNING_DIR/password" || { echo 'Original candidate signing identity unavailable; release build blocked' >&2; exit 2; }
test -f "$NEU205_QWEN_LIB"
TOOLS="$ANDROID_SDK_ROOT/build-tools/37.0.0"
JAR="$ANDROID_SDK_ROOT/platforms/android-37.2/android.jar"
OUT="${NEU205_BUILD_DIR:-build/manual}"
case "$OUT" in build/*) ;; *) echo "Output must stay under android/build" >&2; exit 2;; esac
NEU205_VALIDATED_OUT="$OUT" python3 - <<'PY'
from pathlib import Path
import os
base = Path('build').resolve()
out = Path(os.environ['NEU205_VALIDATED_OUT']).resolve()
if out == base or not out.is_relative_to(base):
    raise SystemExit('Refusing output path outside android/build')
PY
rm -rf "$OUT"
mkdir -p "$OUT"/{compiled,generated,classes,dex,ort,assets/models/whisper} "$NEU205_SIGNING_DIR"
cp -R app/src/main/assets/. "$OUT/assets/"
cp "$NEU205_ASSETS"/models/whisper/{encoder.onnx,decoder.onnx,tokens.txt,config.properties} "$OUT/assets/models/whisper/"
cp "$NEU205_ASSETS"/{corpus.jsonl,corpus.manifest.json} "$OUT/assets/"
"$TOOLS/aapt2" compile --dir app/src/main/res -o "$OUT/compiled/resources.zip"
NEU205_MANIFEST_OUT="$OUT/AndroidManifest.xml" python3 - <<'PY'
from pathlib import Path
import os
s=Path('app/src/main/AndroidManifest.xml').read_text().replace('<manifest xmlns:', '<manifest package="ai.neu205.one" xmlns:',1)
Path(os.environ['NEU205_MANIFEST_OUT']).write_text(s)
PY
"$TOOLS/aapt2" link -I "$JAR" --manifest "$OUT/AndroidManifest.xml" --min-sdk-version 31 --target-sdk-version 37 --version-code 3 --version-name 1.2.0-v12-reconstructed -A "$OUT/assets" -0 onnx -0 jsonl --java "$OUT/generated" -o "$OUT/base.apk" "$OUT/compiled/resources.zip"
unzip -q -o "$ORT_AAR" classes.jar 'jni/*' -d "$OUT/ort"
find app/src/main/java ../core/src/main/java "$OUT/generated" -name '*.java' -not -path '*/core/tools/*' | LC_ALL=C sort > "$OUT/sources.txt"
java com.sun.tools.javac.Main --release 17 -cp "$JAR:$OUT/ort/classes.jar" -d "$OUT/classes" @"$OUT/sources.txt"
(cd "$OUT/classes" && jar cf ../app-classes.jar .)
java -cp "$TOOLS/lib/d8.jar" com.android.tools.r8.D8 --release --min-api 31 --lib "$JAR" --output "$OUT/dex" "$OUT/app-classes.jar" "$OUT/ort/classes.jar"
cp "$OUT/base.apk" "$OUT/unsigned.apk"
(cd "$OUT/dex" && zip -q -X ../unsigned.apk classes*.dex)
mkdir -p "$OUT/native/lib/$NEU205_ABI"
cp "$OUT"/ort/jni/"$NEU205_ABI"/*.so "$OUT/native/lib/$NEU205_ABI/"
test "$NEU205_ABI" = arm64-v8a || { echo 'Native Qwen candidate is ARM64 only' >&2; exit 2; }
cp "$NEU205_QWEN_LIB" "$OUT/native/lib/$NEU205_ABI/libneu205_qwen.so"
(cd "$OUT/native" && zip -q -X ../unsigned.apk lib/"$NEU205_ABI"/*.so)
python3 ../tools/normalize_apk.py "$OUT/unsigned.apk" "$OUT/normalized.apk"
"$TOOLS/zipalign" -f -P 16 4 "$OUT/normalized.apk" "$OUT/aligned.apk"
# Preserve the original candidate signer; never silently mint a replacement.
"$TOOLS/apksigner" sign --ks "$NEU205_SIGNING_DIR/candidate.p12" --ks-pass "file:$NEU205_SIGNING_DIR/password" --ks-key-alias neu205one --v1-signing-enabled false --v2-signing-enabled true --v3-signing-enabled true --out "$OUT/NEU205-ONE-candidate.apk" "$OUT/aligned.apk"
"$TOOLS/apksigner" verify --verbose --print-certs "$OUT/NEU205-ONE-candidate.apk" > "$OUT/signature.txt"
"$TOOLS/zipalign" -c -P 16 4 "$OUT/NEU205-ONE-candidate.apk"
sha256sum "$OUT/NEU205-ONE-candidate.apk" > "$OUT/NEU205-ONE-candidate.apk.sha256"
cat "$OUT/NEU205-ONE-candidate.apk.sha256"
