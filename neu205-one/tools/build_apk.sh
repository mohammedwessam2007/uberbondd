#!/usr/bin/env bash
# Reproducible NEU205 ONE APK build without Gradle.
#
# Required inputs (environment):
#   ANDROID_JAR  framework jar with resources.arsc (verified: Robolectric android-all-instrumented 17, sha1 42dc8bf9...)
#   ORT_AAR      com.microsoft.onnxruntime:onnxruntime-android 1.31.1 AAR (Maven Central)
#   AAPT2        aapt2 binary            } Google build tools. Packaging is BLOCKED in the build
#   D8_JAR       d8/r8 jar               } container until the owner allows one of these sources
#   APKSIGNER    apksigner jar (apksig)  } (see docs/OWNER_ACTIONS.md).
#   ASSETS       private asset dir (models/whisper/*, kb/kb.json)  -- owner-private, never committed
#   KEYSTORE     signing keystore (created on first run, kept outside git), KS_PASS password
# Output: build/apk/NEU205-0.3.0-native.apk (+ .sha256)
set -euo pipefail
cd "$(dirname "$0")/.."
: "${ANDROID_JAR:?}" "${ORT_AAR:?}" "${AAPT2:?}" "${D8_JAR:?}" "${APKSIGNER:?}" "${ASSETS:?}" "${KEYSTORE:?}" "${KS_PASS:?}"
OUT=build/apk; rm -rf "$OUT"; mkdir -p "$OUT"/{res,gen,classes,dex,ort,lib}

# 1. resources + manifest + assets (onnx/json/txt stored uncompressed for direct copy)
"$AAPT2" compile --dir app/src/main/res -o "$OUT/res/res.zip"
"$AAPT2" link -I "$ANDROID_JAR" --manifest app/src/main/AndroidManifest.xml -A "$ASSETS" \
  -0 onnx -0 json -0 txt -0 properties --java "$OUT/gen" -o "$OUT/base.apk" "$OUT/res/res.zip"

# 2. java -> dex (core + app + ORT java API)
(cd "$OUT/ort" && unzip -q -o "$OLDPWD/$ORT_AAR" classes.jar 'jni/arm64-v8a/*')
javac --release 11 -cp "$ANDROID_JAR:$OUT/ort/classes.jar" -d "$OUT/classes" \
  $(find core/src/main -name '*.java' -not -path '*/tools/*') $(find "$OUT/gen" -name '*.java') $(find app/src/main/java -name '*.java')
(cd "$OUT/classes" && jar cf ../app-classes.jar .)
java -cp "$D8_JAR" com.android.tools.r8.D8 --release --min-api 31 --lib "$ANDROID_JAR" \
  --output "$OUT/dex" "$OUT/app-classes.jar" "$OUT/ort/classes.jar"

# 3. add dex + arm64 native libs, align, sign
cp "$OUT/base.apk" "$OUT/unsigned.apk"
mkdir -p "$OUT/lib/lib/arm64-v8a" && cp "$OUT"/ort/jni/arm64-v8a/*.so "$OUT/lib/lib/arm64-v8a/"
(cd "$OUT/dex" && zip -q -X ../unsigned.apk classes*.dex)
(cd "$OUT/lib" && zip -q -X ../unsigned.apk lib/arm64-v8a/*.so)
python3 -I tools/zipalign.py "$OUT/unsigned.apk" "$OUT/aligned.apk"
if [ ! -f "$KEYSTORE" ]; then
  keytool -genkeypair -keystore "$KEYSTORE" -storepass "$KS_PASS" -keypass "$KS_PASS" -alias neu205one \
    -keyalg RSA -keysize 3072 -validity 10000 -dname "CN=NEU205 ONE private owner build"
fi
java -jar "$APKSIGNER" sign --ks "$KEYSTORE" --ks-pass "pass:$KS_PASS" --ks-key-alias neu205one \
  --v1-signing-enabled false --v2-signing-enabled true --v3-signing-enabled true \
  --out "$OUT/NEU205-0.3.0-native.apk" "$OUT/aligned.apk"
java -jar "$APKSIGNER" verify --verbose --print-certs "$OUT/NEU205-0.3.0-native.apk" | tee "$OUT/verify.txt"
sha256sum "$OUT/NEU205-0.3.0-native.apk" | tee "$OUT/NEU205-0.3.0-native.apk.sha256"
