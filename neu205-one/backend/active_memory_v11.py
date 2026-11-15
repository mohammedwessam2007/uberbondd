"""NEU205 v11 optional, source-anchored active memory. No answer generation.

Layout capsules are deterministic source grouping, NOT verified medical relations.
All quoted bytes remain addressable against the original page text. The frozen BM25
normalizer is unchanged from Claude de150af (also matches the preserved baseline).
"""
import collections,contextlib,hashlib,json,math,os,re,sqlite3,tempfile,threading,time
from pathlib import Path
from frozen_bm25 import tokens

SCHEMA='neu205.active-memory.v11'
RID=re.compile(r'[A-Za-z0-9._-]{1,64}')
WORD=re.compile(r'\S+')
BULLET=re.compile(r'^\s*(?:[-•●▪*]|\d+[.)-]|[a-zA-Z][.)])\s+')
MCQ=re.compile(r'(?im)(?:^|\n)\s*(?:\(?[A-Ha-h]\)?[.):]|\([A-Ha-h]\))\s+')
QUALIFIERS=('not','except','only','unless','usually','may','left','right','medial','lateral','anterior','posterior','ipsilateral','contralateral')
class MemoryFailure(Exception):
    def __init__(self,code,message):self.code,self.message=code,message;super().__init__(message)
def sha(data):return hashlib.sha256(data).hexdigest()
def file_sha(path):
    h=hashlib.sha256()
    with open(path,'rb') as f:
        for b in iter(lambda:f.read(1<<20),b''):h.update(b)
    return h.hexdigest()
def checked(cancel):
    if cancel is not None and cancel.is_set():raise MemoryFailure('CANCELLED','Memory generation was cancelled.')
def stem_question(question):
    """Options never contaminate the initial MCQ stem ranking."""
    m=MCQ.search(question)
    return (question[:m.start()].strip() if m else question.strip()), ([x.strip() for x in MCQ.split(question[m.start():]) if x.strip()] if m else [])
def response_format(question,mode='study'):
    if mode not in ('study','exam_mcq'):raise MemoryFailure('INVALID_RESPONSE_MODE','Choose study or exam_mcq.')
    stem,options=stem_question(question);q=stem.lower()
    if mode=='exam_mcq':return 'Compare options against cited source, select the best-supported option if possible, and distinguish an uncertain choice from a supported conclusion. Do not invent elimination facts.'
    if re.search(r'\b(compare|difference|versus|contrast)\b',q):return 'Compare only source-supported features and preserve directional, numerical and negative qualifiers.'
    if re.search(r'\b(lesion|injury|damage)\b',q):return 'Explain each source-supported mechanism step separately; do not infer medical transitivity from proximity or source-neighbor links.'
    if re.search(r'\b(why|how|mechanism)\b',q):return 'Explain the source-supported mechanism in its original temporal and causal order; state missing steps honestly.'
    if re.search(r'\b(list|contents|branches|attachments|components)\b',q):return 'Retain the linked heading, list membership, exceptions and qualifiers; do not present a partial enumeration as complete.'
    if re.search(r'\b(not|except|least|unless)\b',q):return 'Track the requested polarity and each source negation explicitly; do not reverse exclusions.'
    return 'Answer concisely from the quoted source. Clarify ambiguous referents or insufficient evidence instead of inventing facts.'
def heading(line):
    s=line.strip()
    if not s or len(s)>110 or BULLET.match(s):return False
    if re.match(r'(?i)^(part|section|chapter|unit)\s+[IVX0-9]+',s):return True
    if s.endswith(':') and len(s.split())<=14:return True
    ws=s.split()
    return len(ws)<=9 and s[0].isupper() and not s.endswith(('.',',',';','?','!')) and sum(w[0].isupper() for w in ws if w)>=max(1,len(ws)-2)
def source_groups(pages):
    """Yield page-character spans without rewriting text or inferring medical edges."""
    current=[];heads=[];list_group=False;last=''
    def flush():
        nonlocal current,list_group,last
        out=(list(current),list(heads));current=[];list_group=False;last='';return out
    for page in pages:
        offset=0
        for raw in page['text'].splitlines(keepends=True):
            start=offset;offset+=len(raw);s=raw.strip()
            if not s:continue
            is_head=heading(s)
            # A colon label is retained with its following enumeration. A new
            # independent heading starts a new source capsule.
            if is_head and current and not (last.endswith(':') and BULLET.match(s)):
                yield flush()
            if is_head:
                if re.match(r'(?i)^(part|section|chapter|unit)\s',s):heads=[(page['pdf_page_1based'],start,offset,s)]
                else:heads=(heads[:1]+[(page['pdf_page_1based'],start,offset,s)])[-3:]
            if current and not is_head and not list_group and last.endswith(('.', ';')) and len(' '.join(x[3] for x in current).split())>=55 and not BULLET.match(s):
                yield flush()
            current.append((page['pdf_page_1based'],start,offset,raw))
            if BULLET.match(s) or s.endswith(':') or re.search(r'(?i)as follows?\s*:?$',s):list_group=True
            # Explicit completed list followed by a non-list paragraph separates
            # only at a clear sentence boundary, never between bullet qualifiers.
            if list_group and len(current)>1 and not BULLET.match(s) and not is_head and s.endswith('.') and last.endswith('.') and len(s.split())>12:
                yield flush()
            else:last=s
    if current:yield flush()
def materialize(spans,pages):
    merged=[]
    for pg,a,b,_ in spans:
        if merged and merged[-1][0]==pg:merged[-1]=(pg,merged[-1][1],b)
        else:merged.append((pg,a,b))
    refs=[];parts=[]
    for pg,a,b in merged:
        page=pages[pg];text=page[a:b];parts.append(text)
        refs.append(dict(page=pg,char_start=a,char_end=b,byte_start=len(page[:a].encode()),byte_end=len(page[:b].encode()),source_hash=sha(text.encode())))
    return '\n'.join(parts),refs

def compile_memory(pages_path,out_path,pdf_sha256,corpus_sha256,expected_pages=299):
    """Versioned, atomic compiler. Does not alter the PDF, pages, baseline corpus or old index."""
    pages_path=Path(pages_path);out_path=Path(out_path);manifest=Path(str(out_path)+'.manifest.json')
    if out_path.exists() or manifest.exists():raise MemoryFailure('OUTPUT_EXISTS','Choose a new versioned memory output path; originals are never replaced.')
    raw=pages_path.read_bytes();rows=[json.loads(l) for l in raw.splitlines() if l]
    rows.sort(key=lambda r:r['pdf_page_1based'])
    if [r.get('pdf_page_1based') for r in rows]!=list(range(1,expected_pages+1)) or any(not isinstance(r.get('text'),str) for r in rows):raise MemoryFailure('SOURCE_INCOMPLETE','Each original digital page must appear exactly once.')
    if not re.fullmatch('[0-9a-f]{64}',pdf_sha256) or not re.fullmatch('[0-9a-f]{64}',corpus_sha256):raise MemoryFailure('SOURCE_DIGEST_REQUIRED','Pin the original PDF and frozen corpus digests.')
    source={r['pdf_page_1based']:r['text'] for r in rows};out_path.parent.mkdir(parents=True,exist_ok=True)
    fd,tmp=tempfile.mkstemp(prefix='memory-build-',suffix='.sqlite',dir=out_path.parent);os.close(fd)
    coverage=collections.defaultdict(list)
    try:
        c=sqlite3.connect(tmp);c.executescript('PRAGMA journal_mode=DELETE; CREATE TABLE pages(page INTEGER PRIMARY KEY,text TEXT NOT NULL,sha TEXT NOT NULL); CREATE TABLE capsules(id TEXT PRIMARY KEY,ordinal INTEGER UNIQUE,text TEXT NOT NULL,sha TEXT NOT NULL,heading TEXT NOT NULL,spans TEXT NOT NULL,heading_spans TEXT NOT NULL,words INTEGER,qualifiers TEXT NOT NULL); CREATE TABLE postings(term TEXT,capsule_id TEXT,position INTEGER,PRIMARY KEY(term,capsule_id,position)); CREATE INDEX posting_capsule ON postings(capsule_id); CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);')
        c.executemany('INSERT INTO pages VALUES(?,?,?)',[(pg,t,sha(t.encode())) for pg,t in source.items()]);n=0;total_words=0
        for spans,heads in source_groups(rows):
            text,refs=materialize(spans,source)
            if not text.strip():continue
            # Every heading is separately source-addressable even when earlier
            # than the body span. No semantic subject/object assertion is made.
            htext=' > '.join(h[3] for h in heads)
            hrefs=[]
            for pg,a,b,_ in heads:
                _,r=materialize([(pg,a,b,'')],source);hrefs.extend(r)
            identifier='m'+sha(json.dumps(refs,sort_keys=True).encode())[:24]
            q=[w for w in QUALIFIERS if re.search(r'\b'+w+r'\b',text,re.I)]
            words=len(WORD.findall(text));n+=1;total_words+=words
            c.execute('INSERT INTO capsules VALUES(?,?,?,?,?,?,?,?,?)',(identifier,n-1,text,sha(text.encode()),htext,json.dumps(refs),json.dumps(hrefs),words,json.dumps(q)))
            normalized=tokens(htext+' '+text)
            c.executemany('INSERT INTO postings VALUES(?,?,?)',[(term,identifier,i) for i,term in enumerate(normalized)])
            for r in refs:coverage[r['page']].append((r['char_start'],r['char_end']))
        # Coverage audit counts source characters; title heuristics cannot silently
        # delete content merely because it looks like a heading or a table.
        uncovered=0
        for pg,text in source.items():
            covered=bytearray(len(text))
            for a,b in coverage[pg]:covered[a:b]=b'\1'*(b-a)
            uncovered+=sum(not covered[i] and not ch.isspace() for i,ch in enumerate(text))
        if uncovered:raise MemoryFailure('SOURCE_COVERAGE_GAP','Capsule extraction omitted non-whitespace source characters.')
        meta=dict(schema=SCHEMA,source_pages_sha256=sha(raw),book_pdf_sha256=pdf_sha256,corpus_sha256=corpus_sha256,pages=expected_pages,capsules=n,total_words=total_words,source_nonwhite_characters_omitted=uncovered,semantic_edges_verified=0,grouping='deterministic-layout-only',normalizer_sha256=file_sha(Path(__file__).with_name('frozen_bm25.py')))
        c.executemany('INSERT INTO meta VALUES(?,?)',[(k,json.dumps(v)) for k,v in meta.items()]);c.commit();c.execute('VACUUM');c.close()
        digest=file_sha(tmp);os.replace(tmp,out_path)
        payload=dict(meta,index_sha256=digest,index_bytes=out_path.stat().st_size)
        # Manifest publication follows complete immutable database publication.
        mtmp=Path(str(manifest)+'.partial');mtmp.write_text(json.dumps(payload,sort_keys=True,indent=2));os.replace(mtmp,manifest)
        return payload
    except Exception:
        with contextlib.suppress(Exception):c.close()
        with contextlib.suppress(FileNotFoundError):os.unlink(tmp)
        raise

class ActiveMemory:
    def __init__(self,path,manifest_path,expected_pdf,expected_corpus):
        self.path=Path(path);self.manifest_path=Path(manifest_path);self.manifest=json.loads(self.manifest_path.read_text())
        m=self.manifest
        if m.get('schema')!=SCHEMA or m.get('book_pdf_sha256')!=expected_pdf or m.get('corpus_sha256')!=expected_corpus or file_sha(self.path)!=m.get('index_sha256'):raise MemoryFailure('MEMORY_CORRUPT','Active-memory digest or source binding mismatch.')
        self._fingerprint=self.fingerprint()
        with self.connect() as c:
            if c.execute('PRAGMA quick_check').fetchone()[0]!='ok':raise MemoryFailure('MEMORY_CORRUPT','SQLite integrity check failed.')
            self.lengths=dict(c.execute('SELECT id,words FROM capsules'));self.n=len(self.lengths);self.avg=sum(self.lengths.values())/max(1,self.n)
            self.df=dict(c.execute('SELECT term,COUNT(DISTINCT capsule_id) FROM postings GROUP BY term'))
            self.ordinal=dict(c.execute('SELECT id,ordinal FROM capsules'));self.by_order={v:k for k,v in self.ordinal.items()}
            if self.n!=m['capsules'] or c.execute('SELECT COUNT(*) FROM pages').fetchone()[0]!=m['pages']:raise MemoryFailure('MEMORY_CORRUPT','Active-memory counts mismatch.')
    def connect(self):
        c=sqlite3.connect('file:'+str(self.path.resolve())+'?mode=ro',uri=True);c.row_factory=sqlite3.Row;return c
    def fingerprint(self):return [(p.stat().st_size,p.stat().st_mtime_ns) for p in (self.path,self.manifest_path)]
    def check(self,cancel=None):
        checked(cancel)
        if self.fingerprint()!=self._fingerprint:raise MemoryFailure('MEMORY_CORRUPT','Active-memory files changed after verification.')
    def capsule(self,cid,cancel=None):
        self.check(cancel)
        with self.connect() as c:
            r=c.execute('SELECT * FROM capsules WHERE id=?',(cid,)).fetchone()
            if r is None:raise MemoryFailure('UNKNOWN_CAPSULE','Capsule ID is not present in the verified memory.')
            refs=json.loads(r['spans']);hrefs=json.loads(r['heading_spans']);parts=[]
            for ref in refs+hrefs:
                page=c.execute('SELECT text,sha FROM pages WHERE page=?',(ref['page'],)).fetchone();full=page['text'];piece=full[ref['char_start']:ref['char_end']]
                if sha(full.encode())!=page['sha'] or sha(piece.encode())!=ref['source_hash'] or len(full[:ref['char_start']].encode())!=ref['byte_start'] or len(full[:ref['char_end']].encode())!=ref['byte_end']:raise MemoryFailure('MEMORY_CORRUPT','Capsule source span failed verification.')
            for ref in refs:parts.append(c.execute('SELECT text FROM pages WHERE page=?',(ref['page'],)).fetchone()[0][ref['char_start']:ref['char_end']])
            text='\n'.join(parts)
            if text!=r['text'] or sha(text.encode())!=r['sha']:raise MemoryFailure('MEMORY_CORRUPT','Capsule quote hash mismatch.')
            return dict(chunk_id=r['id'],book_pdf_start_page=refs[0]['page'],book_pdf_end_page=refs[-1]['page'],section_path=r['heading'],verbatim_text=text,source_hash=r['sha'],source_spans=refs,heading_spans=hrefs,word_count=r['words'],qualification_markers=json.loads(r['qualifiers']),semantic_relations_verified=False)
    def search(self,question,limit=5,cancel=None,topics=()):
        self.check(cancel)
        if not isinstance(question,str) or not 1<=len(question)<=1000 or type(limit) is not int or not 1<=limit<=8:raise MemoryFailure('INVALID_MEMORY_REQUEST','Question must be 1–1000 characters and limit 1–8.')
        stem,options=stem_question(question)
        if not isinstance(topics,(list,tuple)) or len(topics)>8 or any(not isinstance(t,str) or len(t)>200 for t in topics):raise MemoryFailure('INVALID_TOPICS','At most eight bounded conversation topics are allowed.')
        generic={'content','function','origin','explain','shorter','repeat','simpler','deeper','compare','why','more','last','one','effect','supply','branch','relation'}
        followup=bool(re.search(r'\b(it|its|they|them|their|this|that|these|those)\b',stem,re.I)) or bool(tokens(stem)) and set(tokens(stem))<=generic
        anchors=[t for t in topics if tokens(t) and not set(tokens(t))<=generic]
        query=stem+(' '+anchors[-1] if followup and anchors else '')
        terms=list(dict.fromkeys(tokens(query)))[:40];scores=collections.defaultdict(float)
        with self.connect() as c:
            for term in terms:
                checked(cancel);idf=math.log(1+(self.n-self.df.get(term,0)+.5)/(self.df.get(term,0)+.5))
                for row in c.execute('SELECT capsule_id,COUNT(*) AS tf FROM postings WHERE term=? GROUP BY capsule_id',(term,)):
                    cid=row['capsule_id'];tf=row['tf'];dl=self.lengths[cid]
                    scores[cid]+=idf*tf*2.2/(tf+1.2*(.25+.75*dl/max(1,self.avg)))
        ranked=sorted(scores,key=lambda cid:(-scores[cid],self.ordinal[cid]))[:limit]
        found=[]
        for cid in ranked:
            checked(cancel);p=self.capsule(cid,cancel);p['retrieval_scores']={'bm25':scores[cid]};found.append(p)
        return dict(schema=SCHEMA,strategy='v11-source-capsules-bm25-stem-first',question_stem=stem,option_count=len(options),topic_expansion_used=bool(followup and anchors),passages=found,source_sha256=self.manifest['source_pages_sha256'],semantic_relations_verified=False)
    def page(self,page,cancel=None):
        self.check(cancel)
        with self.connect() as c:
            row=c.execute('SELECT text,sha FROM pages WHERE page=?',(page,)).fetchone()
            if row is None:raise MemoryFailure('INVALID_PAGE','Page is outside this source.')
            if sha(row['text'].encode())!=row['sha']:raise MemoryFailure('MEMORY_CORRUPT','Page source digest mismatch.')
            return dict(page=page,verbatim_text=row['text'],source_hash=row['sha'])

def pack_capsules(passages,word_budget=160,required_quote=None,required_capsule_id=None):
    """Whole layout units only; no sentence compression or truncation of qualifiers."""
    if word_budget not in (110,160,220):raise MemoryFailure('INVALID_WORD_BUDGET','Compare preregistered 110,160,220-word evidence budgets.')
    selected=[];words=0;seen=set()
    ordered=list(passages)
    if required_quote is not None:
        # DEV oracle only: fail if gold cannot be retained, never claim a partial
        # prompt isolates generation errors. Production calls do not supply gold.
        ordered.sort(key=lambda p:required_quote not in p['verbatim_text'])
    if required_quote is not None and not any(required_quote in p['verbatim_text'] for p in ordered):raise MemoryFailure('ORACLE_QUOTE_NOT_RETAINED','Required DEV oracle quote is not in the retrieved original source units.')
    required=next((p for p in ordered if p['chunk_id']==required_capsule_id),None) if required_capsule_id else (ordered[0] if ordered else None)
    if required_capsule_id and required is None:raise MemoryFailure('REQUIRED_CAPSULE_MISSING','Required source capsule is not present.')
    if required is not None:
        if len(required['verbatim_text'].split())>word_budget:raise MemoryFailure('EVIDENCE_UNIT_EXCEEDS_BUDGET','The primary coherent source unit exceeds the declared evidence budget; expand the bounded budget or clarify rather than drop its qualifiers.')
        ordered=[required]+[p for p in ordered if p['chunk_id']!=required['chunk_id']]
    for p in ordered:
        if p['source_hash'] in seen:continue
        n=len(p['verbatim_text'].split())
        if words+n<=word_budget:selected.append(p);words+=n;seen.add(p['source_hash'])
    if required_quote is not None and not any(required_quote in p['verbatim_text'] for p in selected):raise MemoryFailure('ORACLE_QUOTE_NOT_RETAINED','Whole oracle source quote does not fit the declared evidence budget.')
    return dict(passages=selected,words=words,budget_words=word_budget,source_text_rewritten=False,required_capsule_id=required['chunk_id'] if required else None,dropped_capsule_ids=[p['chunk_id'] for p in ordered if p['chunk_id'] not in {q['chunk_id'] for q in selected}],primary_source_retained=required is None or any(p['chunk_id']==required['chunk_id'] for p in selected))

class MemorySession:
    """Per-turn capabilities; tools can access only IDs/pages returned to this generation."""
    TOOLS={'topic.search','memory.lookup','memory.expand','memory.prove','source.page_in'}
    def __init__(self,memory,generation_id,cancel,max_calls=4):
        if not isinstance(generation_id,str) or not RID.fullmatch(generation_id):raise MemoryFailure('INVALID_GENERATION','Safe generation ID required.')
        self.memory,self.generation,self.cancel=memory,generation_id,cancel;self.max_calls=min(4,max_calls);self.calls=0;self.approved=set();self.pages=set();self.hops={};self.output_chars=0
    def approve(self,passages,depth=0):
        for p in passages:self.approved.add(p['chunk_id']);self.pages.update(range(p['book_pdf_start_page'],p['book_pdf_end_page']+1));self.hops[p['chunk_id']]=min(depth,self.hops.get(p['chunk_id'],depth))
    def call(self,request):
        self.memory.check(self.cancel)
        if not isinstance(request,dict) or set(request)!={'tool','arguments','generation_id'} or request.get('generation_id')!=self.generation:raise MemoryFailure('STALE_GENERATION','Tool request generation or schema mismatch.')
        name=request['tool'];args=request['arguments']
        if name not in self.TOOLS or not isinstance(args,dict):raise MemoryFailure('INVALID_TOOL','Only bounded typed memory tools are allowed.')
        if self.calls>=self.max_calls:raise MemoryFailure('TOOL_BUDGET','At most four memory calls per turn.')
        self.calls+=1
        if name=='topic.search':
            if set(args)-{'query','limit'} or 'query' not in args:raise MemoryFailure('INVALID_TOOL_ARGUMENTS','topic.search accepts query and optional limit only.')
            out=self.memory.search(args['query'],args.get('limit',3),self.cancel);self.approve(out['passages'])
        elif name in ('memory.lookup','memory.expand'):
            if set(args)-{'chunk_id','hops'} or 'chunk_id' not in args:raise MemoryFailure('INVALID_TOOL_ARGUMENTS','Lookup/expand accepts one approved chunk ID and at most two source-neighbor hops.')
            cid=args['chunk_id'];hops=args.get('hops',0 if name=='memory.lookup' else 1)
            if cid not in self.approved or type(hops) is not int or not 0<=hops<=2 or self.hops[cid]+hops>2:raise MemoryFailure('UNAPPROVED_SOURCE','Source ID or source-neighbor hop is not approved.')
            ordinal=self.memory.ordinal[cid];ids=[self.memory.by_order[i] for i in range(max(0,ordinal-hops),min(self.memory.n,ordinal+hops+1))]
            passages=[self.memory.capsule(i,self.cancel) for i in ids];self.approve(passages,self.hops[cid]+hops)
            out={'passages':passages,'source_neighbor_expansion_only':True,'medical_transitivity_used':False}
        elif name=='source.page_in':
            if set(args)!={'page'} or type(args['page']) is not int or args['page'] not in self.pages:raise MemoryFailure('UNAPPROVED_SOURCE','Only a page already referenced by an approved capsule can be opened.')
            out=self.memory.page(args['page'],self.cancel)
        else:
            if set(args)!={'claim','source_ids'} or not isinstance(args['claim'],str) or not 1<=len(args['claim'])<=1000 or not isinstance(args['source_ids'],list) or not 1<=len(args['source_ids'])<=4 or any(cid not in self.approved for cid in args['source_ids']):raise MemoryFailure('UNAPPROVED_SOURCE','Proof checks require a bounded claim and approved source IDs.')
            passages=[self.memory.capsule(cid,self.cancel) for cid in args['source_ids']];claim=args['claim'];quotes='\n'.join(p['verbatim_text'] for p in passages)
            risks=[]
            for a,b in [('left','right'),('medial','lateral'),('anterior','posterior'),('afferent','efferent'),('entry','exit'),('agonist','antagonist')]:
                if re.search(r'\b'+a+r'\b',claim,re.I) and re.search(r'\b'+b+r'\b',quotes,re.I) and not re.search(r'\b'+a+r'\b',quotes,re.I):risks.append('REVIEW_POLARITY_'+a.upper())
                if re.search(r'\b'+b+r'\b',claim,re.I) and re.search(r'\b'+a+r'\b',quotes,re.I) and not re.search(r'\b'+b+r'\b',quotes,re.I):risks.append('REVIEW_POLARITY_'+b.upper())
            exact=claim in quotes
            out={'exact_quote_present':exact,'clinical_semantic_entailment':'NOT_VERIFIED','lexical_review_flags':risks,'verbatim_sources':passages,'medical_transitivity_used':False}
        checked(self.cancel);self.output_chars+=len(json.dumps(out,ensure_ascii=False))
        if self.output_chars>24000:raise MemoryFailure('TOOL_OUTPUT_BUDGET','Memory tool output exceeds the bounded per-turn payload.')
        return dict(schema=SCHEMA,generation_id=self.generation,tool=name,result=out)

class StablePrefixPrefetch:
    """Provisional retrieval only: two stable observations and debounce, never inference."""
    def __init__(self,memory):self.memory=memory;self.lock=threading.Lock();self.states={}
    def update(self,generation,prefix,sequence,stable,cancel,now=None):
        if not RID.fullmatch(generation) or not isinstance(prefix,str) or not 1<=len(prefix)<=400 or type(sequence) is not int or sequence<0 or type(stable) is not bool:raise MemoryFailure('INVALID_PREFETCH','Invalid generation, stable prefix or sequence.')
        checked(cancel);now=time.monotonic() if now is None else now
        with self.lock:
            old=self.states.get(generation)
            if old and sequence<=old['sequence']:raise MemoryFailure('STALE_ASR','ASR sequence must increase.')
            revised=bool(old and not prefix.startswith(old['prefix']))
            first=now if not old or revised or not stable else old['first']
            state=dict(prefix=prefix,sequence=sequence,first=first,result=None)
            self.states[generation]=state
            while len(self.states)>8:self.states.pop(next(iter(self.states)))
            ready=stable and old is not None and not revised and now-first>=.15
        if ready:
            result=self.memory.search(prefix,3,cancel);checked(cancel)
            with self.lock:
                if self.states.get(generation) is not state:raise MemoryFailure('STALE_ASR','ASR prefix changed during retrieval.')
                state['result']=result
            return {'provisional':True,'inference_started':False,'invalidated_previous':revised,'result':result}
        return {'provisional':True,'inference_started':False,'invalidated_previous':revised,'result':None}
    def invalidate(self,generation):
        with self.lock:self.states.pop(generation,None)
