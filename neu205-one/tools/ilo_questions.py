#!/usr/bin/env python3
"""Turn the book's printed ILO bullets into spoken-style questions (held-out evaluation).
Output TSV: question <TAB> chapter. Mechanical rewrite only; no answers are generated."""
import re, sys
raw = open(sys.argv[1], encoding="utf-8").read().replace("\f", "\n")
lines = raw.split("\n")
chapter, out, in_ilo, buf = "", [], False, []
CH = re.compile(r"^((?:Anatomy|Head|Neck|Histology)\s+Chapter\s+[0-9IVX]+\s*:.+)$")
VERB = re.compile(r"^(Describe|Discuss|Identify|Explain|List|Define|Enumerate|Mention|Recognize|Name|Outline|Recall|State)\s+(the\s+)?(.+)$", re.I)
for l in lines[60:]:
    s = l.strip()
    m = CH.match(s)
    if m: chapter = s; continue
    if s.startswith("ILOs"): in_ilo = True; continue
    if in_ilo:
        if not s: continue
        v = VERB.match(s)
        if v:
            buf.append(v.group(3).rstrip(".;"))
            continue
        if buf and s[0].islower():  # wrapped continuation line
            buf[-1] += " " + s.rstrip(".;"); continue
        in_ilo = False
        for b in buf:
            for part in re.split(r"\s*;\s*", b):
                if len(part.split()) >= 2:
                    out.append(("What are the " + part + "?", chapter))
        buf = []
for q, c in out:
    print(q + "\t" + c)
