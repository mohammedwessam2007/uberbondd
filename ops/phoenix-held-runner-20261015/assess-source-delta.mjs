// Run ONLY in a separately authorized private-network, SELECT-only session.
// This script NEVER opens public access, freezes writers, changes a database,
// dumps private rows, or assumes that a point-in-time check proves replication.
// INPUT: DATABASE_URL (protected), PHOENIX_EXPECTED_DB and PHOENIX_EXPECTED_HOST.
// Output: non-sensitive count/hash metadata only. No incoming secret is printed.
import { Client } from 'pg';
import { createHash } from 'node:crypto';

const denied = () => { throw new Error('PHOENIX_DELTA_ASSESSMENT_REFUSED'); };
const expectDb = process.env.PHOENIX_EXPECTED_DB || '';
const expectHost = process.env.PHOENIX_EXPECTED_HOST || '';
if (!/^[a-zA-Z0-9_]+$/.test(expectDb) || !/^[a-z0-9.-]+$/.test(expectHost)) denied();
let uri;
try { uri = new URL(process.env.DATABASE_URL || ''); } catch { denied(); }
if (!['postgres:','postgresql:'].includes(uri.protocol) ||
    uri.hostname !== expectHost || decodeURIComponent(uri.pathname) !== '/' + expectDb ||
    !uri.username || !uri.password || (uri.port && uri.port !== '5432') ||
    uri.hash || [...uri.searchParams].some(([k,v]) => !(['sslmode','channel_binding'].includes(k) && v === 'require')))
  denied();
const digest = data => createHash('sha256').update(data).digest('hex');
const sqlIdent = s => '"' + s.replaceAll('"','""') + '"';
const client = new Client({
  host: expectHost, port: Number(uri.port || 5432), database: expectDb,
  user: decodeURIComponent(uri.username), password: decodeURIComponent(uri.password),
  ssl: { rejectUnauthorized: true, servername: expectHost },
  options: '-c default_transaction_read_only=on -c statement_timeout=15000',
  connectionTimeoutMillis: 15000
});
let tx=false;
try {
  await client.connect();
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  tx=true;
  const identity=(await client.query("SELECT current_database() db, current_user actor, current_setting('transaction_read_only') readonly, inet_server_port() port")).rows[0];
  if (identity.db!==expectDb || identity.readonly!=='on' || Number(identity.port)!==5432) denied();
  const tables=(await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(x=>x.tablename);
  const observed=[];
  let rowCount=0;
  for (const t of tables) {
    const q='SELECT to_jsonb(t) AS raw_row FROM public.'+sqlIdent(t)+' t';
    const rows=(await client.query(q)).rows;
    if (rows.length>100000) denied(); // refuse unbounded exposure even in memory
    const rowDigests=rows.map(x=>digest(JSON.stringify(x.raw_row))).sort();
    rowCount += rows.length;
    observed.push({ table:t, rows:rows.length, contentSha256:digest(rowDigests.join('\n')) });
  }
  const schemaRows=(await client.query("SELECT table_name,column_name,data_type,udt_name,is_nullable,ordinal_position FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position")).rows;
  const indexes=(await client.query("SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname")).rows;
  const constraints=(await client.query("SELECT c.conname, c.contype, c.conrelid::regclass::text rel, pg_get_constraintdef(c.oid) definition FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' ORDER BY c.conrelid,c.conname")).rows;
  const sequences=(await client.query("SELECT schemaname,sequencename,last_value FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename")).rows;
  const sequenceValuesVisible=sequences.every(s=>s.last_value!==null);
  const result={
    version:'PHOENIX_PRIVATE_READONLY_DELTA_V1', database:expectDb,
    observedAtUtc:new Date().toISOString(), repeatableRead:true,
    tableCount:tables.length, rowCount, tables:observed,
    columnsSha256:digest(JSON.stringify(schemaRows)),
    indexesSha256:digest(JSON.stringify(indexes)),
    constraintsSha256:digest(JSON.stringify(constraints)),
    sequencesSha256:sequenceValuesVisible?digest(JSON.stringify(sequences)):null,
    sequenceValuesVisible, sourceWritersQuiesced:false,
    continuousReplicationProven:false, safeToCutover:false
  };
  console.log('PHOENIX_SANITIZED_READONLY_SNAPSHOT '+JSON.stringify(result));
} catch(e) {
  // Always keep SQL/query exception text and URLs/row material out of logs.
  console.error('PHOENIX_DELTA_ASSESSMENT_FAILED');
  process.exitCode=1;
} finally {
  if (tx) await client.query('ROLLBACK').catch(()=>{});
  await client.end().catch(()=>{});
}
