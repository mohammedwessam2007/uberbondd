"""Bounded source-read-only backup, isolated restore and boolean key compatibility.

No mail/model/provider-marketing calls. No public data endpoints. Never starts the app.
"""
import base64, hashlib, io, json, os, pathlib, secrets, threading, zipfile
from datetime import datetime, timezone
from http.server import HTTPServer
import rescue as r

GATE = 'PHOENIX_CURRENT_SOURCE_ISOLATED_RECOVERY_20261014'
DESTINATION = 'uberbond_phoenix_rehearsal_20261014_v2'
MAX_ENCRYPTED_ACCOUNTS = 200

def compatible_tokens(tokens, key_hex):
    """Actual AES-GCM authentication and JSON decoding; only boolean escapes."""
    try:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        if not isinstance(key_hex, str) or len(key_hex) != 64:
            return False
        key = bytes.fromhex(key_hex)
        if len(key) != 32 or not tokens or len(tokens) > MAX_ENCRYPTED_ACCOUNTS:
            return False
        for blob in tokens:
            if not isinstance(blob, dict) or set(blob) != {'iv', 'tag', 'data'}:
                return False
            iv, tag, data = (base64.b64decode(blob[k], validate=True) for k in ('iv', 'tag', 'data'))
            if len(iv) != 12 or len(tag) != 16 or len(data) > 1048576:
                return False
            plain = AESGCM(key).decrypt(iv, data + tag, None)
            json.loads(plain.decode('utf-8'))
            del plain
        return True
    except Exception:
        return False

def job():
    if os.environ.get('CONTINUITY_EXECUTION_GATE') != GATE:
        print('PHOENIX_CONTINUITY:WAITING_FOR_EXACT_GATE', flush=True)
        return
    if (os.getenv('CONTINUITY_REVIEWED_SHA') != os.getenv('RENDER_GIT_COMMIT')
            or len(os.getenv('CONTINUITY_REVIEWED_SHA','')) != 40):
        print('PHOENIX_CONTINUITY:REFUSED_UNREVIEWED_SOURCE', flush=True)
        return
    try:
        expiry = datetime.fromisoformat(os.environ['CONTINUITY_APPROVAL_EXPIRES_AT'].replace('Z','+00:00'))
        if expiry.tzinfo is None or datetime.now(timezone.utc) >= expiry:
            raise ValueError('expired')
    except Exception:
        print('PHOENIX_CONTINUITY:REFUSED_EXPIRED_APPROVAL', flush=True)
        return
    source = archive_db = target = None
    dump = None
    stage = 'VALIDATE_IDENTITIES'
    try:
        import psycopg2
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        su = r.validate_url(os.environ['SOURCE_DATABASE_URL'], r.SOURCE_HOST, r.SOURCE_DB)
        au = r.validate_url(os.environ['RESCUE_DATABASE_URL'], r.TARGET_HOST, r.TARGET_DB)
        tu = r.validate_url(os.environ['REHEARSAL_DATABASE_URL'], r.TARGET_HOST, DESTINATION)
        archive_secret = os.environ['RESCUE_ARCHIVE_KEY']
        production_key = os.environ['TOKEN_ENCRYPTION_KEY']
        if len(archive_secret) != 64:
            raise ValueError('ARCHIVE_KEY_FORMAT')
        archive_key = hashlib.sha256(archive_secret.encode()).digest()
        def connect(u, is_source=False):
            e = r.pg_environment(u, is_source)
            return psycopg2.connect(host=e['PGHOST'], port=e['PGPORT'], dbname=e['PGDATABASE'],
                user=e['PGUSER'], password=e['PGPASSWORD'], sslmode=e['PGSSLMODE'],
                sslrootcert=e.get('PGSSLROOTCERT'), connect_timeout=15,
                application_name='phoenix-current-isolated-recovery')
        stage = 'TARGET_EMPTY'
        target = connect(tu)
        target.autocommit = True
        if not r.query(target, 'SELECT pg_try_advisory_lock(73132125)')[0][0]:
            raise ValueError('ALREADY_RUNNING')
        if r.query(target, "SELECT current_database(),current_setting('server_version_num')::int/10000")[0] != (DESTINATION, 16):
            raise ValueError('TARGET_VERSION')
        if r.query(target, "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_%' AND c.relkind IN ('r','p','v','m','S','f')")[0][0]:
            raise ValueError('TARGET_NOT_EMPTY')
        if r.query(target, "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')")[0][0]:
            raise ValueError('TARGET_ROUTINES')
        stage = 'SOURCE_READ_ONLY'
        source = connect(su, True)
        source.set_session(isolation_level='REPEATABLE READ', readonly=True, autocommit=False)
        if r.query(source, "SELECT current_database(),current_setting('server_version_num')::int/10000")[0] != (r.SOURCE_DB, 16):
            raise ValueError('SOURCE_VERSION')
        snapshot = r.query(source, 'SELECT pg_export_snapshot()')[0][0]
        inventory = r.inventory(source)
        fingerprints = r.fingerprints(source, inventory['tables'])
        sequences = r.sequence_states(source, inventory['tables'])
        stage = 'SOURCE_KEY_BOOLEAN'
        blobs = [x[0] for x in r.query(source, "SELECT data->'tokens' FROM public.accounts WHERE data ? 'tokens'")]
        if not compatible_tokens(blobs, production_key):
            raise ValueError('SOURCE_KEY_NOT_COMPATIBLE')
        del blobs
        stage = 'CONSISTENT_ENCRYPTED_BACKUP'
        work = pathlib.Path('/tmp/phoenix-continuity-' + secrets.token_hex(8))
        work.mkdir(mode=0o700)
        dump = work / 'source.dump'
        env = r.pg_environment(su, True)
        # Remove all app secrets from subprocess environment, not merely argv.
        for name in ('TOKEN_ENCRYPTION_KEY','REHEARSAL_DATABASE_URL','CONTINUITY_EXECUTION_GATE'):
            env.pop(name, None)
        r.run_pg(['pg_dump','--format=custom','--snapshot='+snapshot,'--file='+str(dump)], env)
        os.chmod(dump, 0o600)
        data = dump.read_bytes()
        observed_at = datetime.now(timezone.utc).isoformat()
        private = dict(source_inventory=inventory, source_fingerprints=fingerprints,
            source_sequences=sequences, observed_at=observed_at,
            role_metadata=r.query(source,'SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls,rolconnlimit,rolvaliduntil FROM pg_roles ORDER BY rolname'),
            role_membership=r.query(source,'SELECT roleid::regrole::text,member::regrole::text,admin_option FROM pg_auth_members ORDER BY 1,2'),
            dump_sha256=hashlib.sha256(data).hexdigest(), source_read_only=True)
        buf = io.BytesIO()
        with zipfile.ZipFile(buf,'w',compression=zipfile.ZIP_DEFLATED) as z:
            z.writestr('source.dump',data)
            z.writestr('receipt.json',r.canonical(private))
            z.writestr('toc.txt',r.run_pg(['pg_restore','--list',str(dump)],env))
        mission = GATE + ':' + secrets.token_hex(16)
        nonce = os.urandom(12)
        archive = r.ARCHIVE_HEADER + nonce + AESGCM(archive_key).encrypt(nonce,buf.getvalue(),mission.encode())
        stage = 'APPEND_ARCHIVE'
        archive_db = connect(au)
        r.query(archive_db,'INSERT INTO phoenix_rescue_archive.backup(mission,dump_sha256,archive_sha256,archive,receipt) VALUES(%s,%s,%s,%s,%s)',
            (mission,private['dump_sha256'],hashlib.sha256(archive).hexdigest(),psycopg2.Binary(archive),json.dumps(private,default=str)))
        stored = bytes(r.query(archive_db,'SELECT archive FROM phoenix_rescue_archive.backup WHERE mission=%s',(mission,))[0][0])
        if hashlib.sha256(stored).digest() != hashlib.sha256(archive).digest():
            raise ValueError('STORAGE_HASH')
        h = len(r.ARCHIVE_HEADER)
        recovered = AESGCM(archive_key).decrypt(stored[h:h+12],stored[h+12:],mission.encode())
        with zipfile.ZipFile(io.BytesIO(recovered)) as z:
            if hashlib.sha256(z.read('source.dump')).hexdigest() != private['dump_sha256']:
                raise ValueError('AUTHENTICATED_RECOVERY_HASH')
        archive_db.commit()
        source.rollback(); source.close(); source = None
        stage = 'ISOLATED_RESTORE'
        tenv = r.pg_environment(tu)
        for name in ('TOKEN_ENCRYPTION_KEY','REHEARSAL_DATABASE_URL','CONTINUITY_EXECUTION_GATE'):
            tenv.pop(name,None)
        r.run_pg(['pg_restore','--single-transaction','--exit-on-error','--no-owner','--no-privileges','--dbname='+DESTINATION,str(dump)],tenv)
        target.autocommit = False
        target.set_session(isolation_level='REPEATABLE READ',readonly=True)
        after = r.inventory(target)
        checks = {k:r.canonical(v)==r.canonical(after[k]) for k,v in inventory.items()}
        checks['row_fingerprints'] = r.canonical(fingerprints)==r.canonical(r.fingerprints(target,after['tables']))
        checks['sequences'] = r.canonical(sequences)==r.canonical(r.sequence_states(target,after['tables']))
        blobs = [x[0] for x in r.query(target,"SELECT data->'tokens' FROM public.accounts WHERE data ? 'tokens'")]
        key_compatible = compatible_tokens(blobs,production_key)
        del blobs, production_key
        out = dict(mission=mission,observed_at=observed_at,source_read_only=True,
            destination=DESTINATION,table_count=len(fingerprints),row_count=sum(x['rows'] for x in fingerprints),
            archive_sha256=hashlib.sha256(archive).hexdigest(),dump_sha256=private['dump_sha256'],
            authenticated_archive_recovery=True,checks=checks,original_key_compatible=key_compatible,
            application_boot_tested=False,continuous_replication=False,production_cutover=False,
            mail_or_model_calls=0,status='VERIFIED_ISOLATED_RECOVERY' if key_compatible and all(checks.values()) else 'RESTORE_VERIFICATION_FAILED')
        print('PHOENIX_CONTINUITY_RECEIPT:'+json.dumps(out,sort_keys=True),flush=True)
    except Exception as e:
        # No exception messages/SQL/private identities/keys/connection URLs in output.
        print('PHOENIX_CONTINUITY_FAILURE:'+json.dumps(dict(stage=stage,error_type=type(e).__name__,source_read_only=True,production_cutover=False)),flush=True)
    finally:
        if dump is not None:
            try: dump.unlink(missing_ok=True)
            except Exception: pass
        for c in (source,archive_db,target):
            if c is not None:
                try: c.close()
                except Exception: pass

if __name__ == '__main__':
    os.umask(0o077)
    threading.Thread(target=job,daemon=True).start()
    HTTPServer(('0.0.0.0',int(os.getenv('PORT','10000'))),r.Health).serve_forever()
