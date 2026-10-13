"""One-shot, fail-closed PG16 rescue. Public HTTP serves health only, never data."""
import base64, hashlib, io, json, os, pathlib, secrets, subprocess, threading, time, zipfile
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlsplit, unquote

STATE = 'WAITING_FOR_EXPLICIT_GATE'
GATE = 'PHOENIX_RENDER_TO_NEON_ISOLATED_RESCUE_20261013'
ARCHIVE_HEADER = b'PHOENIXAESGCM1'
SOURCE_HOST = 'dpg-dali9dbl550s73bcf520-a'
TARGET_HOST = 'ep-soft-cake-baiahh8q.c-8.eu-central-1.aws.neon.tech'
SOURCE_DB = 'uberbond_control_postgres'
TARGET_DB = 'uberbond_render_rescue'
EXCLUDED = "n.nspname NOT IN ('pg_catalog','information_schema','phoenix_rescue_archive') AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp%'"

def validate_url(value, host, database):
    u = urlsplit(value)
    if (u.scheme not in ('postgres', 'postgresql') or u.hostname != host
            or unquote(u.path) != '/' + database or (u.port or 5432) != 5432
            or not u.username or not u.password or u.fragment):
        raise ValueError('REFUSED_DATABASE_IDENTITY')
    return u

def pg_environment(u, source=False):
    # No secrets in subprocess argv, logs, or repository.
    result = {k:v for k,v in os.environ.items() if k not in ('SOURCE_DATABASE_URL','RESCUE_DATABASE_URL','RESCUE_ARCHIVE_KEY')}
    result.update(PGHOST=u.hostname, PGPORT='5432', PGDATABASE=unquote(u.path)[1:],
                  PGUSER=unquote(u.username), PGPASSWORD=unquote(u.password),
                  PGSSLMODE='require' if source else 'verify-full', PGCONNECT_TIMEOUT='15',
                  PGAPPNAME='phoenix-isolated-rescue')
    if not source:
        result['PGSSLROOTCERT']='/etc/ssl/certs/ca-certificates.crt'
    return result

def run_pg(argv, env, output=None):
    p = subprocess.run(argv, env=env, stdout=subprocess.PIPE if output is None else output,
                       stderr=subprocess.PIPE, timeout=1800, check=False)
    if p.returncode:
        # Preserve potentially sensitive error text only in memory. Never print it.
        raise RuntimeError('POSTGRES_TOOL_FAILED:' + argv[0] + ':' + str(p.returncode))
    return p.stdout

def query(connection, statement, parameters=None):
    with connection.cursor() as c:
        c.execute(statement, parameters)
        return c.fetchall() if c.description is not None else []

def inventory(connection):
    tables=query(connection, "SELECT n.nspname,c.relname,c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE " + EXCLUDED + " AND c.relkind IN ('r','p','m','v','f','S') ORDER BY 1,2")
    columns=query(connection, "SELECT n.nspname,c.relname,a.attname,a.attnum,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid),a.attidentity,a.attgenerated FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE " + EXCLUDED + " AND a.attnum>0 AND NOT a.attisdropped AND c.relkind IN ('r','p','m','v','f') ORDER BY 1,2,4")
    constraints=query(connection, "SELECT n.nspname,c.relname,k.conname,k.contype,k.convalidated,pg_get_constraintdef(k.oid,true) FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE " + EXCLUDED + " ORDER BY 1,2,3")
    indexes=query(connection, "SELECT n.nspname,c.relname,i.indisvalid,i.indisready,pg_get_indexdef(i.indexrelid) FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE " + EXCLUDED + " ORDER BY 1,2")
    triggers=query(connection, "SELECT n.nspname,c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid,true) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE " + EXCLUDED + " AND NOT t.tgisinternal ORDER BY 1,2,3")
    schemas=query(connection, "SELECT n.nspname FROM pg_namespace n WHERE " + EXCLUDED + " ORDER BY 1")
    views=query(connection, "SELECT n.nspname,c.relname,pg_get_viewdef(c.oid,true) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE " + EXCLUDED + " AND c.relkind IN ('v','m') ORDER BY 1,2")
    enums=query(connection, "SELECT n.nspname,t.typname,e.enumlabel,e.enumsortorder FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace JOIN pg_enum e ON e.enumtypid=t.oid WHERE " + EXCLUDED + " ORDER BY 1,2,4")
    policies=query(connection, "SELECT n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity,p.polname,p.polpermissive,p.polcmd,pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_policy p ON p.polrelid=c.oid WHERE " + EXCLUDED + " AND c.relkind IN ('r','p') ORDER BY 1,2,5")
    extensions=query(connection, "SELECT e.extname,e.extversion,n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace ORDER BY 1")
    sequence_definitions=query(connection, "SELECT n.nspname,c.relname,format_type(s.seqtypid,NULL),s.seqstart,s.seqincrement,s.seqmax,s.seqmin,s.seqcache,s.seqcycle FROM pg_sequence s JOIN pg_class c ON c.oid=s.seqrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE " + EXCLUDED + " ORDER BY 1,2")
    routines=query(connection, "SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE " + EXCLUDED + " AND p.prokind IN ('f','p') AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e') ORDER BY 1,2,3")
    return dict(tables=tables,columns=columns,constraints=constraints,indexes=indexes,triggers=triggers,schemas=schemas,extensions=extensions,sequences=sequence_definitions,routines=routines,views=views,enums=enums,policies=policies)

def fingerprints(connection, tables):
    from psycopg2 import sql
    result=[]
    for schema, name, kind in tables:
        if kind not in ('r','p','m'):
            continue
        # ONLY avoids double-counting partition children; materialized views are unpopulated by dump and validated separately.
        if kind == 'm':
            continue
        h=hashlib.sha256(); count=0
        with connection.cursor(name='phoenix_' + secrets.token_hex(8)) as c:
            c.itersize=1000
            c.execute(sql.SQL('SELECT md5(row_to_json(t)::text) FROM ONLY {}.{} t ORDER BY 1').format(sql.Identifier(schema),sql.Identifier(name)))
            for (digest,) in c:
                h.update(digest.encode('ascii')); count+=1
        result.append(dict(schema=schema,table=name,rows=count,sorted_row_md5_sha256=h.hexdigest()))
    return result

def sequence_states(connection, tables):
    from psycopg2 import sql
    result=[]
    for schema,name,kind in tables:
        if kind=='S':
            value=query(connection,sql.SQL('SELECT last_value,is_called FROM {}.{}').format(sql.Identifier(schema),sql.Identifier(name)))[0]
            result.append([schema,name,*value])
    return result

def canonical(value):
    return json.dumps(value,sort_keys=True,default=str,separators=(',',':')).encode()

def job():
    global STATE
    if os.environ.get('RESCUE_EXECUTION_GATE') != GATE:
        print('PHOENIX:WAITING_FOR_EXPLICIT_GATE',flush=True); return
    stage='VALIDATE_IDENTITY'; source=None; target=None
    try:
        import psycopg2
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        su=validate_url(os.environ['SOURCE_DATABASE_URL'],SOURCE_HOST,SOURCE_DB)
        tu=validate_url(os.environ['RESCUE_DATABASE_URL'],TARGET_HOST,TARGET_DB)
        secret=os.environ['RESCUE_ARCHIVE_KEY']
        if len(secret)<40:
            raise ValueError('ARCHIVE_KEY_TOO_SHORT')
        key=hashlib.sha256(secret.encode()).digest()
        se=pg_environment(su,True); te=pg_environment(tu)
        def connect(e):
            return psycopg2.connect(host=e['PGHOST'],port=e['PGPORT'],dbname=e['PGDATABASE'],user=e['PGUSER'],password=e['PGPASSWORD'],sslmode=e['PGSSLMODE'],sslrootcert=e.get('PGSSLROOTCERT'),connect_timeout=15,application_name=e['PGAPPNAME'])
        stage='TARGET_EMPTY_CHECK'; target=connect(te)
        target.autocommit=True
        if query(target,"SELECT current_database(),current_setting('server_version_num')::int/10000")[0] != (TARGET_DB,16):
            raise ValueError('REFUSED_TARGET_DATABASE_VERSION')
        if not query(target,'SELECT pg_try_advisory_lock(73132124)')[0][0]:
            raise ValueError('RESCUE_ALREADY_RUNNING')
        if query(target,"SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_%' AND c.relkind IN ('r','p','v','m','S','f')")[0][0]:
            raise ValueError('REFUSED_NONEMPTY_DESTINATION')
        if query(target,"SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')")[0][0]:
            raise ValueError('REFUSED_DESTINATION_ROUTINES')
        stage='SOURCE_READ_ONLY_SNAPSHOT'; source=connect(se)
        source.set_session(isolation_level='REPEATABLE READ',readonly=True,autocommit=False)
        if query(source,"SELECT current_database(),current_setting('server_version_num')::int/10000")[0] != (SOURCE_DB,16):
            raise ValueError('REFUSED_SOURCE_DATABASE_VERSION')
        snapshot=query(source,'SELECT pg_export_snapshot()')[0][0]
        before=inventory(source)
        hashes=fingerprints(source,before['tables'])
        # Explicitly preserve non-password role metadata; provider administrative roles are not recreated in Neon.
        roles=query(source,'SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls,rolconnlimit,rolvaliduntil FROM pg_roles ORDER BY rolname')
        membership=query(source,'SELECT roleid::regrole::text,member::regrole::text,admin_option FROM pg_auth_members ORDER BY 1,2')
        STATE=stage='CONSISTENT_PG_DUMP'
        work=pathlib.Path('/tmp/phoenix-rescue');work.mkdir(mode=0o700,exist_ok=True)
        dump=work/'source.dump'
        run_pg(['pg_dump','--format=custom','--snapshot='+snapshot,'--file='+str(dump)],se)
        os.chmod(dump,0o600)
        dump_bytes=dump.read_bytes()
        toc=run_pg(['pg_restore','--list',str(dump)],se)
        seqs=sequence_states(source,before['tables'])
        receipt=dict(mission=GATE,started_at=datetime.now(timezone.utc).isoformat(),source_id=SOURCE_HOST,source_database=SOURCE_DB,target_project='misty-moon-35132124',target_database=TARGET_DB,postgres_major=16,dump_sha256=hashlib.sha256(dump_bytes).hexdigest(),dump_bytes=len(dump_bytes),source_fingerprints=hashes,source_inventory=before,source_sequences=seqs,role_metadata=roles,role_membership=membership,source_read_only=True,source_external_allowlist_changed=False,production_cutover=False,restore_owner_acl_mapping='no-owner/no-privileges; original ACL and ownership retained in dump; provider roles retained as metadata')
        # Build authenticated encrypted archive BEFORE destination mutation.
        z=io.BytesIO()
        with zipfile.ZipFile(z,'w',compression=zipfile.ZIP_DEFLATED) as a:
            a.writestr('source.dump',dump_bytes);a.writestr('receipt.json',canonical(receipt));a.writestr('toc.txt',toc)
        nonce=os.urandom(12)
        archive=ARCHIVE_HEADER+nonce+AESGCM(key).encrypt(nonce,z.getvalue(),GATE.encode())
        (work/'source-backup.aesgcm').write_bytes(archive)
        os.chmod(work/'source-backup.aesgcm',0o600)
        STATE=stage='ATOMIC_RESTORE'
        run_pg(['pg_restore','--single-transaction','--exit-on-error','--no-owner','--no-privileges','--dbname='+TARGET_DB,str(dump)],te)
        STATE=stage='READ_ONLY_VERIFICATION'
        target.autocommit=False
        target.set_session(isolation_level='REPEATABLE READ',readonly=True)
        after=inventory(target);target_hashes=fingerprints(target,after['tables']);target_seqs=sequence_states(target,after['tables'])
        checks={name:canonical(before[name])==canonical(after[name]) for name in before}
        checks['row_counts_and_fingerprints']=canonical(hashes)==canonical(target_hashes)
        checks['sequence_values_observed_after_dump']=canonical(seqs)==canonical(target_seqs)
        receipt['verification']=checks
        receipt['target_fingerprints']=target_hashes
        receipt['target_sequences']=target_seqs
        receipt['source_snapshot_released_at']=datetime.now(timezone.utc).isoformat()
        source.rollback();source.close();source=None
        target.rollback();target.autocommit=True
        # Persistent, encrypted logical backup, distinct from restored tables. Key stays only in protected rescue-service env.
        stage='PRESERVE_ENCRYPTED_BACKUP'
        query(target,'CREATE SCHEMA phoenix_rescue_archive')
        query(target,'CREATE TABLE phoenix_rescue_archive.backup (mission text PRIMARY KEY,created_at timestamptz NOT NULL DEFAULT now(),dump_sha256 text NOT NULL,archive_sha256 text NOT NULL,archive bytea NOT NULL,receipt jsonb NOT NULL)')
        archive_hash=hashlib.sha256(archive).hexdigest()
        query(target,'INSERT INTO phoenix_rescue_archive.backup (mission,dump_sha256,archive_sha256,archive,receipt) VALUES (%s,%s,%s,%s,%s) RETURNING mission',(GATE,receipt['dump_sha256'],archive_hash,psycopg2.Binary(archive),json.dumps(receipt,default=str)))
        stored=query(target,'SELECT archive FROM phoenix_rescue_archive.backup WHERE mission=%s',(GATE,))[0][0]
        if hashlib.sha256(bytes(stored)).hexdigest()!=archive_hash:
            raise ValueError('ARCHIVE_STORAGE_HASH_MISMATCH')
        header_size=len(ARCHIVE_HEADER)
        restored_zip=AESGCM(key).decrypt(bytes(stored)[header_size:header_size+12],bytes(stored)[header_size+12:],GATE.encode())
        with zipfile.ZipFile(io.BytesIO(restored_zip)) as a:
            if hashlib.sha256(a.read('source.dump')).hexdigest()!=receipt['dump_sha256']:
                raise ValueError('ARCHIVE_DECRYPTION_DUMP_MISMATCH')
        receipt['encrypted_backup_roundtrip_verified']=True
        receipt['archive_sha256']=archive_hash
        receipt['completed_at']=datetime.now(timezone.utc).isoformat()
        query(target,'UPDATE phoenix_rescue_archive.backup SET receipt=%s WHERE mission=%s RETURNING mission',(json.dumps(receipt,default=str),GATE))
        STATE='VERIFIED_RESTORE' if all(checks.values()) else 'RESTORED_VERIFICATION_DIFFERENCE'
        public={k:v for k,v in receipt.items() if k in ('mission','source_id','source_database','target_project','target_database','postgres_major','dump_sha256','dump_bytes','verification','archive_sha256','completed_at','source_read_only','source_external_allowlist_changed','production_cutover','encrypted_backup_roundtrip_verified')}
        public['state']=STATE
        public['table_counts']=[{k:t[k] for k in ('schema','table','rows')} for t in hashes]
        public['object_counts']={k:len(v) for k,v in before.items()}
        print('PHOENIX_RECEIPT:'+json.dumps(public,default=str,sort_keys=True),flush=True)
        # Erase unencrypted temporary dump after verified archive storage. Archive remains on target.
        dump.unlink()
    except Exception as e:
        STATE='FAILED_' + stage
        code=str(e) if isinstance(e,(ValueError,KeyError,RuntimeError)) and not isinstance(e,subprocess.TimeoutExpired) else getattr(e,'pgcode',None) or type(e).__name__
        if len(code)>150 or any(x in code for x in ('postgres://','postgresql://','password','DETAIL:')):
            code=type(e).__name__
        print('PHOENIX_FAILURE:'+json.dumps(dict(stage=stage,error=code,state=STATE,production_cutover=False)),flush=True)
    finally:
        for c in (source,target):
            if c is not None:
                try:c.close()
                except Exception:pass

class Health(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers()
        self.wfile.write(b'{"service":"phoenix-rescue","data_access":"no-public-data-endpoints"}')
    def do_POST(self):
        self.send_error(405)
    def log_message(self,*args):
        pass

if __name__=='__main__':
    os.umask(0o077)
    threading.Thread(target=job,daemon=True).start()
    HTTPServer(('0.0.0.0',int(os.environ.get('PORT','10000'))),Health).serve_forever()
