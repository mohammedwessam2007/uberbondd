#!/usr/bin/env python3
"""Safe public GitHub metadata sampler for the PHOENIX ten-wave repository inventory.
Never clones, imports, executes, installs, or authenticates to an upstream project.
"""
import argparse,hashlib,json,re,time,urllib.error,urllib.request
from pathlib import Path
from datetime import datetime,timezone
ROOT=Path('artifacts/research/phoenix-ten-wave-intake')
EXPECTED='33f699492ff3d9247b45cde41f2e50d8eb795ed3e1994723f349fe0df796e064'
PAT=re.compile(r'https://github[.]com/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)\Z')
parser=argparse.ArgumentParser()
parser.add_argument('--max',type=int,default=0)
parser.add_argument('--start',type=int,default=0)
parser.add_argument('--delay',type=float,default=0.5)
args=parser.parse_args()
if not (0<=args.max<=30 and 0<=args.start<243 and args.delay>=0):parser.error('max=0..30, start=0..242, delay>=0')
raw=(ROOT/'repositories.urls.txt').read_bytes();urls=raw.decode().splitlines()
assert hashlib.sha256(raw).hexdigest()==EXPECTED,'intake SHA mismatch'
assert len(urls)==len(set(urls))==243 and urls==sorted(urls),'count, order or dedupe failed'
assert all(PAT.fullmatch(u) for u in urls),'invalid url'
print('INTAKE_OK unique=243 sha256='+EXPECTED)
if args.max:
    rows=[]
    for n in range(args.start,min(243,args.start+args.max)):
        u=urls[n];o,r=PAT.fullmatch(u).groups()
        request=urllib.request.Request('https://api.github.com/repos/'+o+'/'+r,headers={'Accept':'application/vnd.github+json','User-Agent':'UberBond-Phoenix-Research','X-GitHub-Api-Version':'2022-11-28'})
        rec={'index':n,'url':u,'status':'UNKNOWN'}
        try:
            with urllib.request.urlopen(request,timeout=12) as response:d=json.load(response)
            rec.update(status='PUBLIC_METADATA_RETURNED',full_name=d.get('full_name'),archived=d.get('archived'),default_branch=d.get('default_branch'),license_spdx=(d.get('license') or {}).get('spdx_id'),last_push=d.get('pushed_at'),size_kb=d.get('size'))
        except urllib.error.HTTPError as ex:rec['status']='HTTP_'+str(ex.code)
        except (urllib.error.URLError,TimeoutError,ValueError) as ex:rec['status']='ERROR_'+type(ex).__name__
        rows.append(rec)
        if n < min(243,args.start+args.max)-1:time.sleep(args.delay)
    output={'schema':'phoenix.repo-metadata-probe.v1','observed_at_utc':datetime.now(timezone.utc).isoformat(),'manifest_sha256':EXPECTED,'no_source_executed':True,'records':rows}
    destination=ROOT/f'metadata-{args.start:03d}-{args.start+len(rows)-1:03d}.json'
    destination.write_text(json.dumps(output,indent=2,sort_keys=True)+'\n')
    print('METADATA_SAVED',destination,'successes',sum(r['status']=='PUBLIC_METADATA_RETURNED' for r in rows),'attempted',len(rows))
