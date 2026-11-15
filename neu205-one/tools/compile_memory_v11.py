#!/usr/bin/env python3
"""Compile a new private active-memory version, preserving all existing source/index files."""
import argparse,json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
from active_memory_v11 import compile_memory,file_sha,MemoryFailure
PDF='c3298e8c5f7f807604be10f7376d67f05eb315dd982276263e8f6ad2e8e70940'
def main():
    p=argparse.ArgumentParser();p.add_argument('--pages',type=Path,required=True);p.add_argument('--pdf',type=Path,required=True);p.add_argument('--frozen-corpus',type=Path,required=True);p.add_argument('--frozen-manifest',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args()
    m=json.loads(a.frozen_manifest.read_text())
    if file_sha(a.pdf)!=PDF or file_sha(a.frozen_corpus)!=m.get('corpus_sha256') or file_sha(a.pages)!=m.get('source_pages_sha256'):raise MemoryFailure('SOURCE_BINDING_FAILED','Original PDF/pages/frozen corpus binding is not verified.')
    result=compile_memory(a.pages,a.out,PDF,m['corpus_sha256'])
    print(json.dumps(result,indent=2))
if __name__=='__main__':main()
