#!/usr/bin/env python3
"""Structural evidence checker. Cannot establish scientific validity or truth."""
import argparse, collections, hashlib, json, pathlib, sys
p=argparse.ArgumentParser()
p.add_argument('ledger',type=pathlib.Path)
p.add_argument('--root',type=pathlib.Path,default=pathlib.Path('.'))
p.add_argument('--require-release',action='store_true')
a=p.parse_args(); root=a.root.resolve()
ref=json.loads(pathlib.Path(__file__).with_name('03_completion_template.json').read_text())
expected={r['id']:r for r in ref['records']}
ledger=json.loads(a.ledger.read_text()); rows=ledger['records']; errors=[]
ids=[r.get('id') for r in rows]; counts=collections.Counter(ids)
if len(rows)!=167 or set(ids)!=set(expected) or any(v!=1 for v in counts.values()): errors.append('Expected precisely one record for each original ID #001–#167.')
allowed={'UNRESOLVED','IMPLEMENTED_UNVALIDATED','BOUNDED_TRIAL','VERIFIED_VALIDATED','VERIFIED_FAIL_VARIANT','PROXY_ONLY','BLOCKED','ARCHIVE_ONLY','SOURCE_MISSING','RESEARCH_INCOMPLETE','REDESIGN_REQUIRED'}
stats=collections.Counter(); accounted=0; actionable=[]; open_ids=[]
for r in rows:
    i=r.get('id'); start=len(errors); status=r.get('status'); stats[status]+=1
    if i not in expected: continue
    e=expected[i]
    for k in ('title','source_anchor','source_sha256','workstream'):
        if r.get(k)!=e[k]: errors.append(f'{i}: canonical reference changed: {k}')
    if status not in allowed: errors.append(f'{i}: invalid status {status}')
    if e['workstream']=='ARCHIVE' and status not in {'ARCHIVE_ONLY','UNRESOLVED'}: errors.append(f'{i}: archival slot cannot be promoted')
    if e['workstream']=='SOURCE' and status not in {'SOURCE_MISSING','RESEARCH_INCOMPLETE','UNRESOLVED','BLOCKED'}: errors.append(f'{i}: source incomplete in supplied canon; new source requires separately verified amendment')
    if e['workstream'] not in {'ARCHIVE','SOURCE'}: actionable.append(i)
    if status=='VERIFIED_VALIDATED' or status=='VERIFIED_FAIL_VARIANT' or status=='BOUNDED_TRIAL':
        for k in ('implementation','command','baseline','metric','result','limitations'):
            if not isinstance(r.get(k),str) or not r[k].strip(): errors.append(f'{i}: missing {k}')
        if not r.get('artifacts'): errors.append(f'{i}: no artifacts')
    if status not in {'VERIFIED_VALIDATED','ARCHIVE_ONLY'} and not str(r.get('next_action','')).strip(): errors.append(f'{i}: missing next action')
    if status in {'ARCHIVE_ONLY','SOURCE_MISSING','BLOCKED','RESEARCH_INCOMPLETE','REDESIGN_REQUIRED'} and not str(r.get('limitations','')).strip(): errors.append(f'{i}: missing disposition reason')
    for f in r.get('artifacts',[]):
        try:
            path=(root/f['path']).resolve(); path.relative_to(root)
            if not path.is_file(): raise ValueError('missing artifact')
            digest=hashlib.sha256(path.read_bytes()).hexdigest()
            if digest!=f['sha256']: raise ValueError('hash mismatch')
        except (KeyError,TypeError,ValueError,OSError) as exc: errors.append(f'{i}: artifact {f}: {exc}')
    if status!='UNRESOLVED' and len(errors)==start: accounted+=1
    if e['workstream'] not in {'ARCHIVE','SOURCE'} and status!='VERIFIED_VALIDATED': open_ids.append(i)
print(json.dumps({'structurally_accounted':accounted,'total':167,'status_counts':stats,'non_archive_non_missing_recipe_slots':len(actionable),'unvalidated_recipe_slots':open_ids,'errors':errors,'scientific_validation':'NOT ESTABLISHED BY THIS CHECKER'},indent=2))
if a.require_release and (accounted!=167 or open_ids or errors or any(r.get('status')!='ARCHIVE_ONLY' for r in rows if r.get('id') in expected and expected[r['id']]['workstream']=='ARCHIVE')): sys.exit(2)
if errors: sys.exit(1)
