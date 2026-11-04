#!/usr/bin/env python3
"""Local bounded retrieval of exact source snippets from the four private ZIP packs.
Not an AI model, not a legal fact validator and not external web research."""
import argparse, pathlib, re, zipfile, json
ROOT=pathlib.Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('--q',required=True,help='Search words/idea id; max 150 chars')
parser.add_argument('--archives',default=str(ROOT/'.local/ubermind-archives'))
parser.add_argument('--limit',type=int,default=8)
args=parser.parse_args()
if not args.q.strip() or len(args.q)>150 or not 1<=args.limit<=30:parser.error('Query and limit bounds violated')
query=args.q.lower().strip();terms=list(dict.fromkeys(re.findall(r'[\w-]+',query)));assert terms
files=list(pathlib.Path(args.archives).glob('UBERMIND_GRAND_LIBRARY_20261024_*.zip'))
if not files:parser.error('No archives found; run scripts/build-ubermind-knowledge-archives.py')
results=[]
for arc in files:
 with zipfile.ZipFile(arc) as z:
  for n in z.namelist():
   if not n.endswith(('.txt','.md','.json')) or n in {'member-manifest.json'}:continue
   content=z.read(n)
   if len(content)>1_800_000:continue
   text=content.decode('utf-8',errors='replace')
   hay=n.lower()+' '+text.lower()
   hits=sum(min(hay.count(t),15) for t in terms)
   if not hits:continue
   score=hits+sum(12 for t in terms if t in n.lower())
   where=next((text.lower().find(t) for t in terms if t in text.lower()),0)
   s=max(0,where-100);chunk=text[s:s+430].replace('\n',' ')
   results.append((score,arc.name,n,chunk))
results.sort(key=lambda x:(-x[0],x[1],x[2]))
for score,archive,member,snippet in results[:args.limit]:
 print(json.dumps({'score':score,'archive':archive,'path':member,'sample':snippet},ensure_ascii=False))
print('MATCHES',len(results),'DISPLAYED',min(len(results),args.limit))
