#!/usr/bin/env bash
set -euo pipefail
ARCH="${1:-x86_64}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT="${ROOT}/.cache/uberos/output-${ARCH}"
IMAGES="${OUT}/images"
case "${ARCH}" in
  x86_64)
    command -v qemu-system-x86_64 >/dev/null || { echo "qemu-system-x86_64 required" >&2; exit 2; }
    exec qemu-system-x86_64 -M pc -cpu max -m 512 -nographic -kernel "${IMAGES}/bzImage" -append "root=/dev/vda console=ttyS0" -drive "file=${IMAGES}/rootfs.ext2,if=virtio,format=raw" -net none
    ;;
  aarch64)
    command -v qemu-system-aarch64 >/dev/null || { echo "qemu-system-aarch64 required" >&2; exit 2; }
    exec qemu-system-aarch64 -M virt -cpu cortex-a57 -m 512 -nographic -kernel "${IMAGES}/Image" -append "root=/dev/vda console=ttyAMA0" -drive "file=${IMAGES}/rootfs.ext2,if=virtio,format=raw" -net none
    ;;
  *) echo "unsupported arch: ${ARCH}" >&2; exit 2 ;;
esac
