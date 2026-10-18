#!/usr/bin/env python3
"""Public read-only Git HEAD attestation, never clone/install/execute repository code."""
import argparse
import concurrent.futures
import hashlib
import json
import os
import pathlib
import re
import subprocess
from datetime import datetime,timezone

ROOT=pathlib.Path(__file__).resolve().parents[1]
DIR=ROOT/'artifacts/research/phoenix-ten-wave-intake'
MANIFEST_SHA='33f699492ff3d9247b45cde41f2e50d8eb795ed3e1994723f349fe0df796e064'
SHA=re.compile(r'^[0-9a-f]{40}\tHEAD$')

def probe(index,url,timeout=12):
    # Clean environment prevents configured auth helpers from dispatching private tokens.
    env={'PATH':os.environ.get('PATH','/usr/bin:/bin'),'HOME':'/tmp','GIT_TERMINAL_PROMPT':'0','GIT_CONFIG_NOSYSTEM':'1'}
    row={'index':index,'url':url,'status':'UNKNOWN','head_sha':None,'symbolic_head':None}
    try:
        p=subprocess.run(['git','-c','credential.helper=','ls-remote','--symref',url+'.git','HEAD'],env=env,timeout=timeout,text=True,capture_output=True,check=False)
        lines=p.stdout.splitlines()
        sha=[x.split('\t')[0] for x in lines if SHA.fullmatch(x)]
        ref=[x.split('\t')[0].removeprefix('ref: ') for x in lines if x.startswith('ref: ') and x.endswith('\tHEAD')]
        if p.returncode==0 and len(sha)==1:
            row.update(status='PUBLIC_HEAD_OBSERVED',head_sha=sha[0],symbolic_head=ref[0] if len(ref)==1 else None)
        else:
            row['status']='GIT_REF_UNAVAILABLE'
    except subprocess.TimeoutExpired:row['status']='TIMEOUT'
    except (OSError,ValueError):row['status']='LOCAL_GIT_ERROR'
    return row

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--max',type=int,default=20)
    p.add_argument('--workers',type=int,default=4)
    p.add_argument('--output',required=True)
    args=p.parse_args()
    if not 1<=args.max<=243 or not 1<=args.workers<=4:p.error('bounded 1..243 repos, <=4 workers')
    data=(DIR/'repositories.urls.txt').read_bytes();urls=data.decode('utf8').splitlines()
    assert len(urls)==243 and len(set(urls))==243 and hashlib.sha256(data).hexdigest()==MANIFEST_SHA
    tasks=list(enumerate(urls[:args.max]))
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as ex:
        rows=list(ex.map(lambda item:probe(*item),tasks))
    result={'schema':'uberbond.phoenix.public-head-attestation.v1',
        'observed_at_utc':datetime.now(timezone.utc).isoformat(),
        'source_manifest_sha256':MANIFEST_SHA,
        'checked':len(rows),
        'public_head_observed':sum(x['status']=='PUBLIC_HEAD_OBSERVED' for x in rows),
        'statuses':{k:sum(r['status']==k for r in rows) for k in sorted(set(r['status'] for r in rows))},
        'no_source_executed':True,'license_status':'NOT_VERIFIED','supplier_promotion':'NONE',
        'scope':'Unauthenticated public git ls-remote HEAD only; observed mutable refs are not pinned dependencies',
        'rows':rows}
    dest=pathlib.Path(args.output);dest.parent.mkdir(parents=True,exist_ok=True)
    dest.write_text(json.dumps(result,indent=2,sort_keys=True)+'\n')
    print(json.dumps({k:v for k,v in result.items() if k not in ['rows']},sort_keys=True))
if __name__=='__main__':main()
