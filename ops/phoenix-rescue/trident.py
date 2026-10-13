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
        stage='ESCROW_FORMAT';escrow=os.environ['ESCROW_ARCHIVE_KEY']
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
if __name__=='__main__':
    os.umask(0o077)
    threading.Thread(target=job,daemon=True).start()
    HTTPServer(('0.0.0.0',int(os.getenv('PORT','10000'))),r.Health).serve_forever()
