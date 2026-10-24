#!/usr/bin/env python3
"""Offline validation of grand-library ZIPs. No network, cost or effects."""
import hashlib, json, os, pathlib, sys, zipfile
ROOT=pathlib.Path(__file__).resolve().parents[1];OUT=ROOT/'.local/ubermind-archives'
PREFIX='UBERMIND_GRAND_LIBRARY_20261024'
LABELS=['CANON_890','CLASSICS_PUBLIC_DOMAIN_US','PHILOSOPHY_OMEGA46_52','DEEP_RESEARCH_SNAPSHOT']
def hash_bytes(x):return hashlib.sha256(x).hexdigest()
def validate(path):
 with zipfile.ZipFile(path) as z:
  if z.testzip() is not None:raise ValueError('CRC FAILURE')
  names=z.namelist();assert len(names)==len(set(names))
  for n in names:
   assert not n.startswith('/') and '..' not in pathlib.PurePosixPath(n).parts and not '\\' in n
  manifest=json.loads(z.read('member-manifest.json'))
  for name,proof in manifest['members'].items():
   payload=z.read(name)
   assert len(payload)==proof['bytes'] and hash_bytes(payload)==proof['sha256'],name
  assert set(names)==set(manifest['members'])|{'member-manifest.json'}
  if 'CANON_890' in path.name:
   shards=[n for n in names if n.startswith('artifacts/research/founder-moonshot-literal-corpus/founder-moonshots-') and n.endswith('.json')]
   assert len(shards)==10,len(shards)
   ids=[]
   for n in sorted(shards):ids.extend(e['ordinal'] for e in json.loads(z.read(n))['entries'])
   assert ids==list(range(1,891))
   transcript=z.read('artifacts/research/founder-moonshot-literal-corpus/RAW_SOURCE_Branch_Branch_New_chat.txt')
   assert hash_bytes(transcript)=='8a7be38681fd0bf15ebccecec099f25c86e4ea567f3b6e0892b6c73b2a319109'
  if 'CLASSICS' in path.name:
   books=[n for n in names if n.startswith('books/') and n.endswith('.txt')]
   assert len(books)==11,len(books)
   for n in books:
    payload=z.read(n).upper()
    assert b'GUTENBERG EBOOK' in payload and len(payload)>6000
  return len(names),sum(x.file_size for x in z.infolist())
ledger=json.loads((OUT/'LIBRARY_MANIFEST.json').read_text())
assert ledger['archiveCount']==4
for label in LABELS:
 path=OUT/f'{PREFIX}_{label}.zip'
 assert path.exists(),path
 assert ledger['archives'][label]['sha256']==hash_bytes(path.read_bytes())
 n,uncompressed=validate(path)
 print('VERIFIED',label,'members',n,'rawBytes',uncompressed,'zipBytes',path.stat().st_size)
print('FOUNDER_890_COMPLETE_AND_ALL_ARCHIVES_VALID')
