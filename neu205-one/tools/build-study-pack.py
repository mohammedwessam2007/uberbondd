#!/usr/bin/env python3
"""Prepare a private signed Android import ZIP. Never place its contents in Git."""
import argparse,hashlib,json,pathlib,subprocess,tempfile,zipfile,os
ROOT=pathlib.Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--assets',type=pathlib.Path,required=True);p.add_argument('--output',type=pathlib.Path,required=True);p.add_argument('--keystore',type=pathlib.Path,required=True);p.add_argument('--password-file',type=pathlib.Path,required=True);p.add_argument('--model-receipt',type=pathlib.Path);p.add_argument('--with-asr',action='store_true');a=p.parse_args()
out=a.output.resolve()
if out.is_relative_to(ROOT):raise SystemExit('Private pack output must be outside public source repository')
paths=['corpus.jsonl','corpus.manifest.json']
if a.with_asr:paths+=['models/whisper/'+n for n in ('encoder.onnx','decoder.onnx','tokens.txt','config.properties')]
files=[]
for name in paths:
 f=a.assets/name
 if f.is_symlink() or not f.is_file():raise SystemExit('Missing or linked asset: '+name)
 h=hashlib.file_digest(f.open('rb'),'sha256').hexdigest();files.append(dict(path=name,bytes=f.stat().st_size,sha256=h))
if files[0]['sha256']!='2f7874d9aec84e85567c21bb6b2bd291a3a1ea6237d8bdabfa216628a166f5be':raise SystemExit('Unapproved corpus identity')
m=dict(schema='neu205.android-pack.v1',book_pdf_sha256='c3298e8c5f7f807604be10f7376d67f05eb315dd982276263e8f6ad2e8e70940',corpus_sha256=files[0]['sha256'],files=files)
if a.model_receipt:m['model']=json.loads(a.model_receipt.read_text())
out.parent.mkdir(parents=True,exist_ok=True)
with tempfile.TemporaryDirectory(dir=out.parent) as stage:
 d=pathlib.Path(stage);manifest=d/'manifest.json';sig=d/'manifest.sig';manifest.write_text(json.dumps(m,sort_keys=True,separators=(',',':')))
 subprocess.run(['java',str(ROOT/'tools/PackSigner.java'),str(a.keystore),str(a.password_file),'neu205one',str(manifest),str(sig)],check=True)
 temp=d/'pack.zip'
 with zipfile.ZipFile(temp,'w',compression=zipfile.ZIP_DEFLATED) as z:
  z.write(manifest,'manifest.json');z.write(sig,'manifest.sig')
  for name in paths:z.write(a.assets/name,name)
 os.chmod(temp,0o600);os.replace(temp,out)
print(json.dumps(dict(path=str(out),bytes=out.stat().st_size,sha256=hashlib.file_digest(out.open('rb'),'sha256').hexdigest())))
