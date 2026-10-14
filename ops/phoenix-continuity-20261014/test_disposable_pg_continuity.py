#!/usr/bin/env python3
"""Synthetic end-to-end pg_dump/archive/restore/key compatibility for Work N26 code.
Runs ONLY against ephemeral CI PostgreSQL, not Render/Neon production.
"""
import base64, contextlib, hashlib, io, json, os, sys
from datetime import datetime, timezone
from pathlib import Path

ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT))
import rescue as r
import continuity as c
import psycopg2
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

SOURCE='uberbond_control_postgres'
ARCHIVE='uberbond_render_rescue'
REHEARSAL='uberbond_phoenix_rehearsal_20261014_v2'
PREFIX='postgresql://postgres:postgres@127.0.0.1:5432/'
key_hex='07'*32

def setup():
    admin=psycopg2.connect(PREFIX+'postgres')
    admin.autocommit=True
    with admin.cursor() as cur:
        for name in (SOURCE,ARCHIVE,REHEARSAL):
            cur.execute('SELECT 1 FROM pg_database WHERE datname=%s',(name,))
            if cur.fetchone() is None:
                from psycopg2 import sql
                cur.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(name)))
    admin.close()
    source=psycopg2.connect(PREFIX+SOURCE)
    iv=os.urandom(12)
    cipher=AESGCM(bytes.fromhex(key_hex)).encrypt(iv,json.dumps({'kind':'smtp-basic','username':'synthetic','password':'not-a-real-password'}).encode(),None)
    envelope={'iv':base64.b64encode(iv).decode(),'tag':base64.b64encode(cipher[-16:]).decode(),'data':base64.b64encode(cipher[:-16]).decode()}
    with source:
        with source.cursor() as cur:
            cur.execute('CREATE TABLE IF NOT EXISTS public.accounts(id text primary key,data jsonb not null)')
            cur.execute('INSERT INTO public.accounts (id,data) VALUES (%s,%s::jsonb) ON CONFLICT(id) DO UPDATE SET data=excluded.data',('synthetic-one',json.dumps({'tokens':envelope})))
            cur.execute('CREATE TABLE IF NOT EXISTS public.phoenix_fixture(id int primary key, marker text)')
            cur.execute('INSERT INTO public.phoenix_fixture VALUES (1,%s) ON CONFLICT(id) DO UPDATE SET marker=excluded.marker',('synthetic-canary-only',))
    source.close()
    archive=psycopg2.connect(PREFIX+ARCHIVE)
    with archive:
        with archive.cursor() as cur:
            cur.execute('CREATE SCHEMA IF NOT EXISTS phoenix_rescue_archive')
            cur.execute("""CREATE TABLE IF NOT EXISTS phoenix_rescue_archive.backup
                (mission text PRIMARY KEY,created_at timestamptz NOT NULL DEFAULT now(),
                dump_sha256 text NOT NULL,archive_sha256 text NOT NULL,
                archive bytea NOT NULL,receipt jsonb NOT NULL)""")
    archive.close()

def main():
    setup()
    r.SOURCE_HOST='127.0.0.1'
    r.TARGET_HOST='127.0.0.1'
    r.SOURCE_DB=SOURCE
    r.TARGET_DB=ARCHIVE
    c.DESTINATION=REHEARSAL
    pg_env=r.pg_environment
    def local_environment(u,source=False):
        env=pg_env(u,source)
        env['PGSSLMODE']='disable'
        env.pop('PGSSLROOTCERT',None)
        return env
    r.pg_environment=local_environment
    sha='a'*40
    os.environ.update({
        'CONTINUITY_EXECUTION_GATE':c.GATE,
        'CONTINUITY_REVIEWED_SHA':sha,
        'RENDER_GIT_COMMIT':sha,
        'CONTINUITY_APPROVAL_EXPIRES_AT':'2099-01-01T00:00:00Z',
        'SOURCE_DATABASE_URL':PREFIX+SOURCE,
        'RESCUE_DATABASE_URL':PREFIX+ARCHIVE,
        'REHEARSAL_DATABASE_URL':PREFIX+REHEARSAL,
        'RESCUE_ARCHIVE_KEY':'fixture-'+'b'*57,
        'TOKEN_ENCRYPTION_KEY':key_hex
    })
    output=io.StringIO()
    with contextlib.redirect_stdout(output):
        c.job()
    lines=output.getvalue().splitlines()
    receipts=[s.removeprefix('PHOENIX_CONTINUITY_RECEIPT:') for s in lines if s.startswith('PHOENIX_CONTINUITY_RECEIPT:')]
    if len(receipts)!=1:
        raise AssertionError('no-successful-isolated-recovery-receipt; '+','.join(s.split(':')[0] for s in lines))
    receipt=json.loads(receipts[0])
    assert receipt['status']=='VERIFIED_ISOLATED_RECOVERY', receipt['status']
    assert receipt['original_key_compatible'] is True
    assert receipt['authenticated_archive_recovery'] is True
    assert receipt['application_boot_tested'] is False
    assert receipt['continuous_replication'] is False
    assert receipt['production_cutover'] is False
    assert receipt['mail_or_model_calls']==0
    assert receipt['table_count']>=2
    assert receipt['row_count']>=2
    assert all(receipt['checks'].values()), 'source-vs-restored comparison mismatched'
    archive=psycopg2.connect(PREFIX+ARCHIVE)
    with archive.cursor() as cur:
        cur.execute('SELECT count(*) FROM phoenix_rescue_archive.backup')
        assert cur.fetchone()[0]==1
    archive.close()
    target=psycopg2.connect(PREFIX+REHEARSAL)
    with target.cursor() as cur:
        cur.execute('SELECT count(*) FROM public.accounts')
        assert cur.fetchone()[0]==1
        cur.execute('SELECT count(*) FROM public.phoenix_fixture')
        assert cur.fetchone()[0]==1
    target.close()
    print('PHOENIX_N26_DISPOSABLE_PG_VERIFIED '+json.dumps({
        'source_read_only':receipt['source_read_only'],
        'synthetic_encryption_key_compatible':receipt['original_key_compatible'],
        'archive_authenticated':receipt['authenticated_archive_recovery'],
        'all_schema_and_row_checks':all(receipt['checks'].values()),
        'production_cutover':False,'external_provider_connections':0,
        'actual_production_restore_proved':False
    },sort_keys=True))

if __name__=='__main__':
    main()
