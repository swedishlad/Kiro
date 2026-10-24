# SundAI submission template (release fills `docs/SUBMISSION.md` by 18:30; a human submits at 18:45)

From the event page: "Build in Kiro, keep your project connected to GitHub, and submit through SundAI. Saving code in Kiro or pushing it to GitHub does not complete your SundAI submission." Before you submit: latest code on GitHub; correct repo in the submission; project built with Kiro; required fields complete; SundAI shows **submitted** before 8 PM sharp.

```
Project name:   FairWatt Home
Track:          Energy & climate tech
One-liner:      Estimate and forecast a Massachusetts home's electricity use and supply bills, honestly, without anyone's private data.
Description (≤ 150 words):
  Nobody can look up a home's electricity use from its address: that data belongs to the customer. FairWatt Home
  asks four questions (size, age, type, heating), estimates monthly usage from 552 Massachusetts homes in the
  federal RECS 2020 survey, shapes it with 16 years of state data (EIA-861M), and forecasts the next six supply
  bills across the Feb 1 2027 basic-service reset. Both forecasts are walk-forward backtested against a simple
  baseline, and the badges say whether they beat it ({usage badge}; {rate badge}). Type a few months from your
  bills and the estimate becomes yours. If you're on a competitive supplier, it shows what basic service would
  cost, in both directions. Static app, no accounts, no data leaves your browser; every number has a source.
What's real vs estimated: rates and history are official (Mass.gov, EIA); household usage is an estimate until
  you type your own months; dollars are the supply portion only.
Live URL:       {https://…vercel.app}
GitHub repo:    {https://github.com/<you>/<repo>}   ← must be the Kiro-connected repo
Built with:     Kiro. Spec-driven (requirements, design, 34-task plan in .kiro/specs/), 5 steering files, 2 hooks
                (git guard for the shared tree, schema validation on save), an orchestrator delegating to parallel
                sub-agents (calc-engine, forecaster, ui-builder, copy-compliance, release, verifier), agent-prefixed
                commits. How, with measured numbers: docs/KIRO.md in the repo. Next.js static export, hand-written SVG.
Team:           {names}
```

## G-SUBMIT checklist (18:45, human)
- [ ] Latest commit visible on github.com in the repo above.
- [ ] Live URL opens on a phone.
- [ ] `docs/KIRO.md` is in the repo and `G-KIRO: PASS`; the description's "Built with" numbers match it.
- [ ] Card created on SundAI in the Hackachusetts event, track selected, repo URL pasted, all required fields filled.
- [ ] SundAI shows the project as **submitted**. Screenshot → `research/CHANGELOG.md`.
- [ ] If anything fails: campus host / facilitators **before 19:30**.
