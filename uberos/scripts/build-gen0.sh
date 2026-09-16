#!/usr/bin/env bash
set -euo pipefail

ARCH="${1:-x86_64}"
BUILDROOT_VERSION="${BUILDROOT_VERSION:-2026.08}"
BUILDROOT_SHA256="${BUILDROOT_SHA256:-87aaca4164ea9d5c8085854953018263f7963f07c22e73a2a2185cc98c581c34}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CACHE="${UBEROS_CACHE:-${ROOT}/.cache/uberos}"
SRC="${CACHE}/buildroot-${BUILDROOT_VERSION}"
ARCHIVE="${CACHE}/buildroot-${BUILDROOT_VERSION}.tar.xz"
URL="https://buildroot.org/downloads/buildroot-${BUILDROOT_VERSION}.tar.xz"
EXTERNAL="${ROOT}/uberos/buildroot"
OVERLAY="${EXTERNAL}/board/uberos/rootfs-overlay"

mkdir -p "${CACHE}"
if [[ ! -d "${SRC}" ]]; then
  if [[ ! -f "${ARCHIVE}" ]]; then
    command -v curl >/dev/null || { echo "curl required" >&2; exit 2; }
    curl --fail --location --proto '=https' --tlsv1.2 "${URL}" -o "${ARCHIVE}"
  fi
  printf '%s  %s\n' "${BUILDROOT_SHA256}" "${ARCHIVE}" | sha256sum -c -
  tar -C "${CACHE}" -xf "${ARCHIVE}"
fi

case "${ARCH}" in
  x86_64) DEFCONFIG=qemu_x86_64_defconfig ;;
  aarch64) DEFCONFIG=qemu_aarch64_virt_defconfig ;;
  *) echo "unsupported arch: ${ARCH}; use x86_64 or aarch64" >&2; exit 2 ;;
esac

OUT="${ROOT}/.cache/uberos/output-${ARCH}"
make -C "${SRC}" O="${OUT}" BR2_EXTERNAL="${EXTERNAL}" "${DEFCONFIG}"
CONFIG="${OUT}/.config"
python3 - "${CONFIG}" "${OVERLAY}" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
overlay = sys.argv[2]
lines = p.read_text().splitlines()
keys = {"BR2_TARGET_GENERIC_HOSTNAME": '"uberos"', "BR2_TARGET_GENERIC_ISSUE": '"UBER/OS Generation-0"', "BR2_ROOTFS_OVERLAY": f'"{overlay}"'}
out = []
for line in lines:
    if any(line.startswith(k + "=") or line == f"# {k} is not set" for k in keys):
        continue
    out.append(line)
for k, v in keys.items(): out.append(f"{k}={v}")
p.write_text("\n".join(out) + "\n")
PY
make -C "${SRC}" O="${OUT}" BR2_EXTERNAL="${EXTERNAL}" olddefconfig
make -C "${SRC}" O="${OUT}" BR2_EXTERNAL="${EXTERNAL}"
echo "UBER/OS Generation-0 image ready under ${OUT}/images"
echo "Run: ${ROOT}/uberos/scripts/run-qemu.sh ${ARCH}"
