"""Synthetic protocol tests. Mock tokens are NOT Qwen accuracy or ASR evidence."""
import hashlib,http.client,json,sys,tempfile,threading,time,unittest
from pathlib import Path
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from bridge import Brain,Settings,Flight,Failure,SpeechFilter,serve,local_url
from evidence_adapter import Evidence,SCHEMA

def corpus(root):
    rows=[]
    for i in range(1,300):
        text=f'Synthetic test passage {i}: fictional amber axon anatomy.'
        rows.append(dict(chunk_id=f't{i}',book_pdf_start_page=i,book_pdf_end_page=i,section_path='Synthetic fixture',verbatim_text=text,source_hash=hashlib.sha256(text.encode()).hexdigest()))
    data=''.join(json.dumps(r)+'\n' for r in rows).encode();p=root/'corpus.jsonl';p.write_bytes(data)
    m=root/'manifest.json';m.write_text(json.dumps(dict(corpus_sha256=hashlib.sha256(data).hexdigest(),pages=299,chunks=299)))
    return p,m
class MockQwen(BaseHTTPRequestHandler):
    def log_message(self,*a):pass
    def do_GET(self):
        self.send_response(200);self.end_headers();self.wfile.write(b'{"data":[{"id":"qwen-SYNTHETIC-PROTOCOL-MOCK"}]}')
    def do_POST(self):
        req=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        if self.path in ('/apply-template','/tokenize'):
            if not getattr(self.server,'sizing',False):self.send_response(404);self.end_headers();return
            payload={'prompt':json.dumps(req['messages'])} if self.path=='/apply-template' else {'tokens':[1]*(len(req['content'].encode())//4+1)}
            self.send_response(200);self.end_headers();self.wfile.write(json.dumps(payload).encode());return
        self.server.last=req;self.send_response(200);self.end_headers()
        try:
            for text in ([] if getattr(self.server,'mode','')=='empty' else ['<thi','nk>private reasoning','</think>','Synthetic ','test answer.']):
                self.wfile.write(('data: '+json.dumps({'choices':[{'delta':{'content':text,'reasoning_content':'secret-not-content'}}]})+'\n\n').encode());self.wfile.flush()
            if getattr(self.server,'mode','')!='truncated':self.wfile.write(b'data: [DONE]\n\n')
        except OSError:pass
class BridgeTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);p,m=corpus(self.root)
        self.mock=ThreadingHTTPServer(('127.0.0.1',0),MockQwen);threading.Thread(target=self.mock.serve_forever,daemon=True).start()
        self.b=Brain.__new__(Brain);self.b.s=Settings(p,m,self.root/'missing.pdf','x'*40,qwen_url=f'http://127.0.0.1:{self.mock.server_port}')
        self.b.identity_info={'server_alias':'qwen-SYNTHETIC-PROTOCOL-MOCK'};self.b.identity_current=lambda:True
        self.b.endpoint=local_url(self.b.s.qwen_url);self.b.flights={};self.b.lock=threading.Lock();self.b.evidence_index=Evidence(p,m);self.b.s.corpus_sha256=self.b.evidence_index.sha
    def tearDown(self):self.mock.shutdown();self.mock.server_close();self.tmp.cleanup()
    def req(self,**kw):return dict(schema=SCHEMA,request_id='r1',utterance_text='amber axon anatomy',conversation_topics=[],max_passages=5,latency_budget_ms=150,corpus_sha256=self.b.s.corpus_sha256,**kw)
    def test_v11_missing_is_visible_and_wrong_corpus_refused(self):
        with self.assertRaisesRegex(Failure,'Import the verified'):
            list(self.b.answer(self.req(memory_mode='v11'),Flight()))
        r=self.req(memory_mode='v11');r['corpus_sha256']='0'*64
        with self.assertRaises(Failure) as e:list(self.b.answer(r,Flight()))
        self.assertEqual('CORPUS_MISMATCH',e.exception.code)
    def test_v11_mock_stream_uses_bound_whole_source_not_baseline(self):
        from active_memory_v11 import compile_memory,ActiveMemory
        pages=self.root/'pages.jsonl'
        pages.write_text(''.join(json.dumps({'pdf_page_1based':i,'text':'AMBER NUCLEUS\nSynthetic amber nucleus contents include a left branch only, not the right.\n'})+'\n' for i in range(1,300)))
        index=self.root/'active.sqlite';compile_memory(pages,index,'a'*64,self.b.s.corpus_sha256)
        self.b.active_memory=ActiveMemory(index,str(index)+'.manifest.json','a'*64,self.b.s.corpus_sha256)
        req=self.req(memory_mode='v11',generation_id='android-5',mode='study');req['utterance_text']='amber nucleus contents'
        output=list(self.b.answer(req,Flight()));done=output[-1]
        self.assertEqual('done',done['type']);self.assertEqual(1,done['qwen_generation_calls'])
        self.assertTrue(done['active_memory']['primary_source_retained']);self.assertFalse(done['cache_hits_verified'])
        self.assertTrue(self.mock.last['cache_prompt']);self.assertIn('left branch only, not the right',json.dumps(self.mock.last))
        req['history']=[None]
        with self.assertRaises(Failure) as e:list(self.b.answer(req,Flight()))
        self.assertEqual('INVALID_HISTORY',e.exception.code)
    def test_invalid_generation_refused_before_model(self):
        with self.assertRaises(Failure) as e:list(self.b.answer(self.req(generation_id='../bad'),Flight()))
        self.assertEqual('INVALID_GENERATION',e.exception.code)
    def test_local_numeric_host_only(self):
        for url in ['https://127.0.0.1:8080','http://localhost:8080','http://127.0.0.1.evil:8080','http://127.0.0.1:8080@evil:80','http://127.0.0.1:8080/path','http://0.0.0.0:8080','http://[::1]:8080','http://127.0.0.1:8080?u=http://evil']:
            with self.assertRaises(Failure,msg=url):local_url(url)
    def test_frozen_response_and_source_hash(self):
        r=self.b.evidence(self.req());self.assertEqual('OK',r['evidence_status']);self.assertEqual('bm25-v1',r['strategy'])
        for p in r['passages']:self.assertEqual(p['source_hash'],hashlib.sha256(p['verbatim_text'].encode()).hexdigest())
    def test_contract_rejects_bad_requests(self):
        for k,v in [('request_id','bad/x'),('utterance_text','x'*1001),('max_passages',0),('latency_budget_ms',0),('conversation_topics',['x']*9),('schema','bad')]:
            req=self.req();req[k]=v;self.assertEqual('INVALID_REQUEST',self.b.evidence(req)['evidence_status'])
    def test_wrong_corpus_fails_closed(self):
        r=self.req();r['corpus_sha256']='0'*64;out=self.b.evidence(r);self.assertEqual('CORPUS_MISMATCH',out['evidence_status']);self.assertFalse(out['passages'])
    def test_index_changed_fails_closed(self):
        with self.b.s.corpus.open('ab') as f:f.write(b' ')
        self.assertEqual('INDEX_CORRUPT',self.b.evidence(self.req())['evidence_status'])
    def test_corrupt_chunk_and_missing_page_refused_at_load(self):
        p=self.b.s.corpus;rows=[json.loads(l) for l in p.read_text().splitlines()];rows[0]['verbatim_text']='tampered';data=''.join(json.dumps(r)+'\n' for r in rows).encode();p.write_bytes(data)
        m=json.loads(self.b.s.manifest.read_text());m['corpus_sha256']=hashlib.sha256(data).hexdigest();self.b.s.manifest.write_text(json.dumps(m))
        with self.assertRaisesRegex(ValueError,'chunk digest'):Evidence(p,self.b.s.manifest)
    def test_no_evidence_calls_no_generator(self):
        r=self.req();r['utterance_text']='xyzzyunrelated';it=self.b.answer(r,Flight());self.assertEqual('evidence',next(it)['type'])
        with self.assertRaises(Failure):next(it)
        self.assertFalse(hasattr(self.mock,'last'))
    def test_mock_stream_prompt_and_thinking_redaction(self):
        out=list(self.b.answer(self.req(),Flight()));text=''.join(e.get('text','') for e in out)
        self.assertEqual('Synthetic test answer.',text);self.assertEqual('done',out[-1]['type']);self.assertFalse(self.mock.last['chat_template_kwargs']['enable_thinking'])
        self.assertIn('reference_excerpts',self.mock.last['messages'][-1]['content'])
    def test_cancel_refuses_late_tokens(self):
        f=self.b.begin('r1');it=self.b.answer(self.req(),f);next(it);f.cancel()
        with self.assertRaises(Failure):next(it)
        self.b.finish('r1')
    def test_start_storm_cancels_previous(self):
        old=self.b.begin('r1')
        for i in range(30):self.b.begin('r'+str(i+2))
        self.assertTrue(old.cancelled.is_set())
        for f in self.b.flights.values():f.cancel()
    def test_asr_assets_fail_actionably(self):
        with self.assertRaises(Failure) as c:self.b.transcribe(b'',Flight())
        self.assertEqual('OFFLINE_ASR_ASSETS_REQUIRED',c.exception.code)
    def test_auth_host_and_browser_origin_rejected(self):
        server=serve(self.b,0);threading.Thread(target=server.serve_forever,daemon=True).start()
        try:
            for auth,extra,status in [('',{},401),('Bearer '+'x'*40,{'Origin':'https://evil.invalid'},403),('Bearer '+'x'*40,{'Host':'evil.invalid'},400)]:
                c=http.client.HTTPConnection('127.0.0.1',server.server_port,timeout=3);c.request('GET','/v1/health',headers=dict(Authorization=auth,**extra));r=c.getresponse();self.assertEqual(status,r.status);r.read();c.close()
            c=http.client.HTTPConnection('127.0.0.1',server.server_port,timeout=3);c.request('GET','/v1/health',headers={'Authorization':'Bearer '+'x'*40});r=c.getresponse();body=json.loads(r.read());self.assertEqual(503,r.status);self.assertFalse(body['ready']);self.assertIn('OFFLINE_ASR_ASSETS_REQUIRED',body['blockers']);c.close()
        finally:server.shutdown();server.server_close()
    def test_multiturn_prompt_drops_oldest_whole_history_before_passages(self):
        e=self.b.evidence(self.req());history=[{'role':'user' if i%2==0 else 'assistant','content':'old'+str(i)+' '+'x'*1800} for i in range(6)]
        messages,selected,budget=self.b.budget_messages('amber axon anatomy',history,e['passages'],False,Flight())
        self.assertLessEqual(budget['prompt_tokens_or_upper_bound']+212,2048);self.assertEqual(0,budget['history_messages']);self.assertEqual(e['passages'][0],selected[0]);self.assertIn('amber axon anatomy',messages[-1]['content'])
    def test_prompt_budget_never_truncates_question_or_top_passage(self):
        e=self.b.evidence(self.req());p=dict(e['passages'][0],verbatim_text='medical qualifier '*200)
        with self.assertRaises(Failure) as f:self.b.budget_messages('Do not omit the negation: not affected',[],[p],False,Flight())
        self.assertEqual('CONTEXT_BUDGET',f.exception.code)
    def test_local_rendered_template_token_count_protocol(self):
        self.mock.sizing=True
        count,method=self.b.prompt_tokens([{'role':'user','content':'synthetic question'}],Flight())
        self.assertGreater(count,0);self.assertEqual('llama-apply-template-tokenize',method)
    def test_prompt_trimmed_passages_remain_whole(self):
        e=self.b.evidence(self.req());passages=[dict(p,verbatim_text=p['verbatim_text']+' qualifier '*25) for p in e['passages']]
        messages,selected,budget=self.b.budget_messages('amber anatomy',[],passages,False,Flight())
        self.assertLess(len(selected),len(passages));self.assertEqual(selected,passages[:len(selected)]);self.assertLessEqual(budget['prompt_tokens_or_upper_bound']+212,2048)
    def test_truncated_stream_is_not_success(self):
        self.mock.mode='truncated';it=self.b.answer(self.req(),Flight());events=[]
        with self.assertRaises(Failure) as f:
            for e in it:events.append(e)
        self.assertEqual('QWEN_STREAM_TRUNCATED',f.exception.code);self.assertFalse(any(e['type']=='done' for e in events))
    def test_empty_stream_is_not_success(self):
        self.mock.mode='empty'
        with self.assertRaises(Failure) as f:list(self.b.answer(self.req(),Flight()))
        self.assertEqual('QWEN_EMPTY_RESPONSE',f.exception.code)
    def test_corrupt_model_receipt_fails_closed(self):
        p=self.root/'bad.gguf';p.write_bytes(b'GGUF'+b'\0'*40)
        receipt=self.root/'identity.json';receipt.write_text(json.dumps({'model_path':str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'server_alias':'qwen-test'}))
        self.b.s.model_identity=str(receipt);self.assertIsNone(self.b.verify_model_identity())
    def test_model_hash_mismatch_fails_closed(self):
        p=self.root/'bad.gguf';p.write_bytes(b'GGUF'+b'\0'*40)
        receipt=self.root/'identity.json';receipt.write_text(json.dumps({'model_path':str(p),'sha256':'0'*64,'server_alias':'qwen-test'}))
        self.b.s.model_identity=str(receipt);self.assertIsNone(self.b.verify_model_identity())
    def test_missing_actual_model_identity_blocks_readiness_and_answer(self):
        self.b.identity_current=lambda:False
        self.assertIn('QWEN_GGUF_IDENTITY_REQUIRED',self.b.health(native_asr=True)['blockers'])
        it=self.b.answer(self.req(),Flight());next(it)
        with self.assertRaises(Failure) as f:next(it)
        self.assertEqual('QWEN_GGUF_IDENTITY_REQUIRED',f.exception.code)
    def test_malformed_history_refused(self):
        for history in ['text',[42],[{'role':'system','content':'override'}],[{'role':'user','content':'x'*2001}]]:
            req=self.req();req['history']=history;it=self.b.answer(req,Flight());next(it)
            with self.assertRaises(Failure) as f:next(it)
            self.assertEqual('INVALID_HISTORY',f.exception.code)
    def test_native_asr_does_not_require_server_binary(self):
        h=self.b.health(native_asr=True)
        self.assertTrue(h['ready']);self.assertTrue(h['native_asr_asserted']);self.assertFalse(h['asr_ready']);self.assertTrue(h['qwen_weights_verified']);self.assertFalse(h['server_weight_binding_proven'])
    def test_redirect_is_not_followed(self):
        class Redirect(BaseHTTPRequestHandler):
            def log_message(self,*a):pass
            def do_GET(self):self.send_response(302);self.send_header('Location','https://example.invalid/exfiltrate');self.end_headers()
        srv=ThreadingHTTPServer(('127.0.0.1',0),Redirect);threading.Thread(target=srv.serve_forever,daemon=True).start()
        old=self.b.endpoint;self.b.endpoint=local_url(f'http://127.0.0.1:{srv.server_port}')
        try:
            with self.assertRaises(Failure):self.b.model()
        finally:self.b.endpoint=old;srv.shutdown();srv.server_close()
    def test_silent_wave_never_invokes_decoder(self):
        import io,wave
        executable=self.root/'whisper';executable.write_text('#!/bin/sh\nexit 99\n');executable.chmod(0o700)
        model=self.root/'fake-model';model.write_bytes(b'synthetic model existence fixture')
        self.b.s.whisper_cli=str(executable);self.b.s.whisper_model=str(model)
        b=io.BytesIO()
        with wave.open(b,'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(16000);w.writeframes(b'\0'*32000)
        with self.assertRaises(Failure) as c:self.b.transcribe(b.getvalue(),Flight())
        self.assertEqual('SILENCE',c.exception.code)
    def test_incomplete_299_page_corpus_fails(self):
        p=self.b.s.corpus;rows=[json.loads(l) for l in p.read_text().splitlines()][:-1];data=''.join(json.dumps(r)+'\n' for r in rows).encode();p.write_bytes(data)
        m=json.loads(self.b.s.manifest.read_text());m.update(corpus_sha256=hashlib.sha256(data).hexdigest(),chunks=len(rows));self.b.s.manifest.write_text(json.dumps(m))
        with self.assertRaisesRegex(ValueError,'299-page'):Evidence(p,self.b.s.manifest)
    def test_partial_think_tags_never_emit(self):
        f=SpeechFilter();self.assertEqual('',f.feed('<thi'));self.assertEqual('',f.feed('nk>abc'));self.assertEqual('safe',f.feed('</think>safe'));self.assertEqual('',f.finish())
class LauncherTests(unittest.TestCase):
    def test_missing_private_assets_fail_without_process_changes(self):
        from launch_local import launch
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(Failure) as f:launch(Path(d))
            self.assertEqual('SETUP_REQUIRED',f.exception.code)
    def test_pairing_permissions_fail_without_binding(self):
        from launch_local import launch
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'.private';p.mkdir();(p/'companion.token').write_text('x'*40);(p/'companion.token').chmod(0o644)
            with self.assertRaises(Failure) as f:launch(Path(d))
            self.assertEqual('PAIRING_REQUIRED',f.exception.code)
    def test_missing_existing_qwen_does_not_start_or_replace_it(self):
        from launch_local import launch
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'.private';p.mkdir();(p/'companion.token').write_text('x'*40);(p/'companion.token').chmod(0o600)
            with patch('launch_local.occupied',return_value=False),self.assertRaises(Failure) as f:launch(Path(d))
            self.assertEqual('QWEN_NOT_RUNNING',f.exception.code)
    def test_owned_model_start_filters_remote_option_environment_only(self):
        from launch_local import owned_model_env
        from unittest.mock import patch
        with patch.dict('os.environ',{'LLAMA_ARG_HF_REPO':'untrusted','GGML_RPC_SERVERS':'remote','LLAMA_API_KEY':'private','HTTPS_PROXY':'trusted-proxy','SSL_CERT_FILE':'trusted-ca'},clear=True):
            self.assertEqual({'HTTPS_PROXY':'trusted-proxy','SSL_CERT_FILE':'trusted-ca'},owned_model_env())
    def test_optional_qwen_start_is_disabled_by_default(self):
        from launch_local import start_qwen_if_authorized
        with tempfile.TemporaryDirectory() as d:
            p=Path(d);(p/'runtime-config.json').write_text(json.dumps({'allow_start_qwen':False}))
            with self.assertRaises(Failure) as f:start_qwen_if_authorized(p,None)
            self.assertEqual('QWEN_START_NOT_AUTHORIZED',f.exception.code)
    def test_optional_qwen_start_refuses_unverified_binary(self):
        from launch_local import start_qwen_if_authorized
        from unittest.mock import Mock
        with tempfile.TemporaryDirectory() as d:
            p=Path(d);(p/'runtime-config.json').write_text(json.dumps({'allow_start_qwen':True,'llama_server_path':'/missing','binary_sha256':'0'*64}))
            brain=Mock();brain.identity_current.return_value=True
            with self.assertRaises(Failure) as f:start_qwen_if_authorized(p,brain)
            self.assertEqual('QWEN_BINARY_UNVERIFIED',f.exception.code)
    def test_optional_qwen_start_checks_help_flags_before_execution(self):
        from launch_local import start_qwen_if_authorized
        from unittest.mock import Mock,patch
        with tempfile.TemporaryDirectory() as d:
            p=Path(d);binary=p/'fake-llama';binary.write_text('#!/bin/sh\necho --host --port --model --alias --ctx-size --threads\n');binary.chmod(0o700)
            (p/'runtime-config.json').write_text(json.dumps({'allow_start_qwen':True,'llama_server_path':str(binary),'binary_sha256':hashlib.sha256(binary.read_bytes()).hexdigest()}))
            brain=Mock();brain.identity_current.return_value=True
            with patch('launch_local.subprocess.Popen') as spawn:
                # Mock help subprocess.run separately so Popen assert covers only actual server spawn.
                with patch('launch_local.subprocess.run',return_value=Mock(returncode=0,stdout=b'--host --port --model --alias --ctx-size --threads')):
                    with self.assertRaises(Failure) as f:start_qwen_if_authorized(p,brain)
                self.assertEqual('QWEN_FLAGS_UNSUPPORTED',f.exception.code);spawn.assert_not_called()
if __name__=='__main__':unittest.main()
