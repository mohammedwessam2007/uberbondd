#!/usr/bin/env python3
"""Fixed owner-opted Termux companion entrypoint. Starts Qwen only under an explicit owner-approved fixed runtime configuration.
Install code under ~/neu205-one; owner-private assets under ~/neu205-one/.private.
No arguments, environment endpoint overrides, downloads, package installation, phone grants,
process killing, model relocation or edits to previous Termux projects.
"""
import contextlib,fcntl,http.client,json,os,socket,sys,subprocess,time,re
from bridge import digest
from pathlib import Path
from bridge import Brain,Settings,serve,Failure

def occupied(port):
    with socket.socket(socket.AF_INET,socket.SOCK_STREAM) as s:
        s.settimeout(.5);return s.connect_ex(('127.0.0.1',port))==0

def owned_model_env():
    # Fixed owned startup must not inherit remote model/RPC options from prior Termux work.
    # Preserve platform proxy, CA trust and authentication variables unchanged.
    return {k:v for k,v in os.environ.items() if not k.startswith(('LLAMA','GGML_RPC'))}

def start_qwen_if_authorized(private,brain):
    config_path=private/'runtime-config.json'
    if not config_path.is_file():raise Failure('QWEN_NOT_RUNNING','Existing Qwen is not running; optional owned startup requires explicit owner authorization.')
    config=json.loads(config_path.read_text())
    if config.get('allow_start_qwen') is not True:raise Failure('QWEN_START_NOT_AUTHORIZED','Owner-authorized Qwen startup is disabled; no process was started.')
    if not brain.identity_current():raise Failure('QWEN_GGUF_IDENTITY_REQUIRED','Verify the actual Qwen GGUF before startup.')
    binary=Path(config.get('llama_server_path',''))
    expected=config.get('binary_sha256','')
    if not re.fullmatch('[0-9a-f]{64}',expected) or not binary.is_file() or not os.access(binary,os.X_OK) or digest(binary)!=expected:raise Failure('QWEN_BINARY_UNVERIFIED','Import the authoritative checksum-verified llama-server executable.')
    try:
        help_result=subprocess.run([str(binary),'--help'],stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=10,check=False,env=owned_model_env())
        help_text=help_result.stdout[:300000].decode('utf-8','replace')
    except (OSError,subprocess.TimeoutExpired):raise Failure('QWEN_BINARY_INCOMPATIBLE','The verified llama-server help/ABI check failed.')
    flags=['--host','--port','--model','--alias','--ctx-size','--parallel','--threads','--n-gpu-layers']
    if help_result.returncode!=0 or any(not re.search(r'(?<![\w-])'+re.escape(flag)+r'(?=[\s,=]|$)',help_text) for flag in flags):raise Failure('QWEN_FLAGS_UNSUPPORTED','Verified binary does not advertise every required fixed startup flag; no process was started.')
    if occupied(8080):return # Another legitimate process won the port race; never replace it.
    owned=private/'owned-qwen.json'
    if owned.is_file():
        prior=json.loads(owned.read_text())
        try:
            os.kill(int(prior['pid']),0)
        except (ProcessLookupError,KeyError,ValueError):pass
        else:raise Failure('QWEN_START_PENDING','A previously started PID is still present; inspect the private receipt before another startup. No process was stopped.')
    info=brain.identity_info
    argv=[str(binary),'--host','127.0.0.1','--port','8080','--model',info['path'],'--alias',info['server_alias'],'--ctx-size','2048','--parallel','1','--threads','4','--n-gpu-layers','0']
    proc=subprocess.Popen(argv,stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True,env=owned_model_env())
    receipt={'pid':proc.pid,'binary_sha256':expected,'model_sha256':info['sha256'],'host':'127.0.0.1','port':8080,'backend':'CPU_DEFAULT','device_benchmarked':False,'launch_epoch_s':time.time()}
    (private/'owned-qwen.json').write_text(json.dumps(receipt,indent=2))
    deadline=time.monotonic()+120
    while time.monotonic()<deadline:
        if proc.poll() is not None:raise Failure('QWEN_START_FAILED','Owned Qwen process exited; check ABI, memory and actual GGUF compatibility. Existing services were untouched.')
        try:
            if occupied(8080):brain.model();return
        except (OSError,ValueError,Failure):pass
        time.sleep(.5)
    raise Failure('QWEN_START_TIMEOUT','Owned Qwen is still not ready after 120 seconds; inspect the private PID receipt before retrying. No existing service was stopped.')

def launch(root):
    private=root/'.private'
    if not private.is_dir():raise Failure('SETUP_REQUIRED','Import owner-private assets into the separate NEU205 ONE directory first.')
    token_path=private/'companion.token'
    token=token_path.read_text().strip()
    if len(token)<32 or token_path.stat().st_mode&0o077:raise Failure('PAIRING_REQUIRED','An owner-only companion pairing token file is required.')
    if occupied(8768):
        # Do not bind over or kill any listener. Authenticate the expected protocol only.
        c=http.client.HTTPConnection('127.0.0.1',8768,timeout=3)
        try:
            c.request('GET','/v1/health',headers={'Authorization':'Bearer '+token,'X-NEU205-Native-ASR':'true'})
            r=c.getresponse();data=json.loads(r.read(16384))
            expected=json.loads((private/'corpus.manifest.json').read_text()).get('corpus_sha256')
            if r.status not in (200,503) or not isinstance(data.get('ready'),bool) or data.get('corpus_sha256')!=expected or data.get('book_pdf_sha256')!='c3298e8c5f7f807604be10f7376d67f05eb315dd982276263e8f6ad2e8e70940':raise Failure('PORT_OCCUPIED','Port 8768 belongs to a different service; no changes made.')
            return
        finally:c.close()
    if not occupied(8080) and not (private/'runtime-config.json').is_file():raise Failure('QWEN_NOT_RUNNING','Start existing Qwen or explicitly authorize owned startup in the private runtime configuration.')
    b=Brain(Settings(private/'corpus.jsonl',private/'corpus.manifest.json',private/'book.pdf',token,model_identity=str(private/'qwen-identity.json'),active_memory=str(private/'active-memory-v11.sqlite') if (private/'active-memory-v11.sqlite').is_file() else '',active_memory_manifest=str(private/'active-memory-v11.sqlite.manifest.json')))
    if not b.identity_current():raise Failure('QWEN_GGUF_IDENTITY_REQUIRED','Import a verified actual Qwen GGUF deployment receipt.')
    if not occupied(8080):start_qwen_if_authorized(private,b)
    b.model() # Existing listener must advertise the exact verified deployment alias.
    server=serve(b,8768)
    try:server.serve_forever()
    finally:
        for f in list(b.flights.values()):f.cancel()
        server.server_close()

def main():
    if len(sys.argv)!=1:raise SystemExit('This fixed companion entrypoint accepts no arguments.')
    os.umask(0o077)
    root=Path.home()/'neu205-one';private=root/'.private'
    if not private.is_dir():raise SystemExit('SETUP_REQUIRED: Import private assets before companion startup.')
    with (private/'companion.lock').open('a') as lock:
        try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:return # Existing app-owned launcher holds service lock.
        try:launch(root)
        except Failure as e:raise SystemExit(e.code+': '+e.message)
        except Exception:raise SystemExit('SETUP_REQUIRED: Verify private assets, pairing and the existing Qwen service; no originals were changed.')
if __name__=='__main__':main()
