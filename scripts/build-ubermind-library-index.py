#!/usr/bin/env python3
"""Generate ChatGPT-Project-searchable source map and 890 title navigation."""
import json, pathlib, hashlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
shards=sorted((ROOT/'artifacts/research/founder-moonshot-literal-corpus').glob('founder-moonshots-???-???.json'))
assert len(shards)==10
rows=[]
for f in shards:
 d=json.loads(f.read_text());
 for x in d['entries']:
  rows.append((x['ordinal'],x['literalTitle'],f.relative_to(ROOT).as_posix()))
assert [r[0] for r in rows]==list(range(1,891))
intro='''# UberMind Grand Library: searchable master index

**Read first:** `library/ubermind/LIBRARY_BOOTSTRAP.md` and `library/ubermind/PROJECT_INSTRUCTIONS_COPY_PASTE.md`. Full source packs are four ZIPs described by manifest; ZIP files alone may not be indexed by ChatGPT Project search. This index is a searchable companion, and source names are pointers, not full book content.

**Truth:** All 890 are original founder ideas, NOT completed experiments, IQ measurements or implemented features. The duplicate title at #0625/#0683 is preserved as two separate original entries. Use exact IDs and raw JSON shards when synthesizing. The project has a hierarchy of life, enterprise and safety objectives; never substitute one philosophy for constitutional instructions.

**Permanent archive names:** `UBERMIND_GRAND_LIBRARY_20261024_CANON_890.zip`; `UBERMIND_GRAND_LIBRARY_20261024_CLASSICS_PUBLIC_DOMAIN_US.zip`; `UBERMIND_GRAND_LIBRARY_20261024_PHILOSOPHY_OMEGA46_52.zip`; `UBERMIND_GRAND_LIBRARY_20261024_DEEP_RESEARCH_SNAPSHOT.zip`.

## Recovered original ideas 0001–0890
'''
out=[intro]
for number,title,shard in rows:out.append(f'- **{number:04d}** {title} · `{shard}`')
out.append('''\n## Philosophy module navigation
- Ω46 EQ / negotiator / incentives: `docs/architecture/UBERMIND_OMEGA46_HUMAN_STRATEGY_SOURCEBOOK_2026-10-24.md`; `.claude/skills/ubermind-social-strategy/SKILL.md`
- Ω47 nine classic/modern thinkers and legal-financial domains: `docs/architecture/UBERMIND_OMEGA47_STRATEGIC_PHILOSOPHY_CORPUS_2026-10-24.md`; `config/ubermind-omega47-strategic-philosophy-index.json`.
- Ω48 tiny on-demand Opus router: `.claude/skills/ubermind-strategy-flash/SKILL.md` and `scripts/ubermind-strategy-brief.mjs`.
- Ω49 asymmetric/institutional security: `docs/architecture/UBERMIND_OMEGA49_ASYMMETRIC_STRATEGY_2026-10-24.md`.
- Ω50 Beer/Taleb/Land & institution friction: `docs/architecture/UBERMIND_OMEGA50_SYSTEM_FRICTIONALISM_2026-10-24.md`.
- Ω51 red-team/resilience & sovereignty: `docs/architecture/UBERMIND_OMEGA51_ADVERSARIAL_RESILIENCE_2026-10-24.md`.
- Ω52 12 mathematical/creativity/finance research atoms: `docs/architecture/UBERMIND_OMEGA52_HYPERDIMENSIONAL_INVENTION_AND_QUANT_RESEARCH_2026-10-24.md`.
- Bibliography and rights: `library/ubermind/MODERN_BOOKS_AND_SOURCE_BIBLIOGRAPHY.md`; `library/ubermind/RIGHTS_AND_LIMITS.md`.

**Use:** local quick search `python3 scripts/query-ubermind-library.py --q "term" --archives .local/ubermind-archives`, or search this Markdown and retrieve matching source file through GitHub connector. Verified truth before answer.\n''')
target=ROOT/'library/ubermind/MASTER_SEARCH_INDEX_890_AND_OMEGA46_52.md';target.write_text('\n'.join(out))
print({'ideas':len(rows),'characters':len(target.read_text()),'sha256':hashlib.sha256(target.read_bytes()).hexdigest()})
