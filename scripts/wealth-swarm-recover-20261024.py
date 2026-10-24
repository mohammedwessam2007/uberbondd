#!/usr/bin/env python3
"""Recover the 20-lane UberBond Wealth Swarm on its ORIGINAL Codespace.
Default: read-only audit. --resume: bounded two-process Copilot continuation.
Never treats process exit or a local PHOENIX file as independent proof/release.
"""
import json, os, pathlib, shutil, subprocess, sys, time

BASE = pathlib.Path(os.getenv('UBERBOND_SWARM_ROOT', '/tmp/uberbond-wealth-swarm-20261023'))
BOOT = 'swarm/wealth-swarm-bootstrap-20261023'
SOURCE = 'f9b423a0d56e18436a23a53ce75d3a14ae920567'
KNOWN_FINAL = {'A09': 'a239cf5d0752344d0dd53ab6a10f6cfc90e78554'}
MAX_PARALLEL = 2
RESUME = '--resume' in sys.argv

def cmd(*argv, cwd=None, required=True):
    p = subprocess.run(argv, cwd=cwd, text=True, capture_output=True, timeout=90)
    if p.returncode and required:
        raise RuntimeError('%s: %s' % (' '.join(argv), p.stderr[:300]))
    return p.stdout.strip() if p.returncode == 0 else None

REPO = pathlib.Path(cmd('git', 'rev-parse', '--show-toplevel'))
def git(*args, required=True):
    return cmd('git', *args, cwd=REPO, required=required)

if not git('show', f'origin/{BOOT}:artifacts/commercialization/swarm/COORDINATOR/swarm_manifest.json', required=False):
    if not RESUME:
        raise RuntimeError('Fetch bootstrap ref first, then audit again')
    git('fetch', '--no-tags', 'origin', f'refs/heads/{BOOT}:refs/remotes/origin/{BOOT}')
manifest = json.loads(git('show', f'origin/{BOOT}:artifacts/commercialization/swarm/COORDINATOR/swarm_manifest.json'))
workers = manifest['agents']
if len(workers) != 20 or len({w['id'] for w in workers}) != 20:
    raise RuntimeError('20 unique manifest agents required')
BASE.mkdir(parents=True, exist_ok=True)
(BASE / 'logs').mkdir(exist_ok=True)
status_file = BASE / 'RECOVERY_STATUS_20261024.json'
status = {}

def remote_head(a):
    s = git('ls-remote', '--heads', 'origin', f"refs/heads/{a['branch']}", required=False)
    return s.split()[0] if s else None

def has_receipt(a):
    p = BASE / a['id'] / a['docs_prefix']
    return p.is_dir() and any('FINAL RECEIPT' in f.read_text(errors='replace')
        for f in p.glob('PHOENIX*') if f.is_file())

def witnessed(a):
    return has_receipt(a) or status[a['id']].get('knownRemoteReceipt', False)

def save():
    status_file.write_text(json.dumps({
        'observedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'truthClass': 'LOCAL_WORKTREE_OBSERVATION_NOT_CUSTOMER_PROOF',
        'parallelLimit': MAX_PARALLEL, 'workers': status,
        'mainMerge': False, 'bankClearedContributionProfitUsd': 0}, indent=2) + '\n')

for a in workers:
    p = BASE / a['id']
    exists = (p / '.git').exists()
    head = cmd('git', 'rev-parse', 'HEAD', cwd=p, required=False) if exists else None
    remote = remote_head(a)
    known = bool(remote and KNOWN_FINAL.get(a['id']) == remote)
    receipt = has_receipt(a)
    status[a['id']] = dict(state='REMOTE_RECEIPT_REVIEW_NEEDED' if known else
        'LOCAL_RECEIPT_REVIEW_NEEDED' if receipt else 'UNVERIFIED',
        branch=a['branch'], localHead=head, remoteHead=remote,
        finalReceiptPresent=bool(known or receipt), knownRemoteReceipt=known)
save()
print('AUDIT', json.dumps({x: sum(v['state']==x for v in status.values())
    for x in {v['state'] for v in status.values()}}, sort_keys=True), str(status_file), flush=True)
if not RESUME:
    sys.exit(0)

ps = cmd('ps', '-eo', 'args=', required=False) or ''
if any('copilot' in line and '--agent wealth-swarm-' in line
       for line in ps.splitlines()):
    raise RuntimeError('Existing worker detected: inspect before relaunch')
if any(str(BASE / 'dispatch.py') in line and 'python' in line
       for line in ps.splitlines()):
    raise RuntimeError('Existing dispatcher detected: do not duplicate')
if not shutil.which('copilot'):
    raise RuntimeError('Copilot CLI unavailable; no paid-provider fallback')

allow = ','.join(('read','write','shell(node)','shell(npm)',
    'shell(git status)','shell(git diff)','shell(git add)','shell(git commit)',
    'shell(git show)','shell(git log)','shell(git rev-parse)',
    'shell(rg)','shell(grep)','shell(sed)','shell(cat)','shell(head)','shell(tail)','shell(ls)'))
deny = ','.join(('shell(git push)','shell(git merge)','shell(git reset)',
    'shell(git clean)','shell(gh)','shell(rm)','shell(curl)','shell(wget)',
    'shell(ssh)','shell(scp)','shell(sudo)','shell(docker)','shell(kubectl)'))

def prepare(a):
    p = BASE / a['id']
    if not (p / '.git').exists():
        if git('show-ref', '--verify', f"refs/heads/{a['branch']}", required=False):
            git('worktree', 'add', str(p), a['branch'])
        elif remote_head(a):
            git('fetch', '--no-tags', 'origin',
                f"refs/heads/{a['branch']}:refs/remotes/origin/{a['branch']}")
            git('worktree', 'add', '-b', a['branch'], str(p), f"origin/{a['branch']}")
        else:
            git('worktree', 'add', '-b', a['branch'], str(p), SOURCE)
    if cmd('git','branch','--show-current',cwd=p) != a['branch']:
        raise RuntimeError('Worktree belongs to another branch; refused')
    agentpath = f".github/agents/{a['name']}.agent.md"
    target = p / agentpath
    if not target.exists():
        content = git('show', f'origin/{BOOT}:{agentpath}')
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content + '\n')
    return p

queue = [a for a in workers if not witnessed(a)]
active = {}
idx = 0
while idx < len(queue) or active:
    while idx < len(queue) and len(active) < MAX_PARALLEL:
        a = queue[idx]
        idx += 1
        if a['id'] == 'A19' and not all(witnessed(w) for w in workers if w['id'] not in ('A19','A20')):
            status[a['id']]['state'] = 'BLOCKED_EARLIER_RECEIPTS'; save(); continue
        if a['id'] == 'A20' and not all(witnessed(w) for w in workers if w['id'] != 'A20'):
            status[a['id']]['state'] = 'BLOCKED_A19_AND_WORKER_RECEIPTS'; save(); continue
        try:
            p = prepare(a)
            logs = (BASE/'logs'/f"{a['id']}.recovery.log").open('a')
            errs = (BASE/'logs'/f"{a['id']}.recovery.err").open('a')
            env = dict(os.environ, COPILOT_AUTO_TIER='intelligence', COPILOT_AUTO_UPDATE='false')
            env.pop('COPILOT_ALLOW_ALL', None)
            prompt = (f"Execute independent UberBond {a['id']} custom-agent mission; $0 new spend, no contacts, charges, payments, DNS, KYC, provider mutations, "
                      "production deploy, git push, or main merge. Worktree files/tests only; "
                      "preserve truthful FINAL RECEIPT, exact HEAD and PHOENIX; no fake completion.")
            argv = ['copilot','-C',str(p),'--model','auto','--agent',a['name'],
                    '--allow-tool',allow,'--deny-tool',deny,'--disable-builtin-mcps','-p',prompt]
            proc = subprocess.Popen(argv, cwd=p, env=env, stdout=logs, stderr=errs,
                                    stdin=subprocess.DEVNULL)
            logs.close(); errs.close()
            active[a['id']] = (a, proc, time.monotonic())
            status[a['id']].update(state='RUNNING',pid=proc.pid); save()
            print('STARTED', a['id'], proc.pid, flush=True)
        except Exception as error:
            status[a['id']].update(state='START_FAILED', error=str(error)[:500]); save()
            print('FAILED', a['id'], str(error), flush=True)
    if not active:
        break
    time.sleep(5)
    for worker_id,(a,p,t0) in list(active.items()):
        expired = time.monotonic()-t0 > 35*60
        if expired and p.poll() is None:
            p.terminate()
        if p.poll() is None and not expired:
            continue
        status[worker_id].update(state='CANDIDATE_UNREVIEWED' if p.returncode == 0 and has_receipt(a)
            else 'FAILED_OR_INCOMPLETE', exitCode=p.returncode,
            timedOut=expired, finalReceiptPresent=has_receipt(a),
            localHead=cmd('git','rev-parse','HEAD',cwd=BASE/worker_id,required=False))
        del active[worker_id]; save()
        print('ENDED', worker_id, status[worker_id]['state'], flush=True)
print('STOPPED. No source release or external effect authorized. Read', status_file)
