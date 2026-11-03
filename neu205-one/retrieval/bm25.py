"""Dependency-free BM25 with a deterministic light stemmer (mirrored by the Java port).

Tokens: lowercase alphanumerics; ions kept (K+ -> kion); a small suffix stemmer; stop words dropped.
Section path is indexed together with the chunk text (heading-to-body linkage).
"""
import math, re

STOP = set("""a an the is are was were be been being and or of in on for from to by with at into about as that this these
those it its what which who whom whose how why where when does do did can could should would may might there here tell me
please describe explain define give list name main you your i my we our s also then than so such any all""".split())
ION = re.compile(r"\b(K|Na|Ca|Cl|Mg|H|Fe|Zn)(?:\d?\+{1,2}|-)(?=\W|$)")
TOK = re.compile(r"[a-z0-9]+")


# Morphological families the suffix rules cannot join (general English/anatomy, not question-specific).
LEMMA = {"contain": "content", "contains": "content", "contained": "content", "containing": "content", "contents": "content",
         "innervation": "innervate", "innervated": "innervate", "innervates": "innervate", "innervating": "innervate",
         "originate": "origin", "originates": "origin", "arise": "origin", "arises": "origin", "arising": "origin",
         "arose": "origin", "inserted": "insertion", "inserts": "insertion", "insert": "insertion",
         "drains": "drainage", "drain": "drainage", "drained": "drainage", "draining": "drainage",
         "located": "site", "location": "site", "situated": "site", "lies": "lie", "lying": "lie",
         "functions": "function", "functional": "function", "supplies": "supply", "supplied": "supply",
         "branches": "branch", "branching": "branch", "terminates": "termination", "terminate": "termination",
         "ends": "termination"}


def stem(w):
    if w in LEMMA:
        return LEMMA[w]
    if len(w) <= 3:
        return w
    for suf, rep, minlen in (("ational", "ate", 8), ("ization", "ize", 8), ("iveness", "ive", 8), ("fulness", "ful", 8),
                             ("ousness", "ous", 8), ("ies", "y", 5), ("ied", "y", 5), ("sses", "ss", 5), ("ing", "", 6),
                             ("edly", "", 7), ("ed", "", 5), ("ly", "", 5), ("es", "", 5), ("s", "", 4)):
        if w.endswith(suf) and len(w) >= minlen and not (suf == "s" and w.endswith(("ss", "us", "is"))) \
                and not (suf == "ed" and w.endswith("eed")):
            return w[: len(w) - len(suf)] + rep
    return w


def tokens(text, drop_stop=True):
    t = ION.sub(lambda m: " " + m.group(1).lower() + "ion ", text).lower().replace("-", " ")
    out = []
    for w in TOK.findall(t):
        if drop_stop and (w in STOP or len(w) < 2):
            continue
        out.append(stem(w))
    return out


class BM25:
    def __init__(self, docs, k1=1.2, b=0.75):
        self.k1, self.b = k1, b
        self.docs = [tokens(d) for d in docs]
        self.n = len(self.docs)
        self.avg = sum(len(d) for d in self.docs) / max(1, self.n)
        self.df, self.tf = {}, []
        self.post = {}
        for i, d in enumerate(self.docs):
            tf = {}
            for w in d:
                tf[w] = tf.get(w, 0) + 1
            self.tf.append(tf)
            for w in tf:
                self.df[w] = self.df.get(w, 0) + 1
                self.post.setdefault(w, []).append(i)

    def idf(self, w):
        df = self.df.get(w, 0)
        return math.log(1 + (self.n - df + 0.5) / (df + 0.5))

    def search(self, query, k=20):
        q = tokens(query)
        scores = {}
        for w in set(q):
            if w not in self.post:
                continue
            idf = self.idf(w)
            for i in self.post[w]:
                tf = self.tf[i][w]
                dl = len(self.docs[i])
                scores[i] = scores.get(i, 0.0) + idf * tf * (self.k1 + 1) / (tf + self.k1 * (1 - self.b + self.b * dl / self.avg))
        return sorted(scores.items(), key=lambda x: -x[1])[:k]

    def coverage(self, query, i):
        """IDF-weighted fraction of query terms present in doc i (used for abstention)."""
        q = set(tokens(query))
        tot = sum(self.idf(w) for w in q) or 1.0
        return sum(self.idf(w) for w in q if w in self.tf[i]) / tot
