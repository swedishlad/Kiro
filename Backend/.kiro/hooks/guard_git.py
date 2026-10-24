#!/usr/bin/env python3
"""Kiro PreToolUse hook: refuse git commands that would move files under the other sub-agents.

All FairWatt agents share one working tree (docs/ops/git-and-merge.md, agent-rules #10), so checkout / switch /
stash / reset / rebase / clean and `git add -A` or `git add .` are blocked. Kiro passes the tool call as JSON on
STDIN; the JSON shape is not documented, so this scans the whole text. Exit 2 = block (the docs name no exit-code
contract for PreToolUse; the Saturday smoke test checks it), message on STDERR. Bypass for the orchestrator:
put ALLOW_UNSAFE_GIT=1 in the command.
"""
import re
import sys

BLOCK = [
    (r"\bgit\s+(?:-C\s+\S+\s+)?(checkout|switch|stash|reset|rebase|clean)\b", "moves or deletes files for every agent"),
    (r"\bgit\s+add\s+(?:-A|--all|\.(?:\s|\"|$)|\*)", "stages other agents' files; add your own paths by name"),
]

text = sys.stdin.read()
if "ALLOW_UNSAFE_GIT=1" not in text:
    for pattern, why in BLOCK:
        m = re.search(pattern, text)
        if m:
            sys.stderr.write(f"BLOCKED by .kiro/hooks/guard_git.py: `{m.group(0).strip()}` {why} (agent-rules #10).\n"
                             "Commit only your own paths: `git add <your files>` then `git commit -m \"<agent>: ...\"`.\n")
            sys.exit(2)
sys.exit(0)
