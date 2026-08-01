#!/usr/bin/env python3
from __future__ import annotations
import json, re, time
from lib import *
data=read_input(); apex=apex_dir(data); summary=str(data.get('compact_summary') or '')
required=['mission','authority','architecture','invariant','test','block','external','rollback','next']
present={x:bool(re.search(x,summary,re.I)) for x in required}
missing=[x for x,v in present.items() if not v]
report={'at':time.time(),'trigger':data.get('trigger'),'summary_sha256':sha(summary),'summary_chars':len(summary),'continuity_terms':present,'missing_terms':missing}
(apex/'COMPACTION_AUDIT.json').write_text(json.dumps(report,indent=2)+'\n')
brief=['# Post-compaction rehydration','',f'Summary SHA-256: `{report["summary_sha256"]}`','',f'Missing continuity signals: {", ".join(missing) if missing else "none"}.','','Reload `.claude/apex/APEX_STATE.json` and authoritative mission artifacts before continuing. Do not reopen rejected paths without new evidence.']
(apex/'REHYDRATION_BRIEF.md').write_text('\n'.join(brief)+'\n')
append_jsonl(apex/'lifecycle.jsonl',event_row(data,{'status':'compacted','audit':report}))
