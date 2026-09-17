#!/usr/bin/env python3
from pathlib import Path
import base64, hashlib, json, lzma, runpy, tempfile
ROOT=Path.cwd(); C=ROOT/'artifacts'/'inevitability-v9-carrier'; M=json.loads((C/'MANIFEST.json').read_text())
def sha(b): return hashlib.sha256(b).hexdigest()
def rebuild(section, subdir):
 meta=M[section]; chunks=[]
 for p in meta['parts']:
  f=C/subdir/p['file']; enc=f.read_bytes()
  if len(enc)!=p['encodedBytes'] or sha(enc)!=p['encodedSha256']: raise SystemExit(f"{section.upper()}_ENCODED_PART_MISMATCH:{p['file']}")
  raw=base64.b64decode(enc.strip(),validate=True)
  if len(raw)!=p['binaryBytes'] or sha(raw)!=p['binarySha256']: raise SystemExit(f"{section.upper()}_BINARY_PART_MISMATCH:{p['file']}")
  chunks.append(raw)
 packed=b''.join(chunks)
 if len(packed)!=meta['binaryBytes'] or sha(packed)!=meta['binarySha256']: raise SystemExit(f"{section.upper()}_STREAM_MISMATCH")
 source=lzma.decompress(packed,format=lzma.FORMAT_XZ)
 if len(source)!=meta['sourceBytes'] or sha(source)!=meta['sourceSha256']: raise SystemExit(f"{section.upper()}_SOURCE_MISMATCH")
 return source
seed=rebuild('seed','seed-v7'); generator=rebuild('generator','generator')
with tempfile.NamedTemporaryFile(prefix='uberbond-v9-materializer-',suffix='.py',delete=False) as f:
 f.write(generator); temp=Path(f.name)
try: runpy.run_path(str(temp),run_name='__main__')
finally: temp.unlink(missing_ok=True)
out=ROOT/M['materializedPath']; raw=out.read_bytes(); lines=raw.count(b'\n')+(0 if raw.endswith(b'\n') else (1 if raw else 0))
if len(raw)!=M['canonical']['bytes'] or lines!=M['canonical']['lines'] or sha(raw)!=M['canonical']['sha256']: raise SystemExit('CANONICAL_V9_MISMATCH')
print(json.dumps({'status':'LOSSLESS_VERIFIED','path':str(out),'bytes':len(raw),'lines':lines,'sha256':sha(raw),'seedParts':len(M['seed']['parts']),'generatorParts':len(M['generator']['parts'])},indent=2))
