import json, os, subprocess, sys, tempfile, unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
class V4Tests(unittest.TestCase):
 def test_statusline(self):
  with tempfile.TemporaryDirectory() as d:
   payload={'session_id':'s','model':{'display_name':'Sonnet 5'},'effort':{'level':'xhigh'},'workspace':{'project_dir':d},'context_window':{'used_percentage':76,'current_usage':{'input_tokens':100,'cache_creation_input_tokens':50,'cache_read_input_tokens':850}},'cost':{'total_cost_usd':1.25}}
   p=subprocess.run([sys.executable,str(ROOT/'claude/statusline/apex_statusline.py')],input=json.dumps(payload),text=True,capture_output=True)
   self.assertEqual(p.returncode,0,p.stderr); self.assertIn('RED',p.stdout); self.assertTrue((Path(d)/'.claude/apex/CONTEXT_HEALTH.json').exists())
 def test_evaporation(self):
  with tempfile.TemporaryDirectory() as d:
   payload={'hook_event_name':'PostToolUse','tool_name':'Bash','tool_input':{'command':'tests'},'tool_response':{'stdout':'line\n'*10000,'stderr':''},'cwd':d}
   env=dict(os.environ); env['CLAUDE_PROJECT_DIR']=d
   p=subprocess.run([sys.executable,str(ROOT/'claude/hooks/tool_output_evaporator.py')],input=json.dumps(payload),text=True,capture_output=True,cwd=ROOT/'claude/hooks',env=env)
   self.assertEqual(p.returncode,0,p.stderr); out=json.loads(p.stdout); self.assertIn('updatedToolOutput',out['hookSpecificOutput']); self.assertTrue(list((Path(d)/'.claude/apex/tool-results').glob('*.json')))
 def test_postcompact(self):
  with tempfile.TemporaryDirectory() as d:
   payload={'hook_event_name':'PostCompact','trigger':'manual','compact_summary':'mission authority architecture invariants tests blockers external actions rollback next action','cwd':d}
   env=dict(os.environ); env['CLAUDE_PROJECT_DIR']=d
   p=subprocess.run([sys.executable,str(ROOT/'claude/hooks/postcompact_v4.py')],input=json.dumps(payload),text=True,capture_output=True,cwd=ROOT/'claude/hooks',env=env)
   self.assertEqual(p.returncode,0,p.stderr); report=json.loads((Path(d)/'.claude/apex/COMPACTION_AUDIT.json').read_text()); self.assertFalse(report['missing_terms'])
 def test_benchmark_rejects_quality_loss(self):
  with tempfile.TemporaryDirectory() as d:
   b=Path(d)/'b.json'; c=Path(d)/'c.json'; b.write_text(json.dumps({'acceptance_score':.95,'review_defects':1,'input_tokens':1000,'output_tokens':100,'duration_seconds':100})); c.write_text(json.dumps({'acceptance_score':.90,'review_defects':1,'input_tokens':500,'output_tokens':100,'duration_seconds':80}))
   p=subprocess.run([sys.executable,str(ROOT/'scripts/benchmark_fraction_engine.py'),str(b),str(c)],text=True,capture_output=True)
   self.assertEqual(json.loads(p.stdout)['verdict'],'DO_NOT_PROMOTE')
if __name__=='__main__': unittest.main()
