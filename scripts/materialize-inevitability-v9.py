#!/usr/bin/env python3
from pathlib import Path
import base64,hashlib,json,lzma,os,runpy,tempfile
ROOT=Path.cwd(); C=ROOT/'artifacts'/'inevitability-v9-carrier'; M=json.loads((C/'MANIFEST.json').read_text())
def sha(b): return hashlib.sha256(b).hexdigest()
def lines(b): return b.count(b'\n')+(0 if b.endswith(b'\n') else (1 if b else 0))
def rebuild(section,subdir):
 meta=M[section]; chunks=[]
 for p in meta['parts']:
  raw=base64.b64decode(''.join((C/subdir/p['file']).read_text().split()),validate=True)
  if len(raw)!=p['binaryBytes'] or sha(raw)!=p['binarySha256']: raise SystemExit(f"{section.upper()}_PART_MISMATCH:{p['file']}")
  chunks.append(raw)
 packed=b''.join(chunks)
 if len(packed)!=meta['binaryBytes'] or sha(packed)!=meta['binarySha256']: raise SystemExit(f'{section.upper()}_STREAM_MISMATCH')
 source=lzma.decompress(packed,format=lzma.FORMAT_XZ)
 if len(source)!=meta['sourceBytes'] or sha(source)!=meta['sourceSha256']: raise SystemExit(f'{section.upper()}_SOURCE_MISMATCH')
 return source
seed=rebuild('seed','seed-v7'); gen=rebuild('generator','generator')
if len(seed)!=M['v7']['bytes'] or lines(seed)!=M['v7']['lines'] or sha(seed)!=M['v7']['sha256']: raise SystemExit('V7_CONTRACT_MISMATCH')
with tempfile.TemporaryDirectory(prefix='uberbond-v9-') as td:
 td=Path(td); (td/'V7.txt').write_bytes(seed); (td/'generator.py').write_bytes(gen)
 os.environ['UBERBOND_V7_SEED']=str(td/'V7.txt'); os.environ['UBERBOND_V9_OUTPUT']=str(ROOT/M['materializedPath'])
 runpy.run_path(str(td/'generator.py'),run_name='__main__')
out=ROOT/M['materializedPath']; raw=out.read_bytes(); c=M['canonical']
if len(raw)!=c['bytes'] or lines(raw)!=c['lines'] or sha(raw)!=c['sha256']: raise SystemExit('CANONICAL_V9_MISMATCH')
print(json.dumps({'status':'LOSSLESS_VERIFIED','path':str(out),'bytes':len(raw),'lines':lines(raw),'sha256':sha(raw)},indent=2))
