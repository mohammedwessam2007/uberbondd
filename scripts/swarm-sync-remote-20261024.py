#!/usr/bin/env python3
"""Safely align restored local worktrees to remote isolated startup branches.
Back up diverged profile-only local commits before any reset. Never rewrite remotes.
"""
import json,os,pathlib,subprocess,sys,time
root=pathlib.Path(os.environ.get('UBERBOND_SWARM_ROOT','/tmp/uberbond-wealth-swarm-20261023'))
apply='--apply' in sys.argv

def run(*v,cwd=None,check=True):
 q=subprocess.run(v,cwd=cwd,capture_output=True,text=True,timeout=120)
 if check and q.returncode:raise RuntimeError(f'{v[:3]}: {q.stderr[:450]}')
 return q.stdout.strip() if q.returncode==0 else None
repo=pathlib.Path(run('git','rev-parse','--show-toplevel'))
def g(*v,check=True):return run('git',*v,cwd=repo,check=check)
manifest=json.loads(g('show','origin/swarm/wealth-swarm-bootstrap-20261023:artifacts/commercialization/swarm/COORDINATOR/swarm_manifest.json'))
if apply:g('fetch','--no-tags','origin','refs/heads/swarm/A*:refs/remotes/origin/swarm/A*')
results=[]
for a in manifest['agents']:
 p=root/a['id']; b=a['branch']; r=f'origin/{b}';f=f".github/agents/{a['name']}.agent.md"
 assert (p/'.git').exists(), f'missing {a["id"]}'
 assert run('git','branch','--show-current',cwd=p)==b
 assert not run('git','status','--porcelain',cwd=p), f'dirty {a["id"]}'
 head=run('git','rev-parse','HEAD',cwd=p);remote=g('rev-parse',r)
 if head==remote: state='ALREADY_SYNCED'
 elif run('git','merge-base','--is-ancestor',head,remote,cwd=p,check=False) is not None:
  state='FAST_FORWARD_PENDING'
  if apply:run('git','merge','--ff-only',r,cwd=p);state='SYNCED_FAST_FORWARD'
 elif run('git','merge-base','--is-ancestor',remote,head,cwd=p,check=False) is not None:
  state='LOCAL_AHEAD_NO_RESET'
 else:
  changed=(run('git','diff','--name-only',run('git','merge-base',head,remote,cwd=p),head,cwd=p) or '').splitlines()
  local=run('git','show',f'{head}:{f}',cwd=p,check=False)
  distant=run('git','show',f'{remote}:{f}',cwd=p,check=False)
  assert changed==[f] and local is not None and distant is not None and local.strip()==distant.strip(), f'unexpected unique local changes {a["id"]}: {changed}'
  state='PROFILE_DUPLICATE_REQUIRES_ARCHIVE'
  if apply:
   archive=f'archive/swarm-profile-{a["id"]}-20261024'
   existing=g('rev-parse','--verify','--quiet',f'refs/heads/{archive}',check=False)
   assert not existing or existing==head, f'archive collision {a["id"]}'
   if not existing:g('branch',archive,head)
   run('git','reset','--hard',remote,cwd=p)
   state='ARCHIVED_DUPLICATE_AND_SYNCED'
 now=run('git','rev-parse','HEAD',cwd=p)
 results.append({'id':a['id'],'state':state,'before':head,'remote':remote,'after':now})
 print(a['id'],state,now[:12],flush=True)
if apply:
 out=root/'REMOTE_ALIGNMENT_20261024.json';out.write_text(json.dumps({'truthClass':'CONFIGURATION_ALIGNMENT_ONLY_NO_AI_SESSIONS','dateUTC':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'workers':results},indent=2)+'\n');print('RECEIPT',out)
