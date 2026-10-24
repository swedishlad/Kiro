---
inclusion: always
---
# Product: FairWatt (backend engine for Massachusetts energy)

**Team split (Oct 24, 10:30):** we build the **backend calculation fields only**. TC's friend builds the web design in their own Kiro session and reads our outputs from the GitHub repo. Contract: `docs/FRONTEND_CONTRACT.md`. Design rationale: `docs/superpowers/specs/2026-10-23-fairwatt-home-design.md` (household parts) + this file.

**Event:** Hackachusetts powered by Kiro, **Energy & climate tech**. Hacking begins **11:30**; submit on SundAI with the GitHub repo by **20:00 sharp**. **Built in Kiro** (required). Kiro use is judged (`docs/KIRO.md`, gate G-KIRO).

## Deliverables (each is a JSON file in `data/build/` or a TypeScript function in `src/engine/`)
| ID | What the UI shows | Output | Data | Real or modeled |
|---|---|---|---|---|
| **D1** | Energy consumption stats (regions + a typical home) | `stats.json` | ISO-NE zonal load 2017–2023 (S17), EIA (S15), RECS (S14) | Real |
| **D2** | Money you could have saved vs the **basic service rate** (both directions) | `savedVsBasic()` (TS) + examples in `stats.json` | Rate history 2005–2027 (S1) | Real rates; usage estimated unless typed |
| **D3** | 6-month **Monte Carlo** consumption and bill forecast (Nov 2026 – Apr 2027, across the Feb 1 reset) | `mc_forecast.json` (regions) + `simulateBills()` (TS, one home) | S17 + S15 level + rate forecast | Real history; forecast is a simulation |
| **D4** | **HMM regime**: 🟢 green = good, ⚪ grey = mid, 🔴 red = too much consumption | `regimes.json` | S17, **weather-adjusted** daily load | Real; filtered (no look-ahead) |
| **D5** | Energy consumption **map** data (351 towns + 3 zones) | `towns_metrics.json` + `towns.json` (paths) | S6 + S18 + S17 | **Modeled** (population share of zone) |
| **D6** | **Whole-Massachusetts city forecast** (all 351 towns, 6 months) | `towns_metrics.json` → `forecast6m` | D3 allocated by D5 | **Modeled** |

Already specified and kept for the household fields: estimator (`docs/specs/estimator.md`), rate forecast (`docs/specs/forecast.md`), calculator (`docs/specs/calculator.md`).

## Decisions (TC, Oct 24)
- **Q1 language:** Python (numpy) for heavy, precomputed stats (MC, HMM, all towns) → committed JSON. TypeScript only for fields that react to a user's input instantly (one home's estimate, savings, bills).
- **Q2 delivery:** the GitHub repo. JSON in `data/build/` (copied to `public/data/`), functions in `src/engine/`. No server.
- **Q3 HMM:** 3 states named green / grey / red. They classify consumption **after removing what weather explains** (otherwise every winter is "red").
- **Q4 savings baseline:** the basic service rate.
- **Q5 MC horizon:** 6 months.

## Non-goals
Building the web UI (the friend does); a live server; fetching anyone's bills; town-level metered data (none is public); carbon figures.

## Honesty rules (the UI copy must carry them; we supply the strings)
- "**Modeled**" on every town number (D5, D6); "**estimated for a home like yours**" on household usage until the user types their kWh; "**supply portion**" on dollars.
- Regional load is **all customer classes** (homes + businesses), not a household bill.
- Regime colors describe consumption **relative to what the weather explains**; history is shown with filtered (real-time) states, never re-fitted hindsight.
- Every forecast states its backtest coverage and `n`. Never "accurate".
