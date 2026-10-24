# Open questions (owner → orchestrator). Close each with an answer + source, or a decision.

| # | Question | Why it matters | Who | Deadline | Status |
|---|---|---|---|---|---|
| Q1 | Do event rules allow pre-built code, data or agent configs? (Gate 0) | Determines which repo version starts at 11:30 | TC (host at check-in) | Sat 09:40 | open; S16 doesn't address it |
| Q2 | Submission format (repo, URL, video)? Judging criteria? | Shapes W5 | TC (Discord / 09:00 brief) | Sat 09:20 | open |
| Q3 | Town → utility source (L1) with ≥ 95% coverage? | Utility prefill | human (TC's team) | Sat 11:30 | open; optional |
| Q4 | Town aggregation status source (L2)? | Map + calculator caveat | — | — | dropped for today |
| Q5 | Time window of the AG $738.7M figure | Pitch hook (C-03) | — | — | **closed**: newsletter verbatim "since 2018" (S2, Oct 23) |
| Q6 | Correct AG / DPU consumer phone numbers | C-12 | copy-compliance | Sat 15:00 | open |
| Q7 | How we differ from Energy Switch MA | Judge question | copy-compliance | Sat 15:00 | open |
| Q8 | Legislative status of H.5175 / S.3166 after Aug 4 2026 | Optional context | copy-compliance | optional | open |
| Q9 | The 13 irregular terms: real, or workbook artifacts? (Check the per-utility tabs) | Forecast backtest hygiene | data-ingest (needs the XLSX) | Sat 11:00 | open |
| Q10 | Were in-term monthly prices published in advance historically (IS-B validity)? | Forecast honesty | forecaster (report both IS) | Sat 14:30 | open |
| Q11 | Kiro Markdown agent front-matter keys; `permissions.rules` match syntax | Could enforce ownership natively | orchestrator | — | JSON agents confirmed in Kiro docs (Oct 23); commit-based G-OWN used |
| Q13 | Kiro credits consumed per sub-agent run | 2,000 per person may not cover 8 agents × 3 checkpoints | orchestrator | Sat 09:30 (smoke test) | open |
| Q14 | Estimator LOO error: is the band useful or too wide to show? | Card 2's credibility | calc-engine | Sat 13:00 | open; fit R² 0.34 suggests a wide band |
| Q16 | Does a `PreToolUse` command hook block a tool call, and with which exit code? (Docs say the trigger can block but give no mechanism) | `.kiro/hooks/guard-git.json` is advisory until proven | orchestrator | Sat 09:30 smoke test, step 5 | open |
| Q17 | Does Kiro list the hand-written `.kiro/specs/fairwatt-home/` in its Specs pane and run its tasks? | Whether the spec is the live plan or a reference | orchestrator | Sat 11:30 | open; fallback = Quick Spec from the design doc |
| Q15 | Do the event's judges watch a live pitch, or only review the SundAI card + repo? | Where to spend the last hour | TC (host) | Sat 10:00 | open |
| Q12 | When will the Feb 1 2027 rates be published? | Scoring the pre-registered forecast | anyone | Jan 2027 | open |
