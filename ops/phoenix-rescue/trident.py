"""PHOENIX bounded follow-up: source read-only, old archive authentication, append-only latest backup."""
import rescue as r
import hashlib,io,json,os,pathlib,secrets,threading,zipfile
from datetime import datetime,timezone
from http.server import HTTPServer
EXPECTED_ARCHIVE='ce8fc45bbe2012645b2670e3fdef427b4903b70a53d64cde610b2c8c052144b5'
EXPECTED_DUMP='ba643e2545cd141134575565e71ca3c7bed6cf63f0622fd69202fda9eb6535a0'
GATE='PHOENIX_TRIDENT_READONLY_COMPARE_AND_LATEST_BACKUP'
def job():
    if os.getenv('TRIDENT_EXECUTION_GATE')!=GATE:
        print('TRIDENT:WAITING_FOR_EXPLICIT_GATE',flush=True);return
    source=target=None;stage='IDENTITY'
    try:
        import psycopg2
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        stage='SOURCE_IDENTITY';su=r.validate_url(os.environ['SOURCE_DATABASE_URL'],r.SOURCE_HOST,r.SOURCE_DB)
        stage='TARGET_IDENTITY';tu=r.validate_url(os.environ['RESCUE_DATABASE_URL'],r.TARGET_HOST,r.TARGET_DB)
        stage='ESCROW_FORMAT';escrow=os.environ.get('ESCROW_ARCHIVE_KEY') or os.environ['RESCUE_ARCHIVE_KEY']
        if len(escrow)!=64: raise ValueError('BAD_ESCROW_FORMAT')
        key=hashlib.sha256(escrow.encode()).digest()
        def connect(u,source=False):
            e=r.pg_environment(u,source)
            return psycopg2.connect(host=e['PGHOST'],port=e['PGPORT'],dbname=e['PGDATABASE'],user=e['PGUSER'],password=e['PGPASSWORD'],sslmode=e['PGSSLMODE'],sslrootcert=e.get('PGSSLROOTCERT'),connect_timeout=15,application_name='phoenix-trident')
        stage='AUTHENTICATED_RECOVERY';target=connect(tu)
        target.set_session(readonly=True,autocommit=False)
        rows=r.query(target,'SELECT archive,receipt FROM phoenix_rescue_archive.backup WHERE mission=%s',(r.GATE,))
        if len(rows)!=1:raise ValueError('BASELINE_ARCHIVE_MISSING')
        archive,baseline=rows[0];archive=bytes(archive)
        if hashlib.sha256(archive).hexdigest()!=EXPECTED_ARCHIVE:raise ValueError('ARCHIVE_HASH_MISMATCH')
        h=len(r.ARCHIVE_HEADER)
        payload=AESGCM(key).decrypt(archive[h:h+12],archive[h+12:],r.GATE.encode())
        with zipfile.ZipFile(io.BytesIO(payload)) as a:
            if hashlib.sha256(a.read('source.dump')).hexdigest()!=EXPECTED_DUMP:raise ValueError('DUMP_HASH_MISMATCH')
        target.rollback()
        stage='SOURCE_READONLY_COMPARE';source=connect(su,True)
        source.set_session(isolation_level='REPEATABLE READ',readonly=True,autocommit=False)
        if r.query(source,"SELECT current_database(),current_setting('server_version_num')::int/10000")[0]!=(r.SOURCE_DB,16):raise ValueError('BAD_SOURCE')
        snap=r.query(source,'SELECT pg_export_snapshot()')[0][0]
        before=r.inventory(source);fp=r.fingerprints(source,before['tables'])
        old={(x['schema'],x['table']):x for x in baseline['source_fingerprints']}
        changes=[dict(table=x['table'],before_rows=old.get((x['schema'],x['table']),{}).get('rows'),after_rows=x['rows']) for x in fp if x!=old.get((x['schema'],x['table']))]
        catalog_equal=r.canonical(before)==r.canonical(baseline['source_inventory'])
        report=dict(mission=GATE,observed_at=datetime.now(timezone.utc).isoformat(),authenticated_decryption=True,original_dump_hash=EXPECTED_DUMP,baseline_archive_hash=EXPECTED_ARCHIVE,source_read_only=True,changed_tables=changes,catalog_equal=catalog_equal,production_cutover=False)
        if changes or not catalog_equal:
            stage='CONSISTENT_LATEST_BACKUP';work=pathlib.Path('/tmp/trident');work.mkdir(mode=0o700,exist_ok=True)
            dump=work/'latest.dump';env=r.pg_environment(su,True)
            r.run_pg(['pg_dump','--format=custom','--snapshot='+snap,'--file='+str(dump)],env)
            data=dump.read_bytes()
            receipt=dict(mission=GATE,created_at=report['observed_at'],source_id=r.SOURCE_HOST,source_database=r.SOURCE_DB,source_read_only=True,source_fingerprints=fp,source_inventory=before,source_sequences=r.sequence_states(source,before['tables']),role_metadata=r.query(source,'SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls,rolconnlimit,rolvaliduntil FROM pg_roles ORDER BY rolname'),role_membership=r.query(source,'SELECT roleid::regrole::text,member::regrole::text,admin_option FROM pg_auth_members ORDER BY 1,2'),dump_sha256=hashlib.sha256(data).hexdigest())
            z=io.BytesIO()
            with zipfile.ZipFile(z,'w',compression=zipfile.ZIP_DEFLATED) as a:
                a.writestr('source.dump',data);a.writestr('receipt.json',r.canonical(receipt));a.writestr('toc.txt',r.run_pg(['pg_restore','--list',str(dump)],env))
            mission=GATE+':'+secrets.token_hex(8);nonce=os.urandom(12)
            encrypted=r.ARCHIVE_HEADER+nonce+AESGCM(key).encrypt(nonce,z.getvalue(),mission.encode())
            source.rollback();source.close();source=None
            target.set_session(readonly=False,autocommit=False)
            r.query(target,'INSERT INTO phoenix_rescue_archive.backup (mission,dump_sha256,archive_sha256,archive,receipt) VALUES (%s,%s,%s,%s,%s)',(mission,receipt['dump_sha256'],hashlib.sha256(encrypted).hexdigest(),psycopg2.Binary(encrypted),json.dumps(receipt,default=str)))
            stored=bytes(r.query(target,'SELECT archive FROM phoenix_rescue_archive.backup WHERE mission=%s',(mission,))[0][0])
            p=AESGCM(key).decrypt(stored[h:h+12],stored[h+12:],mission.encode())
            with zipfile.ZipFile(io.BytesIO(p)) as a:
                if hashlib.sha256(a.read('source.dump')).hexdigest()!=receipt['dump_sha256']:raise ValueError('LATEST_RECOVERY_FAILED')
            target.commit();dump.unlink()
            report.update(latest_backup_mission=mission,latest_dump_sha256=receipt['dump_sha256'],latest_archive_sha256=hashlib.sha256(encrypted).hexdigest(),latest_archive_bytes=len(encrypted),latest_rows=sum(x['rows'] for x in fp),latest_backup_recovery_verified=True,latest_restore_tested=False)
        print('TRIDENT_RECEIPT:'+json.dumps(report,sort_keys=True),flush=True)
    except Exception as e:
        print('TRIDENT_FAILURE:'+json.dumps(dict(stage=stage,error=type(e).__name__)),flush=True)
    finally:
        for c in (source,target):
            if c is not None:c.close()

def rehearsal():
    source=target=None;stage='REHEARSAL_IDENTITY'
    try:
        import psycopg2,base64
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        tu=r.validate_url(os.environ['RESCUE_DATABASE_URL'],r.TARGET_HOST,r.TARGET_DB)
        e=r.pg_environment(tu);key=hashlib.sha256((os.environ.get('ESCROW_ARCHIVE_KEY') or os.environ['RESCUE_ARCHIVE_KEY']).encode()).digest()
        def connect(database):
            return psycopg2.connect(host=e['PGHOST'],port=e['PGPORT'],dbname=database,user=e['PGUSER'],password=e['PGPASSWORD'],sslmode=e['PGSSLMODE'],sslrootcert=e.get('PGSSLROOTCERT'),connect_timeout=15,application_name='phoenix-isolated-rehearsal')
        source=connect(r.TARGET_DB);source.set_session(readonly=True)
        mission='PHOENIX_TRIDENT_READONLY_COMPARE_AND_LATEST_BACKUP:e8f4784efacc4a68'
        archive,receipt=r.query(source,'SELECT archive,receipt FROM phoenix_rescue_archive.backup WHERE mission=%s',(mission,))[0]
        archive=bytes(archive);h=len(r.ARCHIVE_HEADER)
        if hashlib.sha256(archive).hexdigest()!='db743a77d64a2a3a7fc16793a0b0133d788324ecdeccf357ba7c93a02572fcba':raise ValueError('BAD_LATEST_ARCHIVE')
        payload=AESGCM(key).decrypt(archive[h:h+12],archive[h+12:],mission.encode())
        work=pathlib.Path('/tmp/trident-rehearsal');work.mkdir(mode=0o700,exist_ok=True);dump=work/'source.dump'
        with zipfile.ZipFile(io.BytesIO(payload)) as a:dump.write_bytes(a.read('source.dump'))
        if hashlib.sha256(dump.read_bytes()).hexdigest()!=receipt['dump_sha256']:raise ValueError('BAD_LATEST_DUMP')
        db='uberbond_titan_rehearsal_20261014';target=connect(db);target.set_session(readonly=True)
        if r.query(target,"SELECT count(*) FROM pg_tables WHERE schemaname='public'")[0][0]!=0:raise ValueError('REHEARSAL_NOT_EMPTY')
        target.rollback();target.close();target=None
        env=dict(e);env['PGDATABASE']=db
        stage='ATOMIC_ISOLATED_RESTORE';r.run_pg(['pg_restore','--single-transaction','--exit-on-error','--no-owner','--no-privileges','--dbname='+db,str(dump)],env)
        target=connect(db);target.set_session(isolation_level='REPEATABLE READ',readonly=True)
        after=r.inventory(target);fp=r.fingerprints(target,after['tables'])
        checks={k:r.canonical(v)==r.canonical(after[k]) for k,v in receipt['source_inventory'].items()}
        checks['fingerprints']=r.canonical(fp)==r.canonical(receipt['source_fingerprints'])
        checks['sequence_values']=r.canonical(r.sequence_states(target,after['tables']))==r.canonical(receipt['source_sequences'])
        stage='ENCRYPTION_COMPATIBILITY'
        encrypted=r.query(target,"SELECT data->'tokens' FROM public.accounts WHERE data ? 'tokens'")
        decrypted=None
        # Production secret transfer was rejected. Keep this gate blocked; don't reconstruct or expose the key.
        dump.unlink()
        out=dict(mission='TRIDENT_ISOLATED_LATEST_RESTORE',observed_at=datetime.now(timezone.utc).isoformat(),database=db,archive_sha256=hashlib.sha256(archive).hexdigest(),dump_sha256=receipt['dump_sha256'],tables=len(fp),rows=sum(x['rows'] for x in fp),checks=checks,restored_encrypted_accounts=len(encrypted),authenticated_account_decryptions=decrypted,encryption_compatibility='BLOCKED_SECURE_KEY_INJECTION',migrations=r.query(target,'SELECT count(*) FROM public.schema_migrations')[0][0],production_cutover=False,application_startup_tested=False,mail_or_model_calls=0)
        print('TRIDENT_REHEARSAL_RECEIPT:'+json.dumps(out,sort_keys=True),flush=True)
    except Exception as e:print('TRIDENT_REHEARSAL_FAILURE:'+json.dumps(dict(stage=stage,error=type(e).__name__)),flush=True)
    finally:
        for c in (source,target):
            if c is not None:c.close()

def winnr_readonly():
    if not os.getenv('TRIDENT_WINNR_TOKEN'):return
    try:
        import urllib.request
        token=os.environ['TRIDENT_WINNR_TOKEN']
        def get(path):
            request=urllib.request.Request('https://api.winnr.app/v1/'+path,headers={'Authorization':'Bearer '+token,'Accept':'application/json','User-Agent':'UberBond-Phoenix-readonly'})
            with urllib.request.urlopen(request,timeout=25) as response:
                body=response.read(2000000)
                if len(body)>=2000000:raise ValueError('PROVIDER_RESPONSE_TOO_LARGE')
                return json.loads(body)
        account=get('account')
        results={}
        for path in ('domains','email-users','prewarmed/my-domains','warming/overview'):
            response=get(path);data=response.get('data')
            # Only report shape/count/pagination. Do not publish provider raw records, addresses, passwords or tokens.
            results[path]=dict(data_type=type(data).__name__,count=len(data) if isinstance(data,list) else None,has_more=response.get('meta',{}).get('has_more'),metadata_keys=sorted(response.get('meta',{}).keys()))
            if isinstance(data,dict):results[path]['data_keys']=sorted(data.keys())
        print('TRIDENT_WINNR_READONLY:'+json.dumps(dict(observed_at=datetime.now(timezone.utc).isoformat(),account_data_keys=sorted(account.get('data',{}).keys()),resources=results,provider_mutations=0,messages_sent=0),sort_keys=True),flush=True)
    except Exception as e:print('TRIDENT_WINNR_READONLY_FAILURE:'+json.dumps(dict(error=type(e).__name__)),flush=True)

if __name__=='__main__':
    os.umask(0o077)
    threading.Thread(target=(rehearsal if os.getenv('TRIDENT_EXECUTION_GATE')=='TRIDENT_RESTORE_REHEARSAL' else job),daemon=True).start()
    if os.getenv('TRIDENT_EXECUTION_GATE')=='TRIDENT_RESTORE_REHEARSAL':threading.Thread(target=winnr_readonly,daemon=True).start()
    HTTPServer(('0.0.0.0',int(os.getenv('PORT','10000'))),r.Health).serve_forever()
