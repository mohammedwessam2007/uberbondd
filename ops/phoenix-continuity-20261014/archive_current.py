"""P0: one-shot private read-only PG16 snapshot to existing encrypted Neon archive."""
import hashlib, io, json, os, pathlib, secrets, threading, zipfile
from datetime import datetime, timezone
from http.server import HTTPServer
import rescue as r

GATE = 'PHOENIX_CURRENT_SOURCE_ARCHIVE_20261017'

def job():
    if os.environ.get('PHOENIX_EXECUTION_GATE') != GATE:
        print('PHOENIX_P0:WAITING_FOR_EXACT_GATE',flush=True)
        return
    stage='VALIDATE_IDENTITY'
    source=archive_db=None
    dump=None
    try:
        import psycopg2
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        su=r.validate_url(os.environ['SOURCE_DATABASE_URL'],r.SOURCE_HOST,r.SOURCE_DB)
        au=r.validate_url(os.environ['RESCUE_DATABASE_URL'],r.TARGET_HOST,r.TARGET_DB)
        secret=os.environ['RESCUE_ARCHIVE_KEY']
        if len(secret)<40: raise ValueError('ARCHIVE_KEY_INVALID')
        archive_key=hashlib.sha256(secret.encode()).digest()

        def connect(url,is_source):
            env=r.pg_environment(url,is_source)
            return psycopg2.connect(
                host=env['PGHOST'],port=env['PGPORT'],dbname=env['PGDATABASE'],
                user=env['PGUSER'],password=env['PGPASSWORD'],
                sslmode=env['PGSSLMODE'],sslrootcert=env.get('PGSSLROOTCERT'),
                connect_timeout=15,application_name='phoenix-p0-current-archive')

        stage='ARCHIVE_PRECHECK'
        archive_db=connect(au,False)
        if r.query(archive_db,'SELECT current_database()')[0][0]!=r.TARGET_DB:
            raise ValueError('ARCHIVE_DATABASE_MISMATCH')
        if r.query(archive_db,"SELECT to_regclass('phoenix_rescue_archive.backup')")[0][0] is None:
            raise ValueError('ARCHIVE_TABLE_MISSING')
        if not r.query(archive_db,'SELECT pg_try_advisory_xact_lock(73132127)')[0][0]:
            raise ValueError('ARCHIVE_JOB_ALREADY_RUNNING')

        stage='SOURCE_READ_ONLY_SNAPSHOT'
        source=connect(su,True)
        source.set_session(isolation_level='REPEATABLE READ',readonly=True,autocommit=False)
        if r.query(source,"SELECT current_database(), current_setting('server_version_num')::int/10000")[0]!=(r.SOURCE_DB,16):
            raise ValueError('SOURCE_IDENTITY_OR_VERSION_MISMATCH')
        snapshot=r.query(source,'SELECT pg_export_snapshot()')[0][0]
        observed_at=datetime.now(timezone.utc).isoformat()
        inventory=r.inventory(source)
        hashes=r.fingerprints(source,inventory['tables'])
        sequences=r.sequence_states(source,inventory['tables'])

        stage='CONSISTENT_PGDUMP'
        directory=pathlib.Path('/tmp')/('phoenix-p0-'+secrets.token_hex(8))
        directory.mkdir(mode=0o700)
        dump=directory/'source.dump'
        env=r.pg_environment(su,True)
        r.run_pg(['pg_dump','--format=custom','--snapshot='+snapshot,'--file='+str(dump)],env)
        os.chmod(dump,0o600)
        data=dump.read_bytes()
        toc=r.run_pg(['pg_restore','--list',str(dump)],env)
        receipt={
            'source_database':r.SOURCE_DB,'source_id':r.SOURCE_HOST,
            'snapshot_observed_at':observed_at,'source_read_only':True,
            'source_inventory':inventory,'source_fingerprints':hashes,
            'source_sequences':sequences,
            'dump_sha256':hashlib.sha256(data).hexdigest(),
            'dump_bytes':len(data),'continuous_replication':False,
            'production_cutover':False}
        buf=io.BytesIO()
        with zipfile.ZipFile(buf,'w',compression=zipfile.ZIP_DEFLATED) as z:
            z.writestr('source.dump',data)
            z.writestr('receipt.json',r.canonical(receipt))
            z.writestr('toc.txt',toc)
        mission=GATE+':'+secrets.token_hex(16)
        nonce=os.urandom(12)
        archive=r.ARCHIVE_HEADER+nonce+AESGCM(archive_key).encrypt(nonce,buf.getvalue(),mission.encode())
        archive_hash=hashlib.sha256(archive).hexdigest()

        stage='DURABLE_OFF_RENDER_ARCHIVE'
        r.query(archive_db,
            'INSERT INTO phoenix_rescue_archive.backup '
            '(mission,dump_sha256,archive_sha256,archive,receipt) '
            'VALUES (%s,%s,%s,%s,%s)',
            (mission,receipt['dump_sha256'],archive_hash,
            psycopg2.Binary(archive),json.dumps(receipt,default=str)))
        stored=bytes(r.query(archive_db,
            'SELECT archive FROM phoenix_rescue_archive.backup WHERE mission=%s',
            (mission,))[0][0])
        if hashlib.sha256(stored).hexdigest()!=archive_hash:
            raise ValueError('ARCHIVE_READBACK_HASH_MISMATCH')
        h=len(r.ARCHIVE_HEADER)
        recovered=AESGCM(archive_key).decrypt(stored[h:h+12],stored[h+12:],mission.encode())
        with zipfile.ZipFile(io.BytesIO(recovered)) as z:
            if hashlib.sha256(z.read('source.dump')).hexdigest()!=receipt['dump_sha256']:
                raise ValueError('RECOVERED_DUMP_HASH_MISMATCH')
        archive_db.commit()
        source.rollback()
        source.close();source=None
        print('PHOENIX_P0_ARCHIVE_RECEIPT:'+json.dumps({
            'state':'VERIFIED_OFF_RENDER_ARCHIVE','mission':mission,
            'source_id':r.SOURCE_HOST,'snapshot_observed_at':observed_at,
            'dump_sha256':receipt['dump_sha256'],'archive_sha256':archive_hash,
            'dump_bytes':len(data),'table_count':len(hashes),
            'row_count':sum(x['rows'] for x in hashes),
            'archive_readback_decryption_verified':True,
            'source_read_only':True,'restoration_performed':False,
            'production_cutover':False,'needs_later_write_parity':True
        },sort_keys=True),flush=True)
    except Exception as exc:
        if archive_db is not None:
            try:archive_db.rollback()
            except Exception:pass
        print('PHOENIX_P0_ARCHIVE_FAILURE:'+json.dumps({
            'stage':stage,'error_type':type(exc).__name__,
            'state':'FAILED','source_writes':False}),flush=True)
    finally:
        for conn in (source,archive_db):
            if conn is not None:
                try:conn.close()
                except Exception:pass
        if dump is not None:
            try:
                dump.unlink(missing_ok=True)
                dump.parent.rmdir()
            except Exception:pass

if __name__=='__main__':
    os.umask(0o077)
    threading.Thread(target=job,daemon=True).start()
    HTTPServer(('0.0.0.0',int(os.getenv('PORT','10000'))),r.Health).serve_forever()
