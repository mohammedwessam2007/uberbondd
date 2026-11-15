#!/usr/bin/env bash
# Private build products only; no model, signing key, phone or private book is modified.
set -euo pipefail
: "${LLAMA_SOURCE:?Official pinned llama.cpp checkout required}"
: "${NEU205_JNI_OUT:?Build directory outside the source checkout required}"
SOURCE="$(cd "$(dirname "$0")/../android/app/src/main/cpp" && pwd)"
case "$(realpath -m "$NEU205_JNI_OUT")/" in "$(git -C "$SOURCE" rev-parse --show-toplevel)/"*) echo 'JNI output must be outside source custody' >&2; exit 2;; esac
args=(-DLLAMA_SOURCE="$LLAMA_SOURCE" -DCMAKE_BUILD_TYPE=Release)
if [ "${NEU205_JNI_HOST:-0}" != 1 ]; then
 : "${ANDROID_NDK_HOME:?Official NDK 29.0.14206865 required}"
 args+=(-DCMAKE_TOOLCHAIN_FILE="$ANDROID_NDK_HOME/build/cmake/android.toolchain.cmake" -DANDROID_ABI=arm64-v8a -DANDROID_PLATFORM=android-31 -DANDROID_STL=c++_static)
fi
cmake -S "$SOURCE" -B "$NEU205_JNI_OUT" "${args[@]}"
cmake --build "$NEU205_JNI_OUT" --target neu205_qwen -j 2
if [ "${NEU205_JNI_HOST:-0}" != 1 ]; then
 "$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/linux-x86_64/bin/llvm-strip" -o "$NEU205_JNI_OUT/libneu205_qwen-stripped.so" "$NEU205_JNI_OUT/libneu205_qwen.so"
 "$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/linux-x86_64/bin/llvm-readelf" -l "$NEU205_JNI_OUT/libneu205_qwen-stripped.so"
fi
sha256sum "$NEU205_JNI_OUT"/libneu205_qwen*.so
