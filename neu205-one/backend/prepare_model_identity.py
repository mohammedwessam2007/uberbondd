#!/usr/bin/env python3
"""Read-only actual GGUF verification; writes a new owner-only deployment receipt.
No phone access, downloads, model conversion, or inference. Never replaces an existing receipt.
"""
import argparse,json,os
from pathlib import Path
from frozen_gguf_identity import identity

def main():
    p=argparse.ArgumentParser();p.add_argument('model',type=Path);p.add_argument('--out',type=Path,required=True);a=p.parse_args()
    info=identity(str(a.model))
    if not str(info.get('architecture','')).lower().startswith('qwen') or not info.get('chat_template_sha256') or info.get('tensor_count',0)<1:raise SystemExit('Actual GGUF is not a verified Qwen architecture with tensors and chat template.')
    receipt=dict(info,model_path=str(a.model.resolve()),server_alias='qwen-'+info['sha256'][:12],server_weight_binding_proven=False)
    fd=os.open(a.out,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
    with os.fdopen(fd,'w') as f:json.dump(receipt,f,indent=2);f.write('\n')
    print('Verified Qwen GGUF deployment receipt written; model file unchanged. Loaded server weight binding requires controlled launch.')
if __name__=='__main__':main()
