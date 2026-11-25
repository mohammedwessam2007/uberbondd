#!/bin/sh
# Build the standalone native engine for ARM64 Android with 16 KiB alignment.
set -eu
cd "$(dirname "$0")"
compiler="$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/linux-x86_64/bin/aarch64-linux-android28-clang++"
out=dist/chimera-terminus-android-arm64
if [ "$#" -gt 0 ]; then out="$1"; fi
tmp="$out.tmp.$$"
trap 'rm -f "$tmp"' EXIT
# Static ARM64 Bionic requires the executable TLS segment to align to 64 bytes.
printf '%s\n' 'alignas(64) thread_local unsigned char chimera_android_tls_anchor __attribute__((used, retain)) = 1;' |
    "$compiler" -std=c++17 -O2 -DNDEBUG -pthread -fno-emulated-tls -static -Wl,-z,max-page-size=16384 chimera.cpp -x c++ - -o "$tmp"
mv -f "$tmp" "$out"
