#!/usr/bin/env python3
"""Structure-aware evidence chunks for the NEU205 book (owner-private output).

Input : page-indexed text JSONL ({"pdf_page_1based", "text"}) of the 299-page text-only book.
Output: corpus.jsonl, one chunk per line:
  {chunk_id, book_pdf_start_page, book_pdf_end_page, section_path, verbatim_text, source_hash}
plus corpus.manifest.json with corpus_sha256 (sha256 of corpus.jsonl bytes).

Chunks follow printed headings (Part / Section / Chapter / title lines / "Label:" lines), are
~WORDS words with OVERLAP-word overlap inside a section, never mix two sections, and may cross a
page break (start/end pages recorded). Text is verbatim (whitespace-normalised only).
"""
import hashlib, json, re, sys

WORDS, OVERLAP = 110, 30
CHAPTER = re.compile(r"^((?:Anatomy|Head|Neck|Histology)\s+Chapter\s+[0-9IVX]+\s*:.*|Section\s+[0-9]+\s*:.*|PART\s+I+\s*-.*|(?:Unit|UNIT)\s+[0-9IVX]+.*)$")
LABEL = re.compile(r"^[A-Z][A-Za-z /&()-]{2,40}:\s*$")


def is_title(l):
    s = re.sub(r"\([^)]*\)", "", l).strip()
    if not s or len(s) > 70 or s.endswith((".", ",", ";")) or re.match(r"^\s*([0-9]+|[a-z])\s*[-.)]", s):
        return False
    w = [x for x in s.split() if x]
    if len(w) > 9 or not s[0].isupper():
        return False
    caps = sum(1 for x in w if x[0].isupper() or x.lower() in {"of", "the", "and", "&", "in", "to", "a", "for", "-"})
    return caps >= len(w) - 1


def clean(s):
    return re.sub(r"\s+", " ", s).strip()


def build(pages_jsonl, out_prefix):
    pages = [json.loads(l) for l in open(pages_jsonl, encoding="utf-8")]
    pages.sort(key=lambda p: p["pdf_page_1based"])
    # Flatten to (page, line) keeping heading context.
    part, chapter, title = "", "", ""
    sections = []  # list of (path, [(page, word)])
    cur = None

    def open_section(path):
        nonlocal cur
        cur = (path, [])
        sections.append(cur)

    for p in pages:
        pg = p["pdf_page_1based"]
        for line in p["text"].split("\n"):
            s = line.strip()
            if not s:
                continue
            if s.startswith("PART I - ") or s.startswith("PART II") or s.startswith("PART III"):
                part = clean(s.split(":")[0]); chapter = ""; title = ""
                open_section(" > ".join(x for x in (part,) if x)); continue
            if CHAPTER.match(s):
                chapter = clean(s); title = ""
                open_section(" > ".join(x for x in (part, chapter) if x))
            elif is_title(s) and not LABEL.match(s):
                title = clean(s.rstrip(":"))
                open_section(" > ".join(x for x in (part, chapter, title) if x))
            if cur is None:
                open_section(part or "Front matter")
            for w in s.split():
                cur[1].append((pg, w))
    chunks = []
    for path, words in sections:
        if not words:
            continue
        step = WORDS - OVERLAP
        i = 0
        while True:
            win = words[i:i + WORDS]
            if not win:
                break
            text = " ".join(w for _, w in win)
            cid = f"c{len(chunks):05d}"
            chunks.append({"chunk_id": cid, "book_pdf_start_page": win[0][0], "book_pdf_end_page": win[-1][0],
                           "section_path": path, "verbatim_text": text,
                           "source_hash": hashlib.sha256(text.encode("utf-8")).hexdigest()})
            if i + WORDS >= len(words):
                break
            i += step
    body = "".join(json.dumps(c, ensure_ascii=False) + "\n" for c in chunks).encode("utf-8")
    open(out_prefix + ".jsonl", "wb").write(body)
    man = {"schema": "neu205.corpus.v1", "chunks": len(chunks), "words_per_chunk": WORDS, "overlap": OVERLAP,
           "pages": len(pages), "corpus_sha256": hashlib.sha256(body).hexdigest(),
           "source_pages_sha256": hashlib.sha256(open(pages_jsonl, "rb").read()).hexdigest(), "private": True}
    json.dump(man, open(out_prefix + ".manifest.json", "w"), indent=1)
    return man


if __name__ == "__main__":
    print(json.dumps(build(sys.argv[1], sys.argv[2])))
