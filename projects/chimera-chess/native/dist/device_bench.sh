#!/system/bin/sh
# CHIMERA V8 on-device benchmark (Android ARM64, e.g. OnePlus 15). PHONE NOT TESTED by the authors.
# Owner steps (no root, no ports opened): copy this folder to the phone, e.g. via
#   adb push dist /data/local/tmp/chimera   then   adb shell sh /data/local/tmp/chimera/device_bench.sh
# or run inside Termux from a private directory. Output: device_bench.txt next to this script.
cd "$(dirname "$0")" || exit 1
# Prefer the bionic (NDK) build on Android; the static glibc build is the fallback.
B=./chimera-android-arm64; [ -x "$B" ] || chmod 755 "$B" 2>/dev/null; "$B" bench 1 >/dev/null 2>&1 || B=./chimera-linux-arm64-static
chmod 755 "$B"
OUT=device_bench.txt
{
  echo "== device"; getprop ro.product.model 2>/dev/null; getprop ro.soc.model 2>/dev/null; uname -a
  echo "== sha256"; sha256sum "$B" 2>/dev/null || toybox sha256sum "$B"
  echo "== thermal before"; cat /sys/class/thermal/thermal_zone*/temp 2>/dev/null | head -8
  echo "== perft parity (expect 97862)"
  printf 'position fen r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1\ngo perft 3\nquit\n' | "$B" | tail -1
  echo "== fixed-depth bench (node count must equal host: see native/dist/PARITY.txt)"
  "$B" bench 8
  echo "== movetime 80 latency, 30 trials x 3 positions (internal + wall via date +%s%N)"
  for fen in "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1" "r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10"; do
    i=0; while [ $i -lt 30 ]; do
      printf 'isready\nposition fen %s\ngo movetime 80\nisready\nquit\n' "$fen" | CHIMERA_TRACE=1 "$B" 2>&1 | grep trace
      i=$((i+1)); done
  done
  echo "== sustained: 200 x movetime 80 in one process"
  ( i=0; echo isready; while [ $i -lt 200 ]; do echo "position startpos"; echo "go movetime 80"; echo isready; i=$((i+1)); done; echo quit ) | CHIMERA_TRACE=1 "$B" 2>&1 | grep trace | tail -5
  echo "== thermal after"; cat /sys/class/thermal/thermal_zone*/temp 2>/dev/null | head -8
} > "$OUT" 2>&1
echo "wrote $PWD/$OUT"
