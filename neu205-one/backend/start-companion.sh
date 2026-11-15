#!/data/data/com.termux/files/usr/bin/bash
# Owner-opted, fixed-path RUN_COMMAND target. No arguments and no arbitrary shell extras.
set -eu
if [ "$#" -ne 0 ]; then
  echo 'This fixed launcher accepts no arguments.' >&2
  exit 2
fi
cd /data/data/com.termux/files/home/neu205-one
umask 077
if [ ! -d .private ]; then
  echo 'SETUP_REQUIRED: Owner-private assets must be imported first.' >&2
  exit 1
fi
# Logs contain setup status only; bridge never logs questions, audio, textbook or credentials.
# Python's retained flock permits only one companion and never replaces an occupied port.
exec /data/data/com.termux/files/usr/bin/python backend/launch_local.py
