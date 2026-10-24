#!/usr/bin/env python3
"""Reproducible UberMind 4-pack for PRIVATE Project/Library: provenance, 890 and PD books.
Books must retain Project Gutenberg notices; US PD is not worldwide PD. No secrets uploaded.
"""
from __future__ import annotations
import hashlib, json, os, pathlib, re, subprocess, sys, zipfile, requests
from datetime import datetime
ROOT=pathlib.Path(__file__).resolve().parents[1]
PACK_ROOT=ROOT/'library/ubermind'
CACHE=ROOT/'.cache/ubermind-books'
OUT=ROOT/'.local/ubermind-archives'
ZIP_OPTIONS={'compression':zipfile.ZIP_DEFLATED,'compresslevel':8,'allowZip64':True}
BASIS=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
DATE='2026-10-24'
PREFIX='UBERMIND_GRAND_LIBRARY_20261024'
BOOKS=json.loads((PACK_ROOT/'BOOKS_PUBLIC_DOMAIN_US.json').read_text())['editions']


def sha(b:bytes)->str:return hashlib.sha256(b).hexdigest()
def data(path):return (ROOT/path).read_bytes()

def git_files(patterns):
  cmd=['git','ls-files','-z','--',*patterns]
  return [p for p in subprocess.check_output(cmd,cwd=ROOT).decode().split('\0') if p]

def safe(p:str)->bool:
  banned=('/.git/','/.env','/secrets/','/credentials/','/tokens/','/node_modules/','/logs/','/private_key','/session','/cookies')
  q='/'+p.lower().replace('\\','/')
  return not any(x in q for x in banned) and not p.startswith('/') and '..' not in pathlib.PurePosixPath(p).parts

def put(z,members,name: str,body: bytes,source: str='repo'):
  if name in members:raise ValueError('duplicate ZIP path '+name)
  if not safe(name):raise ValueError('unsafe ZIP member '+name)
  info=zipfile.ZipInfo(name,date_time=(2026,10,24,0,0,0))
  info.compress_type=zipfile.ZIP_DEFLATED
  info.external_attr=0o644<<16
  z.writestr(info,body,compress_type=zipfile.ZIP_DEFLATED,compresslevel=8)
  members[name]={'sha256':sha(body),'bytes':len(body),'source':source}

def write_zip(label,add):
  OUT.mkdir(parents=True,exist_ok=True)
  path=OUT/f'{PREFIX}_{label}.zip'
  with zipfile.ZipFile(path,'w',**ZIP_OPTIONS) as z:
    members={}
    put(z,members,'READ_ME_FIRST.md',f'# {label}\nUberMind private intellectual continuity pack, {DATE}.\nRepository source commit: {BASIS}\nPurpose: founder 890 continuity and referenced books/research, NOT model fine-tuning or instruction overrides.\nSee RIGHTS_AND_LIMITS.md and member-manifest.json for contents and checksums.\n'.encode())
    put(z,members,'RIGHTS_AND_LIMITS.md',data('library/ubermind/RIGHTS_AND_LIMITS.md'))
    add(z,members)
    manifest={'schema':'uberbond.ubermind.private-zip-member-manifest.v1','pack':label,'date':DATE,'repoSha':BASIS,'members':members,'filesBeforeManifest':len(members)}
    put(z,members,'member-manifest.json',json.dumps(manifest,ensure_ascii=False,indent=2).encode())
  with zipfile.ZipFile(path) as z:
    if z.testzip() is not None:raise RuntimeError('invalid ZIP '+label)
    names=z.namelist(); assert len(names)==len(set(names))
  return {'file':path.name,'sizeBytes':path.stat().st_size,'sha256':sha(path.read_bytes()),'members':len(names),'uncompressedBytes':sum(v['bytes'] for v in members.values())}

def add_repo(z,members,paths):
  for p in sorted(set(paths)):
    if not safe(p):continue
    full=ROOT/p
    if not full.is_file() or full.is_symlink():continue
    put(z,members,p,full.read_bytes(),'git:'+BASIS+':'+p)

def add_canon(z,members):
  paths=[
    'AI_START_HERE.md','AGENTS.md','CLAUDE.md','NORTH_STAR.md','UBERBOND_CANON.md','UBERBOND_BOOTSTRAP.json',
    'docs/UNIVERSAL_CONTEXT_PROTOCOL.md','docs/SOVEREIGN_COGNITIVE_CONTINUUM_TOTAL_NORTH_STAR.md',
    'docs/UBERBOND_TOTAL_BRAIN.md','docs/UBERBOND_MASTER_MEMORY.md','docs/CURRENT_HANDOFF.json',
    'docs/CURRENT_SYSTEM_STATE.md','docs/CROSS_CHAT_CONTINUITY.md','docs/PERPETUAL_FRONTIER_GENESIS_CANON.md',
    'docs/PERSONAL_CIVILIZATION_ENGINE_NORTH_STAR.md','docs/FOUNDER_890_UNIVERSAL_CROSS_CHAT_INTEGRATION.md',
    'docs/FOUNDER_MOONSHOT_LITERAL_CORPUS_890.md',
    'docs/forensics/FOUNDER_890_ORIGINAL_IDEAS_VERBATIM_2026-10-09.md',
    'docs/forensics/2026-10-10/890-original-ideas-complete-index.md',
    'artifacts/uberbond-total-brain.json','artifacts/uberbond-memory-index.json',
    'artifacts/perpetual-frontier-genesis.json','artifacts/sovereign-cognitive-continuum-total-north-star.json',
    'library/ubermind/LIBRARY_BOOTSTRAP.md','library/ubermind/PROJECT_INSTRUCTIONS_COPY_PASTE.md','library/ubermind/MASTER_SEARCH_INDEX_890_AND_OMEGA46_52.md']
  paths+=git_files(['artifacts/research/founder-moonshot-literal-corpus/**','artifacts/research/FOUNDER_MOONSHOT_890_IMPORT_VERIFICATION_20260920.json'])
  add_repo(z,members,paths)

def download_book(book):
  CACHE.mkdir(parents=True,exist_ok=True)
  epub=book['id']; path=CACHE/f'pg{epub}.txt'
  if path.exists() and path.stat().st_size>6000:return path.read_bytes()
  for url in [f'https://www.gutenberg.org/cache/epub/{epub}/pg{epub}.txt',f'https://www.gutenberg.org/ebooks/{epub}.txt.utf-8']:
    try:
      resp=requests.get(url,timeout=60,headers={'User-Agent':'UberMind private scholarly library builder; no redistribution beyond owner private environment'})
      content=resp.content
      if resp.status_code==200 and len(content)>6000 and b'PROJECT GUTENBERG EBOOK' in content.upper():
        path.write_bytes(content)
        return content
    except requests.RequestException:pass
  raise RuntimeError(f'Could not verify complete Gutenberg text #{epub}')

def add_classics(z,members):
  put(z,members,'BOOKS_PUBLIC_DOMAIN_US.json',data('library/ubermind/BOOKS_PUBLIC_DOMAIN_US.json'))
  for book in BOOKS:
    book_id=book['id'];body=download_book(book)
    put(z,members,f'books/pg{book_id}_{re.sub("[^a-z0-9]+","_",book["title"].lower()).strip("_")}.txt',body,source=f'https://www.gutenberg.org/ebooks/{book_id}; USA_PD_MARKED; check local law')

def add_doctrine(z,members):
  patterns=['docs/architecture/UBERMIND_OMEGA4*.md','docs/architecture/UBERMIND_OMEGA5*.md','docs/MACHIAVELLI_WEALTH_ENGINE.md','docs/FOUNDER_890_UNIVERSAL_CROSS_CHAT_INTEGRATION.md',
   'docs/architecture/*MACHIAVELLI*','docs/architecture/*EMOTIONAL*',
   'config/ubermind-omega*.json','src/ubermind-omega*.mjs','scripts/ubermind-strategy-brief.mjs',
   'tests/ubermind-omega*.test.mjs','.claude/skills/ubermind-*/SKILL.md','library/ubermind/*.md','library/ubermind/*.json']
  add_repo(z,members,git_files(patterns))

def add_deep(z,members):
  # Only tracked, explicitly scoped source/canon assets; no .env, credentials, private chat apps, logs, or external data.
  p=git_files(['docs/**','artifacts/research/**','artifacts/uberbond-*.json','artifacts/perpetual-frontier-genesis.json',
   'artifacts/sovereign-cognitive-continuum-total-north-star.json','config/**','src/ubermind*.mjs','src/founder-moonshot-literal-corpus.mjs',
   '.claude/skills/ubermind-*/SKILL.md','library/ubermind/*.md','library/ubermind/*.json'])
  add_repo(z,members,p)

def verify_890():
  raw=ROOT/'artifacts/research/founder-moonshot-literal-corpus/RAW_SOURCE_Branch_Branch_New_chat.txt'
  sha_expected='8a7be38681fd0bf15ebccecec099f25c86e4ea567f3b6e0892b6c73b2a319109'
  if sha(raw.read_bytes())!=sha_expected:raise RuntimeError('FOUNDER 890 ORIGINAL SOURCE HASH DRIFT')
  nums=[]
  shards=sorted((ROOT/'artifacts/research/founder-moonshot-literal-corpus').glob('founder-moonshots-???-???.json'))
  if len(shards)!=10:raise RuntimeError('Expected ten 890 shards; got '+str(len(shards)))
  for f in shards:
    j=json.loads(f.read_text());nums.extend(x['ordinal'] for x in j['entries'])
  if nums!=list(range(1,891)):raise RuntimeError('890 corpus missing or reordered')
  return {'originalSha256':sha_expected,'ideaCount':len(nums),'shards':len(shards),'rawBytes':raw.stat().st_size}

if __name__=='__main__':
  verified=verify_890();print('VERIFIED_FOUNDER_890',json.dumps(verified),flush=True)
  results={}
  for label,fn in [('CANON_890',add_canon),('CLASSICS_PUBLIC_DOMAIN_US',add_classics),('PHILOSOPHY_OMEGA46_52',add_doctrine),('DEEP_RESEARCH_SNAPSHOT',add_deep)]:
    results[label]=write_zip(label,fn)
    print('PACK_OK',label,json.dumps(results[label]),flush=True)
  ledger={'schema':'uberbond.ubermind.grand-library-archive-manifest.v1','date':DATE,'sourceCommit':BASIS,'founder890':verified,'archiveCount':len(results),'archives':results,
    'rights':'See RIGHTS_AND_LIMITS.md; US public-domain label is not universal permission; copyrighted books indexed only',
    'retention':'Local .local/ubermind-archives and GitHub Actions artifact, not automatically attached to ChatGPT Project',
    'verification':'zip CRC test and per-member SHA256 manifest; build script validates 890 exact source and 10 contiguous shards'}
  (OUT/'LIBRARY_MANIFEST.json').write_text(json.dumps(ledger,ensure_ascii=False,indent=2)+'\n')
  print('COMPLETE',json.dumps({'totalZipBytes':sum(v['sizeBytes'] for v in results.values()),'packs':len(results)}),flush=True)
