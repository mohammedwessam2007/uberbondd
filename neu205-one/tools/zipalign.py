#!/usr/bin/env python3
"""Minimal zipalign: rewrite an APK so every STORED entry's data starts on a 4-byte boundary
(16 KiB for .so, Android 15+ page-size safe). resources.arsc and *.onnx are kept STORED.
Equivalent to `zipalign -p 4`. Used because the official build-tools are not available here."""
import sys, zipfile

STORE = (".onnx", "resources.arsc", ".so")


def align(src, dst):
    zin = zipfile.ZipFile(src)
    with open(dst, "wb") as f:
        zout = zipfile.ZipFile(f, "w")
        for info in zin.infolist():
            data = zin.read(info.filename)
            ni = zipfile.ZipInfo(info.filename, date_time=(2026, 11, 3, 0, 0, 0))
            ni.external_attr = info.external_attr
            stored = info.filename.endswith(STORE)
            ni.compress_type = zipfile.ZIP_STORED if stored else zipfile.ZIP_DEFLATED
            if stored:
                boundary = 16384 if info.filename.endswith(".so") else 4
                header_len = 30 + len(ni.filename.encode("utf-8"))
                pos = f.tell()
                pad = (-(pos + header_len + 4)) % boundary
                # extra field: 0xD935 (Android alignment) id + length + padding bytes
                ni.extra = (0xD935).to_bytes(2, "little") + (pad).to_bytes(2, "little") + b"\0" * pad
            zout.writestr(ni, data)
        zout.close()
    # verify
    z = zipfile.ZipFile(dst)
    with open(dst, "rb") as f:
        for i in z.infolist():
            if i.compress_type == zipfile.ZIP_STORED:
                f.seek(i.header_offset + 26)
                n, m = int.from_bytes(f.read(2), "little"), int.from_bytes(f.read(2), "little")
                off = i.header_offset + 30 + n + m
                need = 16384 if i.filename.endswith(".so") else 4
                assert off % need == 0, (i.filename, off)
    print("aligned", dst)


if __name__ == "__main__":
    align(sys.argv[1], sys.argv[2])
