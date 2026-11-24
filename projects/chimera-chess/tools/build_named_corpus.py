"""Named-player corpus from Lichess broadcast exports (CC0: "Database exports are released under the Creative Commons
CC0 license", database.lichess.org). Streams every lichess_db_broadcast_YYYY-MM.pgn.zst, keeps standard games in which
a target player has White or Black, writes one PGN per player plus a provenance manifest (file sha256, game counts).
Players are matched on the surname token in the PGN name field (e.g. "Dubov, Daniil"); ambiguous same-surname players
are filtered by the first-name token where given below.
Usage: python tools/build_named_corpus.py /tmp/bc lab/style_corpus"""
import glob
import hashlib
import io
import json
import os
import sys

import zstandard

TARGETS = {  # surname -> required first-name prefix (None = any)
    "Dubov": "Dan", "Shirov": "Ale", "Ivanchuk": "Vas", "Karpov": "Anat", "Morozevich": "Ale",
    "Basman": None, "Suttles": None, "Nezhmetdinov": None, "Planinc": None, "Kupreichik": None, "Tal": "Mik", "Petrosian": "Tig",
}


def who(name):
    n = name.replace(".", " ").replace(",", " ").split()
    if not n:
        return None
    for sur, first in TARGETS.items():
        if sur in n and (first is None or any(t.startswith(first) for t in n if t != sur)):
            return sur
    return None


def main(src, out):
    os.makedirs(out, exist_ok=True)
    fh = {}
    manifest = {"source": "https://database.lichess.org/ broadcast exports (CC0)", "files": {}, "players": {}}
    for path in sorted(glob.glob(os.path.join(src, "lichess_db_broadcast_*.pgn.zst"))):
        h = hashlib.sha256(open(path, "rb").read()).hexdigest()
        cnt = {}
        with open(path, "rb") as f:
            text = io.TextIOWrapper(zstandard.ZstdDecompressor().stream_reader(f), encoding="utf-8", errors="ignore")
            game, hdr = [], {}
            for line in text:
                if line.startswith("[Event ") and game:
                    _flush(game, hdr, fh, out, cnt, os.path.basename(path))
                    game, hdr = [], {}
                game.append(line)
                if line.startswith("[") and '"' in line:
                    k = line[1:line.index(" ")]
                    hdr[k] = line.split('"')[1]
            if game:
                _flush(game, hdr, fh, out, cnt, os.path.basename(path))
        manifest["files"][os.path.basename(path)] = {"sha256": h, "kept": cnt}
        for k, v in cnt.items():
            manifest["players"][k] = manifest["players"].get(k, 0) + v
        print(os.path.basename(path), cnt, flush=True)
    for f in fh.values():
        f.close()
    json.dump(manifest, open(os.path.join(out, "MANIFEST.json"), "w"), indent=1)
    print(json.dumps(manifest["players"], indent=1))


def _flush(game, hdr, fh, out, cnt, srcname):
    if hdr.get("Variant", "Standard") not in ("Standard", "From Position") or "SetUp" in hdr:
        return
    for side in ("White", "Black"):
        p = who(hdr.get(side, ""))
        if p:
            if p not in fh:
                fh[p] = open(os.path.join(out, f"{p}.pgn"), "w")
            fh[p].write(f'[CorpusSource "{srcname}"]\n[CorpusPlayerSide "{side}"]\n')
            fh[p].writelines(game)
            fh[p].write("\n")
            cnt[p] = cnt.get(p, 0) + 1


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
