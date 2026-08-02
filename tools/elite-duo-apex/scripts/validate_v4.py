#!/usr/bin/env python3
# COMPATIBILITY-ONLY: this validates the vendored package's own source tree
# in isolation. It is not authoritative for the installed repo deployment --
# use scripts/validate_repo_deployment.py for that (repo-root .claude/ +
# tools/elite-duo-apex/).
from __future__ import annotations
import json,py_compile,re,sqlite3,subprocess,sys,tempfile
from pathlib import Path
PKG_ROOT=Path(__file__).resolve().parents[1]
# Runtime agents/skills/hooks/rules/settings/statusline live at the repo root's
# .claude/ tree, not under a tools/elite-duo-apex/claude/ mirror -- this file
# is vendored library source, so its own PKG_ROOT is only correct for
# library/, schemas/, scripts/, tests/, context-engine/.
REPO_ROOT=Path(__file__).resolve().parents[3]
CLAUDE_DIR=REPO_ROOT/".claude"
errors=[]
for p in PKG_ROOT.rglob('*.json'):
 if '__pycache__' in p.parts: continue
 try: json.loads(p.read_text())
 except Exception as e: errors.append(f'invalid json {p.relative_to(PKG_ROOT)}: {e}')
for p in PKG_ROOT.rglob('*.py'):
 if '__pycache__' in p.parts: continue
 try: py_compile.compile(str(p),doraise=True)
 except Exception as e: errors.append(f'invalid python {p.relative_to(PKG_ROOT)}: {e}')
for p in list((CLAUDE_DIR/'agents').glob('*.md'))+list((PKG_ROOT/'library/agents').glob('*/*/AGENT.md')):
 text=p.read_text();
 if 'model: sonnet' not in text: errors.append(f'non-sonnet {p}')
required=[CLAUDE_DIR/'statusline/apex_statusline.py',CLAUDE_DIR/'hooks/context_governor.py',CLAUDE_DIR/'hooks/tool_output_evaporator.py',CLAUDE_DIR/'hooks/precompact_v4.py',CLAUDE_DIR/'hooks/postcompact_v4.py',PKG_ROOT/'scripts/benchmark_fraction_engine.py',PKG_ROOT/'context-engine/CONTEXT_POLICY.json']
for x in required:
 if not x.exists(): errors.append('missing '+str(x))
settings=json.loads((CLAUDE_DIR/'settings.json').read_text())
if 'statusLine' not in settings: errors.append('statusLine missing')
if settings.get('env',{}).get('CLAUDE_AUTOCOMPACT_PCT_OVERRIDE')!='82': errors.append('compaction threshold missing')
proc=subprocess.run([sys.executable,'-m','unittest','discover','-s',str(PKG_ROOT/'tests')],capture_output=True,text=True)
if proc.returncode: errors.append('tests failed\n'+proc.stdout+proc.stderr)
# Catalog is generated, gitignored, and never required to pre-exist: build a
# throwaway copy in a temporary directory so validation works from a fresh
# checkout without depending on (or leaving behind) library/catalog.sqlite.
with tempfile.TemporaryDirectory() as catalog_dir:
    build=subprocess.run(
        [sys.executable,str(PKG_ROOT/'library/build_catalog.py'),'--output-dir',catalog_dir],
        capture_output=True,text=True,
    )
    if build.returncode:
        errors.append('catalog build failed:\n'+build.stdout+build.stderr)
        count=0
    else:
        con=sqlite3.connect(Path(catalog_dir)/'catalog.sqlite')
        count=con.execute('select count(*) from artifacts').fetchone()[0]
        con.close()
files=sum(1 for p in PKG_ROOT.rglob('*') if p.is_file() and '__pycache__' not in p.parts)
report={'passed':not errors,'file_count':files,'catalog_artifacts':count,'unit_tests':'passed' if proc.returncode==0 else 'failed','v4_features':{'statusline':True,'context_governor':True,'tool_evaporation':True,'compaction_audit':True,'fork_profile':True,'quality_gated_benchmark':True},'errors':errors}
print(json.dumps(report,indent=2)); raise SystemExit(0 if not errors else 1)
