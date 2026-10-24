#!/usr/bin/env python3
"""Kiro PostFileSave hook: review and test the just-saved source file.

Kiro passes the tool/event context as JSON on STDIN; the exact shape is not documented, so we scan the JSON for the
first key that looks like a file path (path / filePath / file / ...) and fall back to the first *.ts/*.tsx/*.py token
in the raw text. Branches on extension:

  .ts / .tsx : `npx tsc` (type-check; tsconfig already has noEmit) in scaffold/, then `npm test` (vitest) with a
               60s subprocess timeout so a save never stalls an agent.
  .py        : `python3 -m py_compile <file>` as a cheap syntax/bug gate.

Fail-safe, like guard_git.py / validate_build.py: if a required tool (node/npx/npm) is missing we warn and exit 0 so a
missing dependency never blocks a save. Exit 1 only on a real tsc / test / compile failure. Runs from the project root
(.kiro/hooks/../..). All summary lines are prefixed `review_on_save:`.
"""
import json
import os
import re
import shutil
import subprocess
import sys

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
SCAFFOLD = os.path.join(ROOT, "scaffold")
TEST_TIMEOUT = 60  # seconds; the vitest run is aborted after this so a save never stalls
PATH_KEYS = ("path", "filePath", "file", "filename", "fileName", "savedFile", "uri")


def saved_path(raw):
    """Best-effort extraction of the saved file path from Kiro's stdin JSON (shape undocumented)."""
    try:
        data = json.loads(raw)
    except ValueError:
        data = None
    if isinstance(data, dict):
        # direct keys, then one level of nesting (e.g. {"context": {"path": ...}})
        for key in PATH_KEYS:
            val = data.get(key)
            if isinstance(val, str) and val:
                return val
        for val in data.values():
            if isinstance(val, dict):
                for key in PATH_KEYS:
                    inner = val.get(key)
                    if isinstance(inner, str) and inner:
                        return inner
    # fall back to the first path-like token in the raw text
    m = re.search(r"[\w./\\-]+\.(?:tsx?|py)\b", raw)
    return m.group(0) if m else ""


def run(cmd, cwd=None, timeout=None):
    """Run cmd, return (rc, combined_output). rc is None on TimeoutExpired."""
    try:
        p = subprocess.run(cmd, cwd=cwd, timeout=timeout, stdout=subprocess.PIPE,
                           stderr=subprocess.STDOUT, text=True)
        return p.returncode, p.stdout or ""
    except subprocess.TimeoutExpired:
        return None, ""


def head(text, n=5):
    lines = [ln for ln in text.splitlines() if ln.strip()]
    return lines[:n]


def tail(text, n=8):
    lines = [ln for ln in text.splitlines() if ln.strip()]
    return lines[-n:]


def check_python(path):
    abspath = path if os.path.isabs(path) else os.path.join(ROOT, path)
    if not os.path.exists(abspath):
        print(f"review_on_save: py_compile skipped, file not found ({path})")
        return 0
    rc, out = run([sys.executable, "-m", "py_compile", abspath])
    if rc == 0:
        print("review_on_save: py_compile ok")
        return 0
    print("review_on_save: py_compile FAIL")
    for line in head(out):
        print(f"  - {line}")
    return 1


def check_typescript(path):
    if shutil.which("npx") is None or shutil.which("node") is None:
        print("review_on_save: node/npx not found, skipping tsc + tests (install Node >=20.9.0)")
        return 0
    if not os.path.isdir(SCAFFOLD):
        print("review_on_save: scaffold/ not found, skipping tsc + tests")
        return 0

    # 1) type-check (tsconfig already sets noEmit)
    rc, out = run(["npx", "tsc"], cwd=SCAFFOLD, timeout=120)
    if rc is None:
        print("review_on_save: tsc TIMEOUT (type-check exceeded 120s)")
        return 0
    if rc != 0:
        print("review_on_save: tsc FAIL")
        for line in head(out):
            print(f"  - {line}")
        return 1
    print("review_on_save: tsc ok")

    # 2) full vitest suite, aborted after TEST_TIMEOUT so a save never stalls
    if shutil.which("npm") is None:
        print("review_on_save: npm not found, skipping tests")
        return 0
    rc, out = run(["npm", "test", "--silent"], cwd=SCAFFOLD, timeout=TEST_TIMEOUT)
    if rc is None:
        print(f"review_on_save: tests TIMEOUT (aborted after {TEST_TIMEOUT}s)")
        return 0
    if rc != 0:
        print("review_on_save: tests FAIL")
        for line in tail(out):
            print(f"  - {line}")
        return 1
    print("review_on_save: tests ok")
    return 0


def main():
    raw = sys.stdin.read() if not sys.stdin.isatty() else ""
    path = saved_path(raw)
    if not path:
        print("review_on_save: no .ts/.tsx/.py path in event, nothing to do")
        return 0
    ext = os.path.splitext(path)[1].lower()
    if ext == ".py":
        return check_python(path)
    if ext in (".ts", ".tsx"):
        return check_typescript(path)
    print(f"review_on_save: {path} is not a reviewed type, skipping")
    return 0


if __name__ == "__main__":
    sys.exit(main())
