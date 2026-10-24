#!/usr/bin/env python3
"""Preserve all 52 exact founder-reiterated directives in a privately retrievable ZIP.
Never overwrite canonical 890 founders; origin claims are ideas, not binding law or verified science.
"""
from __future__ import annotations
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import json, hashlib

ROOT=Path(__file__).resolve().parents[1]
LIB=ROOT/'library/ubermind'
OUT=ROOT/'.local/ubermind-archives'
SRC=LIB/'FOUNDER_DIRECTIVE_OMEGA47_TO_OMEGA52_ORIGINAL_2026-10-24.md'
MAN=LIB/'FOUNDER_DIRECTIVE_52_COVERAGE_MANIFEST.json'
AUDIT=LIB/'FOUNDER_DIRECTIVE_52_COVERAGE_AUDIT.md'
NAME='UBERMIND_GRAND_LIBRARY_20261024_FOUNDER_DIRECTIVES_52_ORIGINALS.zip'
sha=lambda content:hashlib.sha256(content).hexdigest()

def build():
    doc=SRC.read_text('utf-8')
    manifest=json.loads(MAN.read_text('utf-8'))
    entries=manifest['atoms']
    if sha(SRC.read_bytes())!=manifest['sourceSha256'] or len(entries)!=52:
        raise RuntimeError('Founder 52 source hash/count failed: do not generate partial archive')
    expected={'Ω47':16,'Ω49':10,'Ω50':6,'Ω51':8,'Ω52':12}
    if manifest['countsByOmega']!=expected:raise RuntimeError('Omega atom counts drifted')
    cards={};seen=set()
    for entry in entries:
        omega,ident=entry['omega'],entry['id']
        if (omega,ident) in seen:raise RuntimeError('Duplicate founder atom')
        seen.add((omega,ident))
        marker=entry['founderOriginalHeading']
        pos=doc.casefold().find(marker.casefold())
        if pos<0:raise RuntimeError('Original wording missing for '+omega+'/'+ident)
        if doc[:pos].count('\n')+1!=entry['sourceLine']:
            raise RuntimeError('Founder atom line drift '+ident)
        text=doc[pos:pos+850].split('\n\n',1)[0].strip()
        card=(f'# {omega} / {ident}\n\n'
            f'**Founder verbatim source file:** `{SRC.name}`.\n'
            f'**Original source line:** {entry["sourceLine"]}.\n'
            f'**Research pointer:** `{entry["indexPath"]}`.\n'
            '**Status:** founder concept, not current law, validated scientific claim or external execution authority.\n\n'
            f'## Original source excerpt\n\n{text}\n\n'
            'Retrieve the full original passage and evidence-bearing research before making conclusions.\n')
        cards[f'source_cards/{omega[1:]}_{ident}.md']=card.encode()
    assert len(cards)==52
    original_index=LIB/'MASTER_SEARCH_INDEX_890_AND_OMEGA46_52.md'
    extended_index=(original_index.read_text('utf-8') if original_index.exists() else '')+'\n\n---\n\n'+AUDIT.read_text('utf-8')
    core={
        SRC.name:SRC.read_bytes(),
        MAN.name:MAN.read_bytes(),
        AUDIT.name:AUDIT.read_bytes(),
        'MASTER_SEARCH_INDEX_890_PLUS_52.md':extended_index.encode(),
        'INSTRUCTIONS.md':('Full original founder assertions preserved for source fidelity. Use as research hypotheses, '
            'not automatically correct author quotations or authority for trading, manipulation, intrusion, '
            'evading tax or other external side effects. The complete 890 founder universe remains in the prior canon ZIP.\n').encode(),
        **cards,
    }
    proofs={key:{'bytes':len(body),'sha256':sha(body)} for key,body in core.items()}
    core['ARCHIVE_MEMBER_MANIFEST.json']=json.dumps({
        'schema':'ubermind.52.founder-originals.v1','entries':52,'sourceSha256':sha(SRC.read_bytes()),
        'memberProofs':proofs,
    },indent=2).encode()
    OUT.mkdir(exist_ok=True,parents=True)
    dest=OUT/NAME
    with ZipFile(dest,'w',ZIP_DEFLATED,compresslevel=9) as z:
        for key,val in sorted(core.items()):z.writestr(key,val)
    with ZipFile(dest) as z:
        if z.testzip() is not None:raise RuntimeError('bad ZIP CRC')
        cards_=[s for s in z.namelist() if s.startswith('source_cards/')]
        if len(cards_)!=52:raise RuntimeError('missing founder cards')
        for key,rec in proofs.items():
            b=z.read(key)
            if len(b)!=rec['bytes'] or sha(b)!=rec['sha256']:
                raise RuntimeError('member corruption '+key)
    print(json.dumps({'pack':str(dest),'bytes':dest.stat().st_size,'sha256':sha(dest.read_bytes()),'founderAtoms':52,'crc':'PASS','provenance':'SOURCE_TRANSCRIPTION'}))

if __name__=='__main__':build()