#!/usr/bin/env python3
"""Read-only PHOENIX design corpus doctor: all recovered waves, no supplier admission.

This indexes research ideas by original record pointer. No external process,
network, installation, deployment, model call, permission or promotion path.
"""
import argparse
import collections
import hashlib
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
REL = pathlib.Path('artifacts/research/phoenix-ten-wave-intake')
FILES = {
    3: ('PHOENIX_CAPABILITY_GENOME_WAVE3_320_2026-10-17.json', 320, '7eacbdf54091f8c9510476285de3057eb613f1b0f33644e3ba3c3d2a5e5a12da'),
    4: ('PHOENIX_CROSS_PLATFORM_LEVERAGE_WAVE4_256_2026-10-17.json', 256, 'gitblob:2e229e356816a2da644b63eef9501436b640c9e4'),
    5: ('PHOENIX_WAVE5_TRANSCENDENT_AUTOMATION_204_2026-10-17.json', 204, '5760ebec3bc3ce97f880a66bdd6f3b48b48b0570b2bef6bcf4f978ab6ef21137'),
    6: ('PHOENIX_WAVE6_PROOF_CARRYING_EVOLUTION_120_2026-10-17.json', 120, '45f2ec0c115a08d23f23c212ce5c213b1b9bd0c3cd40d8b7878c9695e6169745'),
    7: ('PHOENIX_WAVE7_DISCOVERY_ENGINE_120_2026-10-17.json', 120, '113ffa27c89761a2c7e2f1ed47398b8a78a9c54f573e5700a7cd07b3b0a03ba7'),
    8: ('PHOENIX_WAVE8_UNKNOWN_WORLD_TRANSFER_160_2026-10-17.json', 160, '2cabb975da8fca41c09adf8b818b29de7db511ec4cb9fb8f1540cd5742f0b71c'),
    9: ('PHOENIX_WAVE9_MISSING_MACHINERY_180_2026-10-17.json', 180, 'd96e5ad45f70e44e1add36bd81d26faef8c89a41c61fcbabbad461501b6d537b'),
    10: ('PHOENIX_WAVE10_AUTONOMOUS_POSSIBILITY_ENGINE_200_2026-10-17.json', 200, 'abdfa4a33f328e3376ca468323866e883ca695aea43d93b4dd18bd27802c58b7'),
}
URL_SHA = '33f699492ff3d9247b45cde41f2e50d8eb795ed3e1994723f349fe0df796e064'
TERMS = re.compile(r'[a-z0-9]+')
STOP = {'the','for','and','from','with','this','that','into','your','has','are','was','could','should','all','not'}
BAD_STATES = {'APPROVED','ACTIVE','VERIFIED_LIVE','PRODUCTION','DEPLOYED','INSTALLED','PROMOTED','ELIGIBLE'}
PROPOSAL_KEYS = ('name','capability_candidate')
ACCEPTANCE_KEYS = ('acceptance_test','family_acceptance_test','acceptance','acceptance_requirement')
SOURCE_KEYS = ('donor_urls','source_donors','source_donor','sources','donor_ids')
ALL_SOURCE_FILES = 'original-genomes'

def source_hash(value):
    raw = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()
    return hashlib.sha256(raw).hexdigest()

def unique_obj(pairs):
    out={}
    for k,v in pairs:
        if k in out:
            raise ValueError('DUPLICATE_JSON_KEY:'+str(k))
        out[k]=v
    return out

def _read_json(path):
    if path.is_symlink() or not path.is_file():
        raise ValueError('MISSING_OR_SYMLINK_SOURCE:'+str(path))
    return json.loads(path.read_text(encoding='utf-8'), object_pairs_hook=unique_obj)

def _first(row, names):
    for k in names:
        v=row.get(k)
        if isinstance(v,str) and v.strip():
            return v.strip()
    return ''

def donor_strings(row):
    out=[]
    for key in SOURCE_KEYS:
        value=row.get(key)
        if isinstance(value,str):
            out.extend(x.strip() for x in value.split(';') if x.strip())
        elif isinstance(value,list):
            for x in value:
                if isinstance(x,str):out.append(x)
                elif isinstance(x,dict) and isinstance(x.get('url'),str):out.append(x['url'])
    # source IDs and non-URLs are preserved as source hints, never considered approved repos
    return sorted(set(out))

def build(root=ROOT):
    root=pathlib.Path(root)
    base=root/REL
    urls_path=base/'repositories.urls.txt'
    data=urls_path.read_bytes()
    urls=data.decode('utf-8').splitlines()
    if hashlib.sha256(data).hexdigest()!=URL_SHA or len(urls)!=243 or len(set(urls))!=243 or urls!=sorted(urls):
        raise ValueError('REPOSITORY_MANIFEST_HASH_OR_COUNT_MISMATCH')
    records=[]; id_seen=set(); wave_summary={}; by_family=collections.Counter(); name_groups=collections.defaultdict(list)
    for wave,(filename,expected,hash_expected) in FILES.items():
        rel=(REL/ALL_SOURCE_FILES/filename).as_posix()
        obj=_read_json(root/rel)
        if wave == 4:
            # Byte-exact pinned Git blob, not a claim that the user-uploaded
            # source and this repository copy have independently matched.
            raw=(root/rel).read_bytes()
            observed=hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\x00'+raw).hexdigest()
            if 'gitblob:'+observed!=hash_expected:
                raise ValueError('WAVE4_PINNED_BLOB_MISMATCH:'+filename)
            if obj.get('new_design_candidate_count') != 256 or obj.get('status') != 'RESEARCH_ONLY_NOT_INSTALLED':
                raise ValueError('WAVE4_RESEARCH_SCHEMA_MISMATCH')
        elif source_hash(obj)!=hash_expected:
            raise ValueError('ORIGINAL_SOURCE_SEMANTIC_HASH_MISMATCH:'+filename)
        if wave not in (3,4) and obj.get('wave')!=wave:
            raise ValueError('SOURCE_WAVE_MISMATCH:'+filename)
        key='capabilities' if wave==3 else 'candidates'
        rows=obj.get(key)
        if not isinstance(rows,list) or len(rows)!=expected:
            raise ValueError('SOURCE_COUNT_MISMATCH:'+filename)
        for ix,row in enumerate(rows):
            if not isinstance(row,dict):raise ValueError('INVALID_PROPOSAL_RECORD')
            rid=row.get('id')
            if not isinstance(rid,str) or rid in id_seen or not re.fullmatch(r'phoenix-(capability|wave[0-9]+)-[0-9]{4}',rid):
                raise ValueError('DUPLICATE_OR_INVALID_PROPOSAL_ID:'+str(rid))
            id_seen.add(rid)
            if wave==3 and not rid.startswith('phoenix-capability-'):raise ValueError('INCORRECT_WAVE_ID')
            if wave!=3 and not rid.startswith('phoenix-wave'+str(wave)+'-'):raise ValueError('INCORRECT_WAVE_ID')
            for k,v in row.items():
                if isinstance(v,str) and k in ('status','research_status','operational_status','truth_class','implementation'):
                    if v.strip().upper() in BAD_STATES:raise ValueError('RESEARCH_MISREPRESENTED_AS_DEPLOYED:'+rid)
            title=_first(row,PROPOSAL_KEYS)
            acceptance=_first(row,ACCEPTANCE_KEYS)
            if not title or not acceptance:raise ValueError('MISSING_TITLE_OR_FALSIFIER:'+rid)
            family=str(row.get('family') or row.get('category') or 'UNCLASSIFIED')
            source=donor_strings(row)
            records.append({'id':rid,'wave':wave,'family':family,'title':title,
                            'acceptance':acceptance,'source_hints':source,
                            'source_path':rel,'source_pointer':'/'+key+'/'+str(ix),
                            'truth_class':'PROPOSED_RESEARCH_ONLY','promotion_authority':'NONE'})
            by_family[(wave,family)]+=1
            title_key=' '.join(TERMS.findall(title.lower()))
            name_groups[title_key].append(rid)
        wave_summary[str(wave)]={'count':expected,'source_integrity_pin':hash_expected,'path':rel}
    if len(records)!=1560 or len(id_seen)!=1560:
        raise ValueError('TOTAL_RECOVERY_COUNT_MISMATCH')
    corpus=root/'artifacts/research/founder-moonshot-literal-corpus/manifest.json'
    if not corpus.is_file():raise ValueError('FOUNDER_890_MANIFEST_MISSING')
    dup=[xs for xs in name_groups.values() if len(xs)>1]
    index={
        'schema':'uberbond.phoenix.ten-wave-research-index.v1',
        'truth_class':'RESEARCH_ONLY_NO_INSTALL_NO_RUNTIME_NO_AUTHORITY',
        'source_manifest_sha256':URL_SHA,
        'repository_urls':243,
        'recovered_proposals':1560,
        'wave4_unrecovered_proposal_count':0,
        'wave4_recovery_evidence':'Git blob identity pinned; user-upload equivalence not independently established',
        'founder_890_manifest':'artifacts/research/founder-moonshot-literal-corpus/manifest.json',
        'founder_890_source_records_mutated':False,
        'wave_summary':wave_summary,
        'family_groups':len(by_family),
        'exact_normalized_title_collision_groups':dup,
        'semantic_dedup_status':'NOT_DONE',
        'supplier_security_review_status':'NOT_DONE',
        'claims_refused':['Research inventory is not installed or approved','Research bodies are not installed supplier capabilities',
                           'Similarity or title identity is not semantic novelty','Provider and license clearance not claimed'],
        'records':records
    }
    return index

def search(index,phrase,limit=10):
    query=TERMS.findall(phrase.lower())
    target=set(t for t in query if t not in STOP)
    if not target:return []
    out=[]
    for row in index['records']:
        title=set(TERMS.findall(row['title'].lower()))
        family=set(TERMS.findall(row['family'].lower()))
        acc=set(TERMS.findall(row['acceptance'].lower()))
        # Whole-token matching, no model billing. Relevance is heuristic, not empirical fitness.
        score=4*len(target & title)+2*len(target & family)+len(target & acc)
        if score:out.append((score,row['id'],row))
    out.sort(key=lambda x:(-x[0],x[1]))
    return [{**row,'lexical_relevance_score':score} for score,_,row in out[:limit]]

def main(argv=None):
    p=argparse.ArgumentParser()
    p.add_argument('--query',default='')
    p.add_argument('--limit',type=int,default=10)
    p.add_argument('--output',help='optional offline index output; never promotes suppliers')
    args=p.parse_args(argv)
    if not 1<=args.limit<=50:p.error('--limit must be 1..50')
    index=build()
    if args.output:
        output=pathlib.Path(args.output)
        output.parent.mkdir(parents=True,exist_ok=True)
        output.write_text(json.dumps(index,indent=2,ensure_ascii=False,sort_keys=True)+'\n',encoding='utf8')
    result={k:v for k,v in index.items() if k!='records'}
    if args.query:result['matches']=search(index,args.query,args.limit)
    print(json.dumps(result,indent=2,ensure_ascii=False))
    return 0

if __name__=='__main__':
    try:sys.exit(main())
    except (OSError,ValueError,json.JSONDecodeError) as e:
        print(json.dumps({'ok':False,'status':'PHOENIX_CORPUS_REFUSED','reason':str(e)}))
        sys.exit(1)
