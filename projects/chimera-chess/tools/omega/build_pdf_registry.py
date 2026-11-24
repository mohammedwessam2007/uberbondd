"""Builds canon/PDF_REQUIREMENTS_220.json + canon/PDF_SOURCE_MANIFEST.json from the two byte-preserved PDFs.
Source text: pdftotext -layout (poppler) of canon/pdf_sources/*.pdf. Each record keeps the VERBATIM raw table block (all
columns, original line breaks) as the authoritative original text; parsed columns/coefficients are a convenience layer.
Namespaced IDs CODEX220-001..220 never collide with the original 167-idea canon (CORE167-xxx).
Usage: python tools/omega/build_pdf_registry.py"""
import hashlib, json, re, subprocess
SRC = "canon/pdf_sources/"
A = SRC + "CHIMERA_Omega_Infinity_Complete_Master_Codex_and_Ken_Regan_Architecture.pdf"
B = SRC + "CHIMERA_Omega_Infinity_Complete_Engineering_Realization_and_Benchmark_Manual.pdf"


def sha(p): return hashlib.sha256(open(p, "rb").read()).hexdigest()


def layout(p):
    return subprocess.run(["pdftotext", "-layout", p, "-"], capture_output=True, text=True).stdout.splitlines()


def pages(lines, total):
    pg, out = 1, []
    for l in lines:
        out.append(pg)
        m = re.search(r"Page (\d+) of %d" % total, l)
        if m: pg = int(m.group(1)) + 1
    return out


def main():
    la = layout(A); pa = pages(la, 21)
    starts = [(i, int(m.group(1))) for i, l in enumerate(la) if (m := re.match(r"^\s{0,2}#(\d{1,3})\s{2,}\S", l))]
    rows = {}
    for k, (i, n) in enumerate(starts):
        j = starts[k + 1][0] if k + 1 < len(starts) else i + 12
        blk = []
        for l in la[i:j]:
            if re.search(r"Page \d+ of 21", l) or l.strip().startswith(("ID ", "4.", "5.", "CHIMERA")) or "Effect" == l.strip():
                if blk and (l.strip().startswith(("4.", "5."))): break
                continue
            blk.append(l.rstrip())
        while blk and not blk[-1].strip(): blk.pop()
        rows[n] = (i, blk)
    # infrastructure block #149-#169 is one row naming 21 modules
    infra_i = next(i for i, l in enumerate(la) if "#149–#169" in l)
    infra = " ".join(l.strip() for l in la[infra_i:infra_i + 17])
    names = dict((int(n), t.strip()) for t, n in re.findall(r"([A-Za-z0-9<+/\- ]+?)\s*\(\s*#(\d+)\s*\)", infra) if 149 <= int(n) <= 169)
    recs = []
    for n in range(1, 221):
        if 149 <= n <= 169:
            raw = la[infra_i:infra_i + 17]; ln = infra_i
            title = names.get(n, "UNPARSED")
            first_col = title
        else:
            ln, raw = rows[n]
            first = raw[0]
            m = re.match(r"\s*#\d+\s{2,}(.+?)(?:\s{2,}|$)", first); title = m.group(1).strip()
            col = first.index(title)
            for l in raw[1:3]:   # wrapped title words sit in the same column, followed by a 2+ space gap
                seg = l[col:col + 30]
                mm = re.match(r"([A-Z][\w'()\-/ ]*?)(?:\s{2,}|$)", seg)
                if not l[:col].strip() and mm and seg[:1].isupper() and len(mm.group(1)) < 22: title += " " + mm.group(1).strip()
                else: break
        VERBS = r" (?:Award|Penalize|Apply|Accept|Sample|Randomize|Emit|Extend|Disable|Query|Compute|Set|Break|Measure|Identify|When|After|Double|Alternate|Answer|Favor|Permit|Monitor|Steer|Perturb|Verify|Block|Prefer|Count|Boost|Trigger|Play|Rank|Advance|Place|Lock|Override|Push|Leave|Sacrifice|Repeat|Mirror|Surround|March|In|Stack|Underpromote|Promote|Combine|Classify|Select|Track|Trade|Bias|Reward|Escalate|Blend|Coarse-grain|Create|Delay|Suppress|Include)\b.*"
        title = re.sub(VERBS, "", title).strip()
        text = " ".join(" ".join(l.split()) for l in raw)
        coeffs = re.findall(r"[+\-−]\s?\d+(?:\.\d+)?|\d+(?:\.\d+)?\s?(?:cp|%|ms|s\b)", text)
        phase = "I" if n <= 36 else "II" if n <= 84 else "III" if n <= 148 else "INFRA" if n <= 169 else "IV"
        recs.append({"id": f"CODEX220-{n:03d}", "original_id": f"#{n}", "original_title": title, "phase": phase,
                     "source": {"document": "A", "file": A, "page": pa[ln], "layout_line": ln + 1},
                     "original_text_raw": raw, "original_text_joined": text, "coefficients_extracted": coeffs})
    json.dump({"schema": "codex220-requirements-1", "source_sha256": {"A": sha(A), "B": sha(B)},
               "note": "original_text_raw is verbatim pdftotext -layout output of the table row (three columns interleaved). Titles/coefficients are parsed and may need the raw text for disambiguation.",
               "records": recs}, open("canon/PDF_REQUIREMENTS_220_SOURCE.json", "w"), indent=1, ensure_ascii=False)
    json.dump({"documents": [
        {"key": "A", "path": A, "sha256": sha(A), "pages": 21, "title": "CHIMERA Ω∞ Master Architectural Codex & Ken Regan Architecture"},
        {"key": "B", "path": B, "sha256": sha(B), "pages": 14, "title": "CHIMERA Ω∞ Engineering Realization & Benchmark Verification Manual"}],
        "extraction": "poppler pdftotext -layout; rendered pages checked at 60 dpi for code truncation (manual pp.7-10)",
        "text_snapshots": [SRC + "CHIMERA_Omega_Infinity_Complete_Master_Codex_and_Ken_Regan_Architecture.layout.txt",
                           SRC + "CHIMERA_Omega_Infinity_Complete_Engineering_Realization_and_Benchmark_Manual.layout.txt"],
        "namespaces": {"CODEX220": "220 numbered ideas of document A (B maps to the same numbers)", "CORE167": "independent original 167-idea canon (canon/LEDGER_V13_167.json); numbers collide, meanings differ"}},
        open("canon/PDF_SOURCE_MANIFEST.json", "w"), indent=1, ensure_ascii=False)
    print(len(recs), "records;", sum(1 for r in recs if r["original_title"] in ("", "UNPARSED")), "untitled")



if __name__ == "__main__":
    main()
