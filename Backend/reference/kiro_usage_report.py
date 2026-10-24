#!/usr/bin/env python3
"""Gate G-KIRO: report (and check) how the project used Kiro, from what is actually in the repo.

Usage:
  python3 reference/kiro_usage_report.py                       # print the evidence table
  python3 reference/kiro_usage_report.py --write docs/KIRO.md  # replace the block between the kiro-report markers
  python3 reference/kiro_usage_report.py --check               # exit 1 unless the evidence below is in place
Optional: --base <W0b-hash> counts only commits after the scaffold commit.

--check requires: >= 5 steering files with `inclusion:` front matter; one spec folder with requirements.md,
design.md and tasks.md and >= 70% of its tasks ticked; >= 2 valid hook files; >= 4 worker agents that authored
commits (subject prefix "<agent>: "); docs/KIRO.md present with no TODO and a filled "Credits used" line.
Sub-agents commit as "<agent>: ..." (docs/ops/git-and-merge.md), so the commit log is the usage evidence.
"""
import glob
import json
import os
import re
import subprocess
import sys
from collections import defaultdict

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
START, END = "<!-- kiro-report:start -->", "<!-- kiro-report:end -->"
NON_WORKERS = {"orchestrator", "human"}


def steering():
    out = []
    for f in sorted(glob.glob(os.path.join(ROOT, ".kiro", "steering", "*.md"))):
        head = open(f).read(200)
        m = re.match(r"---\s*\n(.*?)\n---", head, re.S)
        mode = re.search(r"inclusion:\s*(\w+)", m.group(1)).group(1) if m and "inclusion:" in m.group(1) else None
        out.append((os.path.basename(f), mode))
    return out


def specs():
    out = []
    for d in sorted(glob.glob(os.path.join(ROOT, ".kiro", "specs", "*"))):
        names = [n for n in ("requirements.md", "design.md", "tasks.md") if os.path.exists(os.path.join(d, n))]
        done = total = 0
        if "tasks.md" in names:
            for line in open(os.path.join(d, "tasks.md")):
                m = re.match(r"\s*- \[( |x|X)\]", line)
                if m:
                    total += 1
                    done += m.group(1) != " "
        out.append((os.path.basename(d), names, done, total))
    return out


def hooks():
    out = []
    for f in sorted(glob.glob(os.path.join(ROOT, ".kiro", "hooks", "*.json"))):
        try:
            d = json.load(open(f))
            for h in d["hooks"]:
                out.append((h["name"], h["trigger"], h["action"]["type"]))
            ok = d.get("version") == "v1"
        except (ValueError, KeyError, OSError):
            ok = False
        if not ok:
            out.append((os.path.basename(f), "INVALID", "-"))
    return out


def agents():
    names = []
    for f in sorted(glob.glob(os.path.join(ROOT, ".kiro", "agents", "*.json"))):
        try:
            names.append(json.load(open(f))["name"])
        except (ValueError, KeyError, OSError):
            pass
    return names


def commits(base):
    rng = f"{base}..HEAD" if base else "HEAD"
    try:
        log = subprocess.run(["git", "-C", ROOT, "log", "--reverse", "--no-merges", "--name-only",
                              "--format=%x01%H%x00%aI%x00%s", rng, "--", "."],
                             capture_output=True, text=True, check=True).stdout
    except (subprocess.CalledProcessError, OSError):
        return {}
    known = set(agents()) | {"human"}
    by = defaultdict(lambda: {"n": 0, "files": set(), "gates": 0, "first": None, "last": None})
    for block in log.split("\x01")[1:]:
        head, *files = block.strip("\n").split("\n")
        _, when, subject = head.split("\x00", 2)
        agent = subject.split(":", 1)[0].strip() if ":" in subject else "other"
        a = by[agent if agent in known else "other"]
        a["n"] += 1
        a["files"].update(f for f in files if f)
        a["gates"] += len(re.findall(r"\(G-[A-Z0-9/-]+:\s*pass\)", subject))
        a["first"], a["last"] = a["first"] or when, when
    return by


def render(base):
    lines = ["| Kiro feature | Evidence in this repo |", "|---|---|"]
    st = steering()
    lines.append(f"| Steering | {len(st)} files in `.kiro/steering/` ({', '.join(f'{n} [{m}]' for n, m in st)}) |")
    for name, files, done, total in specs():
        lines.append(f"| Spec | `.kiro/specs/{name}/` has {', '.join(files)}; **{done}/{total} tasks ticked** |")
    hk = hooks()
    lines.append(f"| Hooks | {len(hk)}: " + "; ".join(f"{n} ({t}, {a})" for n, t, a in hk) + " |")
    ag = agents()
    lines.append(f"| Custom agents | {len(ag)} in `.kiro/agents/`: {', '.join(ag)} |")
    by = commits(base)
    lines += ["", "| Commit author (agent prefix) | Commits | Files touched | Gates passed in subjects | First → last commit |",
              "|---|---|---|---|---|"]
    for agent, a in sorted(by.items(), key=lambda kv: -kv[1]["n"]):
        span = f"{a['first'][11:16]} → {a['last'][11:16]}" if a["first"] else "-"
        lines.append(f"| {agent} | {a['n']} | {len(a['files'])} | {a['gates']} | {span} |")
    return "\n".join(lines), by


def check(base):
    problems = []
    st = steering()
    if len(st) < 5 or any(m is None for _, m in st):
        problems.append(f"steering: need >= 5 files with `inclusion:` front matter (have {len(st)}, "
                        f"{sum(m is None for _, m in st)} without)")
    sp = [s for s in specs() if len(s[1]) == 3]
    if not sp:
        problems.append("spec: no folder in .kiro/specs/ with requirements.md, design.md and tasks.md")
    elif not any(t and d / t >= 0.7 for _, _, d, t in sp):
        problems.append("spec: fewer than 70% of tasks.md items are ticked")
    if len([h for h in hooks() if h[1] != "INVALID"]) < 2 or any(h[1] == "INVALID" for h in hooks()):
        problems.append("hooks: need >= 2 valid hooks (version v1) and none invalid")
    workers = [a for a in commits(base) if a not in NON_WORKERS and a != "other"]
    if len(workers) < 4:
        problems.append(f"agents: need >= 4 worker agents with commits, have {len(workers)} ({', '.join(workers) or 'none'})")
    kiro_md = os.path.join(ROOT, "docs", "KIRO.md")
    if not os.path.exists(kiro_md):
        problems.append("docs/KIRO.md missing")
    else:
        text = open(kiro_md).read()
        if "TODO" in text:
            problems.append("docs/KIRO.md still contains TODO")
        if not re.search(r"Credits used:\s*[\d,.]+", text):
            problems.append("docs/KIRO.md: fill the 'Credits used:' line with a number")
    return problems


def main():
    args = sys.argv[1:]
    base = args[args.index("--base") + 1] if "--base" in args else None
    if "--check" in args:
        problems = check(base)
        for p in problems:
            print("FAIL", p)
        print("G-KIRO:", "PASS" if not problems else "FAIL")
        sys.exit(1 if problems else 0)
    table, _ = render(base)
    if "--write" in args:
        path = os.path.join(ROOT, args[args.index("--write") + 1])
        text = open(path).read()
        if START not in text or END not in text:
            sys.exit(f"{path} has no {START} ... {END} block")
        head, rest = text.split(START, 1)
        tail = rest.split(END, 1)[1]
        open(path, "w").write(f"{head}{START}\n{table}\n{END}{tail}")
        print(f"updated {path}")
    else:
        print(table)


if __name__ == "__main__":
    main()
