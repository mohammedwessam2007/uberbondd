#!/usr/bin/env python3
"""Durably restore 20 independent Wealth Swarm source lanes; NOT 20 live AI sessions.

Default read-only audit. --restore checks out worker branches, places their existing
source-backed Copilot profiles and commits those profiles. --push additionally
pushes only the isolated worker branches after exact branch/status checks.
"""
import argparse, json, os, pathlib, subprocess, sys, time
p=argparse.ArgumentParser(); p.add_argument('--restore',action='store_true');p.add_argument('--push',action='store_true');args=p.parse_args()
if args.push and not args.restore: p.error('--push requires --restore')
root=pathlib.Path(os.environ.get('UBERBOND_SWARM_ROOT','/tmp/uberbond-wealth-swarm-20261023'))
boot='origin/swarm/wealth-swarm-bootstrap-20261023'
source='f9b423a0d56e18436a23a53ce75d3a14ae920567'
def run(*v,cwd=None,check=True):
 r=subprocess.run(v,cwd=cwd,text=True,capture_output=True,timeout=120)
 if check and r.returncode:raise RuntimeError(f'{v[0:3]} FAILED: {r.stderr[:600]}')
 return r.stdout.strip() if r.returncode==0 else ''
repo=pathlib.Path(run('git','rev-parse','--show-toplevel'))
def g(*v,check=True): return run('git',*v,cwd=repo,check=check)
manifest=json.loads(g('show',f'{boot}:artifacts/commercialization/swarm/COORDINATOR/swarm_manifest.json'))
assert len(manifest['agents'])==20 and len({x['branch'] for x in manifest['agents']})==20
assert g('cat-file','-t',source)=='commit'
root.mkdir(exist_ok=True,parents=True)
receipts=[]
for a in manifest['agents']:
 branch=a['branch'];id=a['id'];target=root/id;profile=f".github/agents/{a['name']}.agent.md"
 remote=g('ls-remote','--heads','origin',f'refs/heads/{branch}',check=False)
 remote_sha=remote.split()[0] if remote else None
 if not args.restore:
  receipts.append({'id':id,'branch':branch,'remoteHead':remote_sha,'workingCopyExists':(target/'.git').exists(),'state':'AUDIT_ONLY'})
  continue
 if not (target/'.git').exists():
  local=g('show-ref','--verify',f'refs/heads/{branch}',check=False)
  if local:g('worktree','add',str(target),branch)
  elif remote_sha:
   g('fetch','--no-tags','origin',f'refs/heads/{branch}:refs/remotes/origin/{branch}')
   g('worktree','add','-b',branch,str(target),f'origin/{branch}')
  else:g('worktree','add','-b',branch,str(target),source)
 assert run('git','branch','--show-current',cwd=target)==branch
 head=run('git','rev-parse','HEAD',cwd=target)
 profile_path=target/profile
 if not profile_path.exists():
  data=g('show',f'{boot}:{profile}')
  profile_path.parent.mkdir(parents=True,exist_ok=True)
  profile_path.write_text(data+'\n')
  run('git','add','--',profile,cwd=target)
  run('git','-c','user.name=UberBond PHOENIX','-c','user.email=phoenix@users.noreply.github.com','commit','-m',f'chore(swarm): restore {id} isolated agent profile, no model run',cwd=target)
 now=run('git','rev-parse','HEAD',cwd=target)
 changes=run('git','status','--porcelain',cwd=target)
 state='ISOLATED_PROFILE_LOCAL_ONLY'
 if changes:state='WORKTREE_DIRTY_NOT_PUSHED'
 elif args.push:
  run('git','push','origin',f'refs/heads/{branch}:refs/heads/{branch}',cwd=target)
  pushed=g('ls-remote','--heads','origin',f'refs/heads/{branch}')
  if not pushed or pushed.split()[0]!=now:raise RuntimeError('remote push SHA mismatch')
  state='CONFIGURED_REMOTE_NOT_EXECUTED'
 receipts.append({'id':id,'branch':branch,'localHead':now,'remoteHead':now if state=='CONFIGURED_REMOTE_NOT_EXECUTED' else remote_sha,'state':state,'worktree':str(target)})
 print(id,state,now[:12],flush=True)
result={'dateUTC':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'truthClass':'BRANCH_CONFIGURATION_ONLY_NO_MODEL_EXECUTION','mainMerge':False,'spendUsd':0,'agents':receipts}
(root/'RESTORE_WORKTREES_20261024.json').write_text(json.dumps(result,indent=2)+'\n')
print('RESULT',root/'RESTORE_WORKTREES_20261024.json')
