# Frontend contract (for TC's friend, who builds the web design)

**You build the UI; we deliver numbers.** Everything below is in the GitHub repo. Types: `contracts/types.ts` (v2.0.0). JSON Schemas: `contracts/*.schema.json`. You never compute a number yourself: read a field, or call a function.

## How to get the data
- Static JSON at `/data/<file>.json` (release copies `data/build/*.json` into `public/data/`). **Until the real files land (~13:00–15:30), schema-valid fixtures with the same names are in `public/data/`**, so you can build from 11:30.
- Load with `loadAll()` from `src/data/load.ts` (zod-validated, typed). On any error show "Couldn't load data" and no numbers.
- Interactive fields are pure TypeScript functions in `src/engine/` (instant, no network).

## Screen elements → source

| UI element | Source | Fields | Unit | Must show |
|---|---|---|---|---|
| **Region stats cards** (NEMA, SEMA, WCMA, MA) | `stats.json` → `areas[]` | `meanDailyGWh`, `annualGWh[]`, `peakDay`, `peakHourMW`, `yoyChangePct`, `loadFactor`, `weekendVsWeekdayPct` | GWh, MW, % | "All customers (homes + businesses), 2017–2023" |
| Seasonal profile chart | `stats.json` → `areas[].monthlyProfileGWh` | 12 values Jan..Dec | GWh/month | — |
| Weather sensitivity | `stats.json` → `areas[].temperature` | `gwhPerHDD`, `gwhPerCDD`, `r2` | GWh per degree-day | "Temperature explains R² of daily use" |
| "Cost of weather" | `stats.json` → `areas[].weatherCostGWh2023` | one number | GWh | "vs normal temperatures" |
| **Typical home** | `stats.json` → `household` | `typicalAnnualKwh`, `typicalMonthlyKwh`, `medianBySqft`, `medianByHeat`, `allInPrice` | kWh, ¢/kWh | "estimated" |
| **Money you could have saved** | `savedVsBasic({utility, userCents, months})` in `src/engine/household/` | `totalDollars`, `label`, `months[]` | $ | both directions: "could have saved" / "saved"; "supply portion" |
| **A home like yours** (inputs → 12 months) | `estimate(home, model)` + `estimate_model.json` | `UsageEstimate` | kWh | "estimated for a home like yours" until ≥ 3 typed months |
| **Next 6 bills (Monte Carlo)** | `simulateBills(...)` | `months[]` (p5…p95), `total`, `histogram` | $ | fan chart; Feb 1 reset marked; "supply portion" |
| **Region 6-month forecast (Monte Carlo)** | `mc_forecast.json` → `areas[]` | `months[]` quantiles, `total`, `samplePaths` (20), `sameMonthsLastObservedGWh` | GWh | `calibration.cov80` + `nMonths` as the honesty badge |
| **Regime light** 🟢⚪🔴 | `regimes.json` → `areas[]` (use `MA_RES` for "now": monthly to 2026-08; zones are daily to 2023-12-31) → `current` | `color`, `pctVsAverage`, `bandPct`, `date` | % | "red = above the historical average range (average ± 1 sd of the same period in the previous 5 years)"; show the date |
| Regime history chart | `regimes.json` → `areas[].timeline` | `date`, `color`, `pctVsAverage`, `bandPct` (draw ±bandPct as the grey range band) | % | "colours use only data available at the time" |
| Regime outlook | `regimes.json` → `areas[].outlook` | `days`, `probs` | probability | — |
| **Map** (351 towns) | `towns.json` (SVG paths, join `id`) + `towns_metrics.json` (join `townId`) | `modeledAnnualMWh`, `perCapitaKwh`, `regimeColor`, `zone` | MWh, kWh | "**Modeled** from population and regional load; zone boundaries approximate" |
| **City forecast** (any town) | `towns_metrics.json` → `towns[].forecast6mMWh`, `changeVsLastYearPct` | quantiles | MWh | "Modeled" |

## Colors
`RegimeColor` is a string: `"green"` = good (below the historical average range), `"grey"` = within the range, `"red"` = too much (above the range). Pick your own hex values; keep the meaning and **always add the text label**: green vs red measured ΔE 4.1 for red-green colour blindness (floor 8), so colour alone fails.

## Rules for the UI (they are judged and verified)
1. No hard-coded numbers; every number comes from a field above.
2. Show the honesty labels in the "Must show" column.
3. No runtime calls to outside services.
4. Commit only `app/**`, `src/ui/**`, `public/**` (not `public/data/**`), `tests/ui/**`, with subjects starting `friend:` (or `ui-builder:` if your Kiro agent commits).
5. Need a field that isn't here? Ask TC (the orchestrator): contracts change only through him.
