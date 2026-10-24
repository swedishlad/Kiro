#!/usr/bin/env python3
"""Gate G-OWN: check that changed files belong to the agent that changed them (per .kiro/steering/structure.md).

Usage:
  python3 reference/check_ownership.py --commits <W0b-hash>..HEAD      # every commit vs the agent in its subject
  git status --porcelain -uall | cut -c4- | python3 reference/check_ownership.py --owner-of   # who owns each file
  python3 reference/check_ownership.py forecaster src/engine/forecast/m0.ts app/page.tsx   # explicit list
Commit subjects must start with "<agent>: " (docs/ops/git-and-merge.md); the W0b commit
("orchestrator: scaffold ...") is exempt. Exit 0 = pass; 1 = violations (printed with their real owner).
"""
import os
import re
import subprocess
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
TABLE = os.path.join(ROOT, ".kiro", "steering", "structure.md")


def glob_to_re(g):
    out, i = "", 0
    while i < len(g):
        if g.startswith("**", i):
            out += ".*"
            i += 2
        elif g[i] == "*":
            out += "[^/]*"
            i += 1
        else:
            out += re.escape(g[i])
            i += 1
    return re.compile("^" + out + "$")


def load_rules():
    rules = []   # (regex, glob, owner, is_exception)
    for line in open(TABLE):
        m = re.match(r"^\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*$", line)
        if not m or m.group(1) in ("Path", "---"):
            continue
        paths, owner = m.group(1), m.group(2).split("(")[0].strip()
        for g in re.findall(r"`([^`]+)`", paths):
            rules.append((glob_to_re(g), g, owner))
    return rules


def owner_of(path, rules):
    # most specific (longest glob without wildcards) wins, so `public/data/**` beats `public/**`
    hits = [(len(g.replace("*", "")), o, g) for rx, g, o in rules if rx.match(path) or rx.match(path + "/")]
    return max(hits)[1:] if hits else (None, None)


def owners_of(cell):
    """An owner cell may list several agents: 'data-ingest / orchestrator' (the orchestrator runs tested scripts itself)."""
    return [o.strip().split()[0] for o in cell.split("/") if o.strip()]


def violations(agent, files, rules):
    bad = []
    for f in files:
        owner, g = owner_of(f, rules)
        if owner is None or agent not in owners_of(owner):
            bad.append(f"VIOLATION {f}  (owner: {owner or 'UNOWNED'}{' via ' + g if g else ''})")
    return bad


def check_commits(rev_range, rules):
    known = {a for _, _, o in rules for a in owners_of(o)}
    log = subprocess.run(["git", "log", "--reverse", "--no-merges", "--format=%H%x00%s", rev_range],
                         capture_output=True, text=True, check=True).stdout
    commits, bad = [l.split("\0", 1) for l in log.splitlines() if l], 0
    for sha, subject in commits:
        if subject.startswith("orchestrator: scaffold"):
            print(f"EXEMPT {sha[:8]} {subject}")
            continue
        agent = subject.split(":", 1)[0].strip() if ":" in subject else ""
        files = subprocess.run(["git", "diff-tree", "--no-commit-id", "--name-only", "-r", sha],
                               capture_output=True, text=True, check=True).stdout.split()
        problems = ([f"VIOLATION commit subject has no known agent prefix: {subject!r}"] if agent not in known
                    else violations(agent, files, rules))
        for p in problems:
            print(f"{sha[:8]} {p}")
        bad += len(problems)
    print(f"G-OWN commits: {'PASS' if not bad else 'FAIL'} ({len(commits)} commits, {bad} violations)")
    return bad


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    rules = load_rules()
    if sys.argv[1] == "--commits" and len(sys.argv) == 3:
        sys.exit(1 if check_commits(sys.argv[2], rules) else 0)
    if sys.argv[1] == "--owner-of":
        for f in sys.argv[2:] or [l.strip() for l in sys.stdin if l.strip()]:
            owner, g = owner_of(f, rules)
            print(f"{owner or 'UNOWNED':<16} {f}")
        return
    agent = sys.argv[1]
    files = sys.argv[2:] or [l.strip() for l in sys.stdin if l.strip()]
    bad = violations(agent, files, rules)
    for line in bad:
        print(line)
    print(f"G-OWN {agent}: {'PASS' if not bad else 'FAIL'} ({len(files)} files, {len(bad)} violations)")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
