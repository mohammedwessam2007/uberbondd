#!/usr/bin/env python3
"""Normalize an unsigned APK before zipalign/signing. Never run on a signed deliverable."""
import argparse
import datetime
from pathlib import Path
import zipfile


def normalize(source, destination, epoch=1793664000):
    source, destination = Path(source), Path(destination)
    if source.resolve() == destination.resolve():
        raise ValueError('Use a distinct unsigned output')
    dt = datetime.datetime.fromtimestamp(epoch, datetime.timezone.utc)
    if not 1980 <= dt.year <= 2107:
        raise ValueError('ZIP timestamp outside supported range')
    stamp = (dt.year, dt.month, dt.day, dt.hour, dt.minute, dt.second // 2 * 2)
    with zipfile.ZipFile(source) as src:
        names = src.namelist()
        if len(names) != len(set(names)):
            raise ValueError('Duplicate APK entries')
        if any(n.upper().startswith('META-INF/') and n.upper().endswith(('.RSA', '.DSA', '.EC', '.SF')) for n in names):
            raise ValueError('Input must be unsigned')
        with zipfile.ZipFile(destination, 'w') as dst:
            for name in sorted(names):
                old = src.getinfo(name)
                item = zipfile.ZipInfo(name, stamp)
                item.compress_type = old.compress_type
                item.external_attr = old.external_attr
                item.internal_attr = old.internal_attr
                item.create_system = 3
                dst.writestr(item, src.read(name), compresslevel=9)


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('unsigned_input', type=Path)
    p.add_argument('unsigned_output', type=Path)
    p.add_argument('--epoch', type=int, default=1793664000)
    a = p.parse_args()
    normalize(a.unsigned_input, a.unsigned_output, a.epoch)
