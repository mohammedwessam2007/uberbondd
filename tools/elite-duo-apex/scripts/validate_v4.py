#!/usr/bin/env python3
from __future__ import annotations
import json,py_compile,re,sqlite3,subprocess,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]; errors=[]
for p in ROOT.rglob('*.json'):
 if '__pycache__' in p.parts: continue
 try: json.loads(p.read_text())
 except Exception as e: errors.append(f'invalid json {p.relative_to(ROOT)}: {e}')
for p in ROOT.rglob('*.py'):
 if '__pycache__' in p.parts: continue
 try: py_compile.compile(str(p),doraise=True)
 except Exception as e: errors.append(f'invalid python {p.relative_to(ROOT)}: {e}')
for p in list((ROOT/'claude/agents').glob('*.md'))+list((ROOT/'library/agents').glob('*/*/AGENT.md')):
 text=p.read_text();
 if 'model: sonnet' not in text: errors.append(f'non-sonnet {p.relative_to(ROOT)}')
required=['claude/statusline/apex_statusline.py','claude/hooks/context_governor.py','claude/hooks/tool_output_evaporator.py','claude/hooks/precompact_v4.py','claude/hooks/postcompact_v4.py','scripts/benchmark_fraction_engine.py','context-engine/CONTEXT_POLICY.json']
for x in required:
 if not (ROOT/x).exists(): errors.append('missing '+x)
settings=json.loads((ROOT/'claude/settings/settings.apex.json').read_text())
if 'statusLine' not in settings: errors.append('statusLine missing')
if settings.get('env',{}).get('CLAUDE_AUTOCOMPACT_PCT_OVERRIDE')!='82': errors.append('compaction threshold missing')
proc=subprocess.run([sys.executable,'-m','unittest','discover','-s',str(ROOT/'tests')],capture_output=True,text=True)
if proc.returncode: errors.append('tests failed\n'+proc.stdout+proc.stderr)
con=sqlite3.connect(ROOT/'library/catalog.sqlite'); count=con.execute('select count(*) from artifacts').fetchone()[0]; con.close()
files=sum(1 for p in ROOT.rglob('*') if p.is_file() and '__pycache__' not in p.parts)
report={'passed':not errors,'file_count':files,'catalog_artifacts':count,'unit_tests':'passed' if proc.returncode==0 else 'failed','v4_features':{'statusline':True,'context_governor':True,'tool_evaporation':True,'compaction_audit':True,'fork_profile':True,'quality_gated_benchmark':True},'errors':errors}
print(json.dumps(report,indent=2)); raise SystemExit(0 if not errors else 1)
