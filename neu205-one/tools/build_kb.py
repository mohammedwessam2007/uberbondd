#!/usr/bin/env python3
"""Build the NEU205 knowledge pack from the owner's text-only department book.

Input : pdftotext output of NEU205_Neuroscience_Text_Only.pdf (form feeds = pages)
        + optional reviewed v0.2 course pack (teaching paraphrases) as overlay.
Output: kb.json  {meta, units:[{id, part, chapter, topic, relation, label, text, page}]}

Every unit's text is verbatim book text (whitespace-normalised). Nothing is
generated. Relation labels come only from labels printed in the book.
OWNER-PRIVATE OUTPUT: never commit kb.json.
"""
import hashlib, json, re, sys

# Printed label -> canonical relation. Directional sub-labels (Anteriorly:, Above:)
# are deliberately absent: they remain inside their parent unit.
LABELS = {
    "contents": "contents", "content": "contents",
    "attachments": "attachments", "attachment": "attachments",
    "relations": "relations", "superficial relations": "relations", "deep relations": "relations",
    "boundaries": "boundaries", "boundary": "boundaries", "walls": "boundaries",
    "formation": "formation", "formed by": "formation",
    "origin": "origin", "insertion": "insertion",
    "nerve supply": "nerve supply", "innervation": "nerve supply",
    "blood supply": "blood supply", "arterial supply": "blood supply", "venous drainage": "venous drainage",
    "lymphatic drainage": "lymphatic drainage",
    "action": "action", "actions": "action",
    "function": "function", "functions": "function", "importance": "function", "significance": "function",
    "course": "course", "branches": "branches", "termination": "termination", "tributaries": "tributaries",
    "parts": "parts", "divisions": "parts", "components": "parts", "subdivisions": "parts",
    "site": "site", "position": "site", "location": "site", "extent": "extent",
    "structure": "structure", "shape": "shape", "external features": "features", "features": "features",
    "surfaces": "surfaces", "roof": "roof", "floor": "floor",
    "applied anatomy": "applied", "applied": "applied", "clinical": "applied", "lesion": "applied",
    "lesions": "applied", "clinical notes": "applied",
    "causes": "causes", "cause": "causes", "types": "types", "type": "types",
    "definition": "definition", "def": "definition",
    "stimulus": "stimulus", "response": "response", "mechanism": "mechanism",
    "afferents": "afferents", "efferents": "efferents", "connections": "connections",
    "nuclei": "nuclei", "fibres": "fibres", "fibers": "fibres",
    "development": "development", "characteristics": "characteristics", "properties": "characteristics",
    "symptoms": "applied", "signs": "applied", "effects": "effects", "treatment": "treatment",
}
LABEL_RE = re.compile(r"^(?:[A-Z]\s*[-.)]\s*)?(" + "|".join(sorted((re.escape(k) for k in LABELS), key=len, reverse=True)) + r")\s*:\s*(.*)$", re.I)
INLINE_LABEL_RE = re.compile(r"(?<=[.;])\s+(" + "|".join(sorted((re.escape(k[0].upper() + k[1:]) for k in LABELS), key=len, reverse=True)) + r")\s*:")
ROMAN_TOPIC = re.compile(r"^(?:[IVX]+)\s*[-.)]\s*([A-Z][A-Za-z ,'&/()-]{2,60}?)\s*:\s*(.*)$")
DIRECTIONAL = {"above", "below", "anteriorly", "posteriorly", "medially", "laterally", "in front", "behind",
               "superiorly", "inferiorly", "anterior", "posterior", "medial", "lateral", "superior", "inferior",
               "muscles", "gland", "glands", "veins", "vein", "arteries", "artery", "nerves", "nerve", "bones",
               "ventral", "dorsal", "upper", "lower", "front", "back", "motor", "sensory", "example", "examples"}
CHAPTER = re.compile(r"^((?:Anatomy|Head|Neck|Histology)\s+Chapter\s+[0-9IVX]+\s*:\s*.+|Section\s+[0-9]+\s*:.+|PART\s+I+\s*-\s*\w+.*|Unit\s+[0-9]+.*)$")
NUMBERED = re.compile(r"^\s*(?:[0-9]+\s*[-.)]|[a-z]\s*[-.)]|[A-Z]\s*[-.)]|\(?[0-9a-z]\))")
STOP_TITLES = {"ilos", "n.b", "nb", "note"}


def clean(s):
    return re.sub(r"\s+", " ", s.replace(" ", " ")).strip()


LABEL_OF_RE = re.compile(r"^(" + "|".join(sorted((re.escape(k) for k in LABELS), key=len, reverse=True)) + r")\s+of\s+(?:the\s+)?([A-Za-z][A-Za-z0-9 ,'&/-]{2,50}?)\s*:\s*(.*)$", re.I)


def is_title(line):
    l = re.sub(r"\([^)]*\)", "", line).strip()
    if not l or len(l) > 70 or l.endswith((".", ",", ";")) or NUMBERED.match(l):
        return False
    w = [x.strip("()[]") for x in l.split() if x.strip("()[]")]
    if not w or len(w) > 9 or not l.lstrip("(")[0].isupper():
        return False
    if l.lower().rstrip(":") in STOP_TITLES or l.lower().rstrip(":").strip() in DIRECTIONAL:
        return False
    if LABEL_RE.match(l):
        return False
    # Title-ish: most words capitalised or very short heading.
    caps = sum(1 for x in w if x[0].isupper() or x.lower() in {"of", "the", "and", "&", "in", "to", "a", "for"})
    return caps >= len(w) - 1


def build(text_path, out_path, overlay_path=None):
    raw = open(text_path, encoding="utf-8").read()
    pages = raw.split("\f")
    units, part, chapter, topic = [], "", "", ""
    cur = None
    started = False

    def flush():
        nonlocal cur
        if cur and clean(cur["text"]):
            cur["text"] = clean(cur["text"])
            units.append(cur)
        cur = None

    def open_unit(rel, label, page, text=""):
        nonlocal cur
        flush()
        cur = {"part": part, "chapter": chapter, "topic": topic, "relation": rel, "label": label,
               "text": text, "page": page}

    for pno, page in enumerate(pages, start=1):
        for line in page.split("\n"):
            line = line.rstrip()
            if not started:
                if line.strip() == "PART I - ANATOMY" and pno > 1:
                    started = True
                    part = "Anatomy"
                continue
            s = line.strip()
            if not s:
                continue
            if s.startswith("PART II"):
                part = "Physiology"; flush(); chapter = "Physiology"; topic = ""; continue
            if s.startswith("PART III"):
                part = "Histology"; flush(); chapter = "Histology"; topic = ""; continue
            m = CHAPTER.match(s)
            if m:
                flush(); chapter = clean(s)
                topic = clean(chapter.split(":", 1)[1]) if "Chapter" in chapter and ":" in chapter else ""
                continue
            # split inline labels: "...root of the neck. Attachments:" -> two logical lines
            parts_ = INLINE_LABEL_RE.split(s)
            pieces = [parts_[0]]
            for k in range(1, len(parts_), 2):
                pieces.append(parts_[k] + ":" + parts_[k + 1])
            for piece in pieces:
                if not piece:
                    continue
                rt = ROMAN_TOPIC.match(piece)
                lm = LABEL_RE.match(piece)
                lo = LABEL_OF_RE.match(piece)
                if lo and not lm:
                    subj = clean(lo.group(2))
                    if subj.lower() not in topic.lower():
                        flush(); topic = subj[0].upper() + subj[1:]
                    open_unit(LABELS[lo.group(1).lower()], lo.group(1), pno, lo.group(3))
                elif lm:
                    rel = LABELS[lm.group(1).lower()]
                    open_unit(rel, lm.group(1), pno, lm.group(2))
                elif rt and not LABEL_RE.match(rt.group(1) + ":") and len(rt.group(1).split()) <= 6 and rt.group(1).lower().strip() not in DIRECTIONAL:
                    flush(); topic = clean(rt.group(1))
                    open_unit("definition", "", pno, rt.group(2))
                elif is_title(piece):
                    flush(); topic = clean(piece.rstrip(":"))
                    open_unit("definition", "", pno, "")
                else:
                    if cur is None:
                        open_unit("definition" if topic else "text", "", pno, "")
                    cur["text"] += " " + piece
    flush()
    # drop empty/trivial units, assign ids
    out = []
    for i, u in enumerate(units):
        if len(u["text"]) < 3:
            continue
        u["id"] = f"u{len(out):05d}"
        out.append(u)
    teaching = {}
    if overlay_path:
        pack = json.load(open(overlay_path))
        for e in pack["entries"]:
            teaching[(e["topic"].lower(), e["relation"].lower())] = {
                "brief": e["teaching"]["brief"], "explanation": e["teaching"]["explanation"],
                "source": e["source"]["document"], "id": e["id"]}
    src_sha = hashlib.sha256(open(text_path, "rb").read()).hexdigest()
    meta = {"schema": 2, "source_text_sha256": src_sha, "units": len(out),
            "pages": len(pages), "private": True,
            "note": "Verbatim department-book text segmented by printed headings/labels. Owner-private."}
    json.dump({"meta": meta, "units": out,
               "teaching": [{"topic": k[0], "relation": k[1], **v} for k, v in teaching.items()]},
              open(out_path, "w"), ensure_ascii=False, indent=0)
    return meta, out


if __name__ == "__main__":
    meta, units = build(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
    print(json.dumps(meta))
