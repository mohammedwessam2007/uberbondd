#!/usr/bin/env bash
# Reuse the already-installed PHOENIX desktop recovery donor, preserving identities.
# Clears the inherited VS Code Electron Node-mode flag at the application boundary.
set -euo pipefail
umask 077
donor="${1:-/workspaces/uberbondd/phoenix-bridge-live/ops/phoenix-reactor/bin/recover-existing}"
target="$HOME/.local/bin/phoenix-recover-existing"
python3 - "$donor" "$target" <<'PY'
from pathlib import Path
import sys
src,dst=map(Path,sys.argv[1:])
old=src.read_text()
needle='exec /opt/cos-runtime/chat-on-steroids'
if old.count(needle)!=1:
    raise SystemExit('BLOCKED: installed donor changed; inspect before adapting')
new=old.replace(needle,'exec env -u ELECTRON_RUN_AS_NODE /opt/cos-runtime/chat-on-steroids')
dst.parent.mkdir(parents=True,exist_ok=True)
if dst.exists() and dst.read_text()!=new:
    backup=dst.with_name(dst.name+'.before-wake')
    if not backup.exists(): backup.write_bytes(dst.read_bytes());backup.chmod(0o600)
dst.write_text(new);dst.chmod(0o700)
for name in ['.bashrc','.fluxbox/startup']:
    p=Path.home()/name
    if not p.exists(): continue
    before=p.read_text()
    backup=p.with_name(p.name+'.before-wake-20261024')
    if not backup.exists(): backup.write_text(before);backup.chmod(0o600)
    after=before.replace(str(src),str(dst))
    if name=='.fluxbox/startup' and str(dst) not in after:
        after='#!/bin/sh\n'+str(dst)+' &\n'+before.removeprefix('#!/bin/sh\n')
    if name=='.bashrc' and str(dst) not in after:
        after+='\ncase $- in *i*) '+str(dst)+' ;; esac\n'
    p.write_text(after)
print('INSTALLED: private recovery copy and reversible shell/desktop startup hooks')
PY
# No global process kill, private-key extraction or automatic identity changes.
# An existing poisoned watcher must be inspected and stopped by its exact owned PID.
