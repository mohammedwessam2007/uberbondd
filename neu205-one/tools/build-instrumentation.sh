#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../android"
: "${ANDROID_SDK_ROOT:=/workspace/neu205-tools/sdk}" "${NEU205_SIGNING_DIR:=/workspace/neu205-private/signing}"
TOOLS="$ANDROID_SDK_ROOT/build-tools/37.0.0"; JAR="$ANDROID_SDK_ROOT/platforms/android-37.2/android.jar"; OUT=build/instrumentation
mkdir -p "$OUT"/{classes,dex}
NEU205_INSTRUMENTATION_MANIFEST="$OUT/AndroidManifest.xml" python3 - <<'PY'
from pathlib import Path
import os
source=Path('instrumentation/AndroidManifest.xml').read_text()
Path(os.environ['NEU205_INSTRUMENTATION_MANIFEST']).write_text(source.replace('<manifest xmlns:', '<manifest package="ai.neu205.one.tests" xmlns:',1))
PY
"$TOOLS/aapt2" link -I "$JAR" --manifest "$OUT/AndroidManifest.xml" -o "$OUT/base.apk"
find instrumentation/src -name '*.java' > "$OUT/sources.txt"
java com.sun.tools.javac.Main --release 17 -cp "$JAR" -d "$OUT/classes" @"$OUT/sources.txt"
(cd "$OUT/classes" && jar cf ../tests.jar .)
java -cp "$TOOLS/lib/d8.jar" com.android.tools.r8.D8 --release --min-api 31 --lib "$JAR" --output "$OUT/dex" "$OUT/tests.jar"
cp "$OUT/base.apk" "$OUT/unsigned.apk"; (cd "$OUT/dex" && zip -q -X ../unsigned.apk classes*.dex)
"$TOOLS/zipalign" -f 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"
"$TOOLS/apksigner" sign --ks "$NEU205_SIGNING_DIR/candidate.p12" --ks-pass "file:$NEU205_SIGNING_DIR/password" --ks-key-alias neu205one --out "$OUT/NEU205-ONE-instrumentation.apk" "$OUT/aligned.apk"
"$TOOLS/apksigner" verify "$OUT/NEU205-ONE-instrumentation.apk"
sha256sum "$OUT/NEU205-ONE-instrumentation.apk"
