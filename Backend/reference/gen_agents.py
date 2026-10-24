#!/usr/bin/env python3
"""Generate .kiro/agents/*.json (Kiro) and .claude/agents/*.md (Claude Code) from ONE table.

Edit the AGENTS table, then run:  python3 reference/gen_agents.py
Kiro fields used are the documented ones (name, description, prompt, tools, resources, toolsSettings,
welcomeMessage); see docs/apis/04. `model` is omitted on purpose (IDE default).
"""
import json
import os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
STEERING = "file://.kiro/steering/**/*.md"
KIRO_TO_CLAUDE = {"read": ["Read", "Grep", "Glob"], "write": ["Write", "Edit"], "shell": ["Bash"],
                  "web": ["WebFetch", "WebSearch"]}

AGENTS = [
    # name, tools, description (drives automatic selection: say WHEN to use it), extra resources
    ("data-ingest", ["read", "write", "shell"],
     "STANDBY (the orchestrator normally runs these tested scripts itself to save credits; launch only on a failure). Builds the build-time data files: rates.json from the Mass.gov rate snapshot (G-DATA-1/2) and recs_ma.csv + "
     "eia_ma_monthly.csv from the federal usage snapshot (G-DATA-3). Use for any data parsing, checksum or ingest task.",
     ["file://docs/apis/01-massgov-basic-service-xlsx.md", "file://docs/apis/08-eia-usage-data.md",
      "file://docs/specs/data-dictionary.md"]),
    ("geo-map", ["read", "write", "shell"],
     "STANDBY (the orchestrator normally runs the map script itself; launch only on a failure). Builds data/build/towns.json (351 Massachusetts towns as pre-projected SVG paths) for the town picker and runs "
     "gate G-GEO. Use for boundary download, simplification, projection, or map file size.",
     ["file://docs/apis/02-lmec-town-boundaries.md", "file://docs/specs/map.md"]),
    ("calc-engine", ["read", "write", "shell"],
     "Owns all browser math: the usage estimator (fit + evaluate + refine), the six-month bill math and trim "
     "scenario, and the supply-rate calculator, with golden and property tests (gates G-EST, G-CALC). Use for "
     "src/engine/estimate, src/engine/calc.ts and tests/engine.",
     ["file://docs/specs/estimator.md", "file://docs/specs/bill-forecast.md", "file://docs/specs/calculator.md",
      "file://contracts/types.ts", "file://contracts/estimate_model.schema.json"]),
    ("forecaster", ["read", "write", "shell"],
     "Builds and walk-forward backtests both forecasts: monthly usage (K0/K1 -> usage_forecast.json) and the "
     "Feb 1 2027 basic-service rate (M0/M1/M2 -> forecast.json); applies both ship rules and writes "
     "research/backtest.md (gate G-FC).",
     ["file://docs/specs/bill-forecast.md", "file://docs/specs/forecast.md", "file://docs/specs/data-dictionary.md",
      "file://research/h1_precheck_output.txt", "file://contracts/forecast.schema.json",
      "file://contracts/usage_forecast.schema.json"]),
    ("ui-builder", ["read", "write", "shell"],
     "Builds the single-page Next.js UI: home inputs with town picker, usage chart, six-bill chart, what-you-can-do "
     "card, all states, light/dark, 375px mobile (gate G-UI). Use for app/, src/ui/, public/ (not public/data).",
     ["file://docs/specs/ui.md", "file://docs/specs/map.md", "file://docs/specs/estimator.md",
      "file://docs/specs/bill-forecast.md", "file://docs/specs/calculator.md", "file://contracts/types.ts",
      "file://docs/ops/scaffold.md"]),
    ("copy-compliance", ["read", "write", "shell", "web"],
     "Owns all user-facing strings, docs/claims.md and research/sources.md; maps every factual sentence to a "
     "source ID, keeps 'estimated' and 'supply portion' labels honest, writes badge text (gate G-CLAIMS).",
     ["file://research/claims-seed.md", "file://research/sources.md", "file://docs/specs/ui.md",
      "file://docs/specs/bill-forecast.md"]),
    ("verifier", ["read", "write", "shell"],
     "Independent tester. Re-runs every gate, recomputes estimates and bills by hand, audits claims, labels, bad "
     "inputs, screenshots, offline and commit ownership. Writes only tests/e2e and research/verification.md; "
     "findings block release.",
     ["file://docs/ops/gates.md", "file://docs/claims.md", "file://docs/specs/estimator.md",
      "file://docs/specs/bill-forecast.md"]),
    ("release", ["read", "write", "shell", "web"],
     "W1: zod schemas + data loader in src/data and the copy-and-validate build script. Later: static export, "
     "Vercel deploy, clean-clone build, DEMO.md, SUBMISSION.md (SundAI card text) and the fallback recording "
     "(gate G-REL).",
     ["file://docs/apis/05-vercel-static-deploy.md", "file://docs/ops/scaffold.md", "file://contracts/types.ts",
      "file://docs/ops/demo-script.md", "file://docs/ops/submission.md"]),
]


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as fh:
        fh.write(text)


def main():
    names = [a[0] for a in AGENTS]
    for name, tools, desc, extra in AGENTS:
        brief = f"file://docs/agents/{name}.md"
        prompt = (f"You are the {name} agent for FairWatt Home. Your full instructions are in docs/agents/{name}.md "
                  f"(loaded as a resource). Follow the rules in .kiro/steering/agent-rules.md, edit only the paths "
                  f".kiro/steering/structure.md assigns to {name}, and end every task with the return block.")
        cfg = {"name": name, "description": desc, "prompt": prompt, "tools": tools,
               "resources": [STEERING, brief] + extra}
        write(os.path.join(ROOT, ".kiro", "agents", f"{name}.json"), json.dumps(cfg, indent=2) + "\n")
        ctools = ", ".join(t for k in tools for t in KIRO_TO_CLAUDE[k])
        reads = "\n".join(f"- {r.replace('file://', '')}" for r in [".kiro/steering/ (all files)", brief] + extra)
        cprompt = (f"You are the {name} agent for FairWatt Home. Before doing anything, read the files listed below, "
                   f"starting with docs/agents/{name}.md (your full instructions). Follow .kiro/steering/agent-rules.md, "
                   f"edit only the paths .kiro/steering/structure.md assigns to {name}, and end every task with the "
                   f"return block.")
        md = (f"---\nname: {name}\ndescription: {desc}\ntools: {ctools}\n---\n\n{cprompt}\n\n"
              f"Read first:\n{reads}\n")
        write(os.path.join(ROOT, ".claude", "agents", f"{name}.md"), md)

    orch = {
        "name": "orchestrator",
        "description": "Main FairWatt Home session: plans waves, delegates to the eight worker agents in parallel, "
                       "runs gates, merges, and makes cut decisions.",
        "prompt": "You are the FairWatt Home orchestrator. Kiro is required by the event; build here. Follow docs/agents/orchestrator.md and WORKFLOW.md. "
                  "Delegate by naming agents explicitly; launch independent agents together; never write feature "
                  "code while sub-agents run; verify every claimed gate by running its command yourself.",
        "tools": ["read", "write", "shell", "subagent"],
        "toolsSettings": {"subagent": {"availableAgents": names,
                                       "trustedAgents": ["data-ingest", "geo-map", "calc-engine"]}},
        "resources": [STEERING, "file://WORKFLOW.md", "file://docs/agents/orchestrator.md",
                      "file://docs/ops/**/*.md"],
        "welcomeMessage": "FairWatt Home orchestrator ready. Start with docs/ops/runbook-saturday.md (hacking begins 11:30).",
    }
    write(os.path.join(ROOT, ".kiro", "agents", "orchestrator.json"), json.dumps(orch, indent=2) + "\n")
    print("wrote", len(AGENTS) + 1, "Kiro agents and", len(AGENTS), "Claude Code agents")


if __name__ == "__main__":
    main()
