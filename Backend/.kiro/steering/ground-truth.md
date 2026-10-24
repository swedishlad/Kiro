---
inclusion: always
---
# Ground truth (the only numbers you may state without computing them)

[V] = verified, with source ID (full ledger: `research/sources.md`). [U] = unverified: never present as fact.

## Rates [V]
| Fact | Value | Source |
|---|---|---|
| Basic-service fixed rates Aug 1 2026 – Jan 31 2027 | NG **17.185**, Eversource East **17.323**, Eversource West **15.934**, Unitil **18.921** ¢/kWh | S2, matches S1; NG also matches the utility tariff and Boston.com (Oct 23) |
| Prior term (Feb–Jul 2026) | NG 15.372, Eversource East 15.629, Eversource West 13.683, Unitil 16.247 | S1 (NG and East also in S3) |
| NG variable option | Jul 2026 15.546 → Aug 2026 16.074 | S1 + S3 |
| Reset dates | Basic service changes every 6 months; current term Aug 1–Jan 31, so the next reset is **Feb 1 2027** | S2 |
| History | Monthly prices 2005-01 … 2027-01 and fixed terms 2005 … 2027-01, 4 utilities | S1 → `data/snapshot/` |
| AG examples at 650 kWh/mo | $111.70 NG, $112.60 Ev East, $103.57 Ev West, $122.99 Unitil | S2 |

## Usage data [V, downloaded and inspected Oct 23]
| Fact | Value | Source |
|---|---|---|
| RECS 2020 public file | 18,496 households, 799 columns; **552 are Massachusetts** (`state_postal == "MA"`) | S14 |
| RECS fields we use | `KWH` annual kWh; `TOTSQFT_EN` sq ft (200–15000); `YEARMADERANGE` 1 = before 1950 … 9 = 2016–2020; `FUELHEAT` 5 electricity, 1 gas, 2 propane, 3 oil, 7 wood, 99 other, −2 n/a; `TYPEHUQ` 1 mobile, 2 SF detached, 3 SF attached, 4 apt 2–4 units, 5 apt 5+; `NWEIGHT` weight | S14 codebook |
| MA annual kWh, unweighted | median **6,649**, mean **7,868** | S14 |
| MA weighted median by sq ft | < 1,000: 4,074 · 1,000–1,999: 5,974 · 2,000–2,999: 7,270 · ≥ 3,000: 10,597 | S14 (re-derived by G-DATA-3) |
| MA weighted median by heating fuel | gas 5,616 (n=288) · oil 8,148 (149) · electricity 6,092 (84) · propane 7,255 (17) · wood 7,270 (12). **Electric heat does not dominate in MA**; let the fit decide | S14 |
| Fit `log KWH ~ 1 + log sqft + elec-heat + apartment`, MA, weighted | coefficients 5.302 / 0.469 / +0.420 / −0.326; weighted R² **0.34**, n = 552. Real but modest: show a wide band | S14 |
| EIA-861M MA residential | 200 months, 2010-01 … 2026-08 (Aug 2026 *Preliminary*); sales (MWh), customers, all-in price | S15 |
| MA kWh per residential customer, mean by calendar month 2010–2026 | Jan 694 · Feb 635 · Mar 588 · Apr 514 · May 489 · Jun 568 · Jul 746 · Aug 740 · Sep 621 · Oct 507 · Nov 513 · Dec 623. **Peak/trough 1.53; summer (Jul–Aug) peaks as high as January**, so never hard-code "winter" | S15 |
| **Seasonal shape to use** (share of a year's kWh by calendar month, from total MA residential sales, mean 2019–2025) | Jan .0940 · Feb .0867 · Mar .0802 · Apr .0716 · May .0685 · Jun .0783 · Jul .1044 · Aug .1044 · Sep .0851 · Oct .0708 · Nov .0701 · Dec .0857 | S15 (re-derived by G-DATA-3) |
| **Customer counts are noisy** | 26 of 200 months jump > 2% month-to-month, Final months included (max +10.3%, Dec 2025): billing artifacts. Compute shapes from **sales**, and kWh per customer with a **12-month mean** of customers | S15, computed |
| Typical MA residential account, calendar 2025 (sales ÷ 12-month mean customers) | 7,135 kWh/yr; by month 687 · 652 · 566 · 527 · 483 · 554 · 791 · 710 · 542 · 497 · 459 · 667 | S15, computed |
| Seasonal-naive skill | predicting a month by the same month last year: MAPE **6.0%**; by last month: **12.8%**; on total sales, same-month-last-year **5.9%** | S15, computed |
| All-in MA residential price | 30.48 ¢/kWh, Aug 2026 (Preliminary); 2,921,850 customers | S15 |

## Regional load, towns, level [V, downloaded and inspected Oct 24]
| Fact | Value | Source |
|---|---|---|
| ISO-NE hourly load, MA zones | NEMA (Northeast MA incl. Boston), SEMA (Southeast MA), WCMA (West/Central MA); 2017-01-01 … 2023-12-31, 2,556 days, 24 h every day; **all customer classes**, net of behind-the-meter generation; files for 2024+ not found | S17 → `data/snapshot/isone_ma_daily_2017-2023.csv` (G-DATA-4) |
| Mean daily load 2017–2023 | NEMA **64.453** GWh · SEMA **38.001** · WCMA **43.783** | S17 (re-derived by G-DATA-4) |
| Temperature + weekend explain daily load | R² NEMA **0.840** · SEMA **0.874** · WCMA **0.800** (HDD/CDD at 65 °F + squares + weekend) | S17, computed |
| Weather-adjusted load persists | residual lag-1 autocorrelation NEMA **0.593** · SEMA **0.533** · WCMA **0.608** → regimes are plausible | S17, computed |
| Cross-check | ISO-NE 2023 MA load 51,839 GWh vs EIA all-sector retail 2023 50,012 GWh (3.7% apart: losses, settlement basis) | S17, S15 |
| **Level gap 2023 → 2026** | EIA MA all-sector sales, 12 months to Aug 2026 ÷ calendar 2023 = **1.0435** (residential alone 1.0975: don't use it for all-sector load) | S15 `eia_ma_total_monthly_2026-08.csv` (G-DATA-3) |
| Towns | 351; population 2024 **7,136,171** (Boston 673,458); 7 towns crosswalked (city-status code changes) | S18 + S6 → `data/snapshot/ma_towns_2024.csv` (G-DATA-5) |
| Town → zone | **approximation by county** (Middlesex→NEMA, Norfolk→SEMA; others unambiguous); zone population 2024 NEMA 3,286,038 · SEMA 2,139,738 · WCMA 1,710,395 | S18, computed; [U] as a geography |
| **Town-level metered consumption** | **Not public** (DOER publishes by utility, not town). Every town number is **modeled** | search Oct 24 |

## Event facts [V, read from the event page's JS bundle on Oct 23]
- Tracks: Biotech & healthcare · Robotics & hardware · **Energy & climate tech** · Civic action.
- Vibe-coded projects **must use Kiro**. 2,000 free Kiro credits per person via a physical code picked up at your campus. Team up to 4 (solo OK). MA-enrolled students, .edu email, ID checked.
- Day: check-in 8–9 · challenges & rules 9:40–10:00 · Kiro how-to 10:00–10:30 · brainstorm/team formation 10:40–11:30 · **hacking begins 11:30** · lunch 12–1 · dinner 5 · submission window 6–8 PM · **deadline 8 PM sharp** · judging 8–11 PM · finalists notified at midnight.
- Submit on SundAI with the correct GitHub repository; pushing to GitHub alone does not count.
- **Judging (told by TC on Oct 24 ~9:45, not on the event page [U]): how well and how efficiently the team uses Kiro is one of the most important criteria.** The page still publishes no rubric. Treat Kiro use as scored: steering, specs, hooks and sub-agents must be visible in the repo and in the submission (`docs/KIRO.md`, gate G-KIRO).
- Kiro facts [V from kiro.dev docs, Oct 24]: workspace must be **trusted** or custom agents, steering and skills are not loaded; Autopilot (default) vs Supervised (pauses after each file-editing turn); credits are consumed by prompts, spec refinement, task execution and hook runs (Auto model costs fewer credits than a named model); PreToolUse hooks can block, file hooks fire only for the agent's own edits.

## Problem [V, with a caveat]
- AG (Summer 2026 newsletter, S2; wording re-checked verbatim on Oct 23): residential competitive-supply customers paid **over $738.7M** more than basic service "since 2018"; **$87.4M** net loss Jul 2024–Jun 2025; average annual loss **$286** for low-income vs **$181** for others; **$9.6M** added to bill-assistance costs.
  - The newsletter's exact words: "since 2018, residential customers who switched to Competitive Supply paid over $738.7 million more". Use that wording. An earlier note of ours said "over the decade", which was wrong.
- Customer mix (S3, state data, Mar 2026): about **26.6%** basic service, **~51%** municipal aggregation, **~22%** competitive supply.
- S2: "almost 70%" of MA municipalities have an aggregation program.

## Rate-forecast evidence [V, computed Oct 23 from S1]
- H1: across 140 terms (2010+), fixed rate ÷ mean of that term's monthly prices − 1 has median **+0.92%**, and **86%** fall within ±3%.
- Typical reset size (mean absolute simple % change term-to-term, 2010+): NG 27.4%, NSTAR 16.4%, WMECo 15.8%, Unitil 18.6%.

## Unverified [U]: do not state as fact
- Town → utility mapping; the list of municipal-light-plant towns; town aggregation status and rates.
- Exact publication date of the Feb 1 2027 rates.
- Legislative outcome for H.5175 / S.3166 after Aug 4 2026 (S4 says conference committee as of Aug 4).
- AG consumer phone number (conflicting numbers seen). The DPU consumer line also needs re-checking.
- **The exact judging rubric** (not published; "ask your campus host") and whether **pre-built code, data or plans** are allowed (Gate 0).
- The RECS estimate is a **2020 survey** (a COVID year, more time at home); the EIA series is all residential accounts, apartments and seasonal homes included. They are different populations: show both, never mix them in one computation.
- How Energy Switch MA (state comparison site) differs from us.
- Green Button file formats from Massachusetts utilities (sample files were unreachable Oct 23).
- The exact ISO-NE load-zone membership of each town (we approximate by county).
- Load growth after 2023 beyond the EIA all-sector ratio (heat pumps, EVs, solar change the shape, not only the level).
