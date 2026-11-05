#!/usr/bin/env python3
"""Emit ONLY fixed public error categories; never export log text, paths or identifiers."""
import json
from pathlib import Path
import sys

PATTERNS = {
    'dependency_verification': ('dependency verification failed', 'failed verification'),
    'sdk_unavailable': ('sdk location not found', 'failed to find platform sdk', 'failed to find build tools'),
    'sdk_license': ('licenses have not been accepted', 'license for package'),
    'java_toolchain': ('unsupported class file', 'invalid source release', 'no matching toolchains'),
    'framework_test_failure': ('there were failing tests', 'test failed'),
    'lint_failure': ('lint found', 'lint found fatal errors'),
    'source_compile_failure': ('compilation failed', 'cannot find symbol'),
    'network_dependency_failure': ('could not resolve', 'could not get resource', 'unable to download'),
    'gradle_process_failure': ('daemon disappeared', 'unable to start the daemon'),
}


def classify(text):
    text = text.lower()
    found = [name for name, patterns in PATTERNS.items() if any(p in text for p in patterns)]
    return found or ['unclassified_failure']


if __name__ == '__main__':
    result = classify(Path(sys.argv[1]).read_text(errors='replace'))
    print('::error title=NEU205 Android CI classification::' + ','.join(result))
