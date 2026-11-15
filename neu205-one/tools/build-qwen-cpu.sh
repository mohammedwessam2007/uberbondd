#!/usr/bin/env bash
# Cross-build only. Does not install, use ADB, launch inference, or alter a model.
set -euo pipefail
: "${LLAMA_SOURCE:?Pinned llama.cpp checkout required}"
: "${ANDROID_NDK_HOME:?Official NDK 29.0.14206865 required}"
: "${NEU205_NATIVE_OUT:?Separate native build directory required}"
test "$(git -C "$LLAMA_SOURCE" rev-parse HEAD)" = 28b812d6cb9cfe569d368c2774c3886ad4fe10e8
cmake -S "$LLAMA_SOURCE" -B "$NEU205_NATIVE_OUT" \
 -DCMAKE_TOOLCHAIN_FILE="$ANDROID_NDK_HOME/build/cmake/android.toolchain.cmake" \
 -DANDROID_ABI=arm64-v8a -DANDROID_PLATFORM=android-31 -DANDROID_STL=c++_static \
 -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DGGML_NATIVE=OFF \
 -DGGML_OPENMP=OFF -DGGML_OPENCL=OFF -DGGML_HEXAGON=OFF -DLLAMA_OPENSSL=OFF \
 -DLLAMA_BUILD_TESTS=OFF -DLLAMA_BUILD_EXAMPLES=OFF -DLLAMA_BUILD_APP=OFF \
 -DLLAMA_BUILD_SERVER=ON -DLLAMA_BUILD_TOOLS=ON
cmake --build "$NEU205_NATIVE_OUT" --target llama-server llama-bench -j 2
