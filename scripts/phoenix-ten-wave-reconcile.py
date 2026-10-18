#!/usr/bin/env python3
"""PHOENIX ten-wave intake: validate and reconcile research catalogs without executing donors.

Stdlib only. Read-only inputs, output receipts only. Research ideas never become
installed/approved capabilities and UNKNOWN never becomes a pass.
"""
import argparse
import collections
import csv
import hashlib
import json
import pathlib
import re
from datetime import datetime, timezone

EXPECTED_URL_SHA='33f699492ff3d9247b45cde41f2e50d8eb795ed3e1994723f349fe0df796e064'
VALID_CATEGORIES={'REVIEW_REQUIRED','RESEARCH_ONLY','QUARANTINE'}
URL_RE=re.compile(r'^https://github\.com/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)$')
PROPOSED_COUNT=1304
GAP_WAVE4=256

def digest(raw):
    return hashlib.sha256(raw).hexdigest()

def load_csv(path, required):
    path=pathlib.Path(path)
    data=path.read_bytes()
    rows=list(csv.DictReader(data.decode('utf-8-sig').splitlines()))
    if not rows or any(key not in rows[0] for key in required):
        raise ValueError(f'INVALID_SCHEMA:{path.name}')
    return rows, {'file':path.name,'bytes':len(data),'sha256':digest(data)}

def atomic_tokens(text):
    return set(re.findall(r'[a-z0-9]+',str(text).lower())) - {'the','of','for','and','to','in','with','a','an','from','on'}

def reconcile(repo_csv, cap_csv, original_csv=None):
    repos,rf=load_csv(repo_csv,('canonical_url','classification','raw_row_count'))
    caps,cf=load_csv(cap_csv,('id','name','wave','family','donor_urls','status_as_recorded'))
    urls=[r['canonical_url'] for r in repos]
    assert len(urls)==243 and len(set(urls))==243 and urls==sorted(urls),'INVALID_CANONICAL_REPO_SET'
    assert all(URL_RE.fullmatch(x) for x in urls),'INVALID_GITHUB_URL'
    assert digest(('\n'.join(urls)+'\n').encode())==EXPECTED_URL_SHA,'CORPUS_SHA_MISMATCH'
    assert len(caps)==PROPOSED_COUNT,'CAPABILITY_COUNT_MISMATCH'
    ids=[r['id'] for r in caps]
    assert all(ids) and len(ids)==len(set(ids)),'DUPLICATE_OR_EMPTY_CAPABILITY_IDS'
    assert all(r['classification'] in VALID_CATEGORIES for r in repos),'UNKNOWN_REPO_CLASSIFICATION'
    assert all(r['wave'] in ('3','5','6','7','8','9','10') for r in caps),'UNEXPECTED_WAVE'
    original=None
    if original_csv:
        original,original_receipt=load_csv(original_csv,('github_repository_url','source_files'))
        assert len(original)==269,'ORIGINAL_ROW_COUNT_MISMATCH'
    else:original_receipt=None
    reference=collections.Counter()
    missing_refs=collections.Counter()
    external_sources=collections.Counter()
    risk={r['canonical_url']:r['classification'] for r in repos}
    cap_by_family=collections.Counter()
    cap_by_wave=collections.Counter()
    orphan=[]
    for c in caps:
        cap_by_family[c['family']]+=1;cap_by_wave[c['wave']]+=1
        refs=[s.strip() for s in c['donor_urls'].split(';') if s.strip()]
        if not refs:orphan.append(c['id'])
        for url in refs:
            if URL_RE.fullmatch(url):
                reference[url]+=1
                if url not in risk:missing_refs[url]+=1
            elif url.startswith('https://github.com/'):
                fragments=url.split('/')
                if len(fragments)>=5:
                    target='/'.join(fragments[:5]);external_sources[url]+=1
                    if target not in risk:missing_refs[target]+=1
                else:external_sources['INVALID:'+url[:120]]+=1
            elif url.startswith('https://'):
                external_sources[url]+=1
            else:external_sources['INVALID:'+url[:120]]+=1
    fingerprints=collections.defaultdict(list)
    for c in caps:
        key=' '.join(sorted(atomic_tokens(c['name'])))
        if key:fingerprints[key].append(c['id'])
    duplicate_groups=[ids for ids in fingerprints.values() if len(ids)>1]
    candidates=[]
    for r in repos:
        url=r['canonical_url'];classification=r['classification']
        candidates.append({'url':url,'risk_screen':classification,'proposed_capability_donor_mentions':reference[url],
                           'promotion_state':'RESEARCH_ONLY_NOT_ADMITTED','source_license':'UNKNOWN_UNLESS_LIVE_VERIFIED',
                           'runtime_verified':False})
    candidates.sort(key=lambda x:(0 if x['risk_screen']=='REVIEW_REQUIRED' else 1 if x['risk_screen']=='RESEARCH_ONLY' else 2,-x['proposed_capability_donor_mentions'],x['url']))
    return {'schema':'uberbond.phoenix.ten-wave.reconciliation.v1','truth_class':'RESEARCH_ASSET_NO_PROVIDER_PROMOTION',
            'inputs':{'repositories':rf,'capabilities':cf,'raw_rows':original_receipt},
            'summary':{'canonical_repository_urls':243,'original_repository_rows':len(original) if original else 'NOT_SUPPLIED',
                       'capability_proposals':len(caps),'missing_wave4_expected':GAP_WAVE4,
                       'risk_screen':dict(collections.Counter(r['classification'] for r in repos)),
                       'families':len(cap_by_family),'waves':dict(sorted(cap_by_wave.items())),
                       'github_repository_donor_links_not_in_manifest':len(missing_refs),
                       'external_or_document_reference_urls':len(external_sources),
                       'proposals_without_donor_links':len(orphan),
                       'potential_name_duplicate_groups':len(duplicate_groups)},
            'unlisted_github_donor_repositories':[{'url':x,'references':v} for x,v in missing_refs.most_common()],
            'non_repository_and_document_sources':[{'url':x,'references':v} for x,v in external_sources.most_common()],
            'no_donor_links_capability_ids':orphan,
            'name_fingerprint_duplicate_groups':duplicate_groups,
            'ranked_supplier_research_only':candidates,
            'claims_refused':['semantic novelty not established','license eligibility not established',
                              'no supplier authorized, installed, executed or promoted','no external effects',
                              'no certified business or scientific benefit', 'Wave 4 256 entries remain not recovered']}

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--repos',required=True,help='normalized research repositories CSV')
    parser.add_argument('--capabilities',required=True,help='1304-proposal original CSV')
    parser.add_argument('--original',help='optional source 269-row CSV')
    parser.add_argument('--output',help='optional JSON receipt')
    args=parser.parse_args()
    result=reconcile(args.repos,args.capabilities,args.original)
    result['reconciled_at_utc']=datetime.now(timezone.utc).isoformat()
    body=json.dumps(result,indent=2,sort_keys=True)+'\n'
    if args.output:
        p=pathlib.Path(args.output);p.parent.mkdir(parents=True,exist_ok=True);p.write_text(body)
    print(json.dumps({'status':'VERIFIED_RESEARCH_INTAKE','summary':result['summary']},sort_keys=True))

if __name__=='__main__':main()
