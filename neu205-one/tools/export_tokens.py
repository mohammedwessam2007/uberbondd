#!/usr/bin/env python3
"""vocab.json + added_tokens.json -> tokens.txt (line i = token string of id i)."""
import json, os, sys
d = sys.argv[1]
v = json.load(open(os.path.join(d, "vocab.json")))
v.update(json.load(open(os.path.join(d, "added_tokens.json"))))
n = max(v.values()) + 1
arr = [""] * n
for k, i in v.items():
    arr[i] = k
assert all("\n" not in t for t in arr)
open(sys.argv[2], "w", encoding="utf-8").write("\n".join(arr))
print(n, "tokens")
