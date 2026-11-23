#!/usr/bin/env python3
"""Verify each packaged source relative to extracted archive root. No network/execution of project code."""
import json,hashlib,pathlib,sys
root=pathlib.Path(__file__).resolve().parent.parent
manifest=json.loads((root/'90_INTEGRITY/FILE_MANIFEST.json').read_text(encoding='utf-8'))
errors=[]
for it in manifest['files_excluding_manifest']:
 p=root/it['path']
 if not p.is_file(): errors.append('MISSING '+it['path']);continue
 raw=p.read_bytes()
 if len(raw)!=it['size_bytes'] or hashlib.sha256(raw).hexdigest()!=it['sha256']: errors.append('MISMATCH '+it['path'])
print('Verified',len(manifest['files_excluding_manifest'])-len(errors),'/',len(manifest['files_excluding_manifest']),'manifest-listed files')
for e in errors:print(e)
sys.exit(1 if errors else 0)
