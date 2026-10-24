# FairWatt backend-stats — frontend contract

This document is the contract for the three committed JSON artifacts the Python backend-stats
module produces under `data/build/`. A separate frontend reads these files straight from the repo.
Everything here matches the emitted JSON key-for-key; regenerate with:

```
python3 src/backend/build_stats.py && python3 src/backend/build_savings.py && python3 src/backend/build_map.py
```

All dollars are the **supply portion only** (per `docs/specs/calculator.md`): any energy charge
shown is the competitive-supply / basic-service kWh cost, not the full delivered bill. Any kWh not
typed by a user is an estimate "for a home like yours", never a measured reading. No number here is
invented — every constant traces to `data/snapshot/*` or `.kiro/steering/ground-truth.md`
(agent-rules #1/#11).

---

## 1. `data/build/consumption_stats.json` — energy consumption statistics

Two populations are kept strictly separate (never averaged together): RECS 2020 ("a home like
yours") and EIA-861M (the statewide typical account).

```json
{
  "generated": "2026-10-24",
  "sources": ["S14 RECS 2020 (552 MA homes)", "S15 EIA-861M (200 months)"],
  "homeLikeYours": {
    "population": "RECS 2020 MA, NWEIGHT-weighted",
    "annualKwh": {
      "mean": 7237.0, "p10": 2397.76, "p50": 5990.09, "p90": 13033.37,
      "n": 552, "unweightedMean": 7867.88, "unweightedMedian": 6649.19
    },
    "monthlyKwh": [ { "month": 1, "p10": 0.0, "p50": 0.0, "p90": 0.0 }, "... 12 entries" ],
    "bySqftBucket": {
      "<1000":     { "p10": 0.0, "p50": 4074.48,  "p90": 0.0 },
      "1000-1999": { "p10": 0.0, "p50": 5974.42,  "p90": 0.0 },
      "2000-2999": { "p10": 0.0, "p50": 7270.11,  "p90": 0.0 },
      "3000+":     { "p10": 0.0, "p50": 10596.99, "p90": 0.0 }
    },
    "byHeatFuel": {
      "gas":         { "p10": 0.0, "p50": 5615.84, "p90": 0.0 },
      "oil":         { "p10": 0.0, "p50": 8147.98, "p90": 0.0 },
      "electricity": { "p10": 0.0, "p50": 6091.63, "p90": 0.0 },
      "propane":     { "p10": 0.0, "p50": 7255.35, "p90": 0.0 },
      "wood":        { "p10": 0.0, "p50": 7270.11, "p90": 0.0 }
    }
  },
  "typicalAccount": {
    "population": "EIA-861M MA residential, calendar 2025 (sales/account)",
    "annualKwh": 7135,
    "monthlyKwh": [687, 652, 566, 527, 483, 554, 791, 710, 542, 497, 459, 667],
    "note": "all residential accounts incl. apartments/seasonal; shown alongside RECS, never mixed"
  },
  "seasonalShares": [0.0940, 0.0867, 0.0802, 0.0716, 0.0685, 0.0783,
                     0.1044, 0.1044, 0.0851, 0.0708, 0.0701, 0.0857],
  "seasonalSharesSum": 1.0
}
```

Notes:
- `annualKwh` percentiles (`p10`/`p50`/`p90`) and all bucket/fuel medians are **NWEIGHT-weighted**.
  `unweightedMedian` 6649.19 and `unweightedMean` 7867.88 are cross-checks against ground truth.
- `monthlyKwh` is 12 entries `{month, p10, p50, p90}` where each band = the annual band × that
  month's seasonal share, so `p10 <= p50 <= p90` holds month by month.
- `seasonalShares` is stored full precision normalized to sum to exactly `1.0`
  (`seasonalSharesSum`); the 4-dp values shown above are the ground-truth anchor it is asserted
  against.
- `typicalAccount` is the EIA-861M statewide sales-per-account series for calendar 2025. It is a
  comparison line only — never blended into the RECS "home like yours" estimate.

## 2. `data/build/savings_model.json` — "money you could have saved" vs basic service

Counterfactual, supply portion only. Given a household's actual monthly kWh and the competitive
supply rate they actually paid (¢/kWh), it compares against what basic service would have cost.

```json
{
  "generated": "2026-10-24",
  "method": "supply-portion-only; saved = (basicService - userRate) * kWh / 100; + = saved, - = overpaid",
  "defaultPeriodMonths": 6,
  "basicServiceRatesCents": {
    "NG": 17.185, "EV_EAST": 17.323, "EV_WEST": 15.934, "UNITIL": 18.921,
    "term": "2026-08..2027-01"
  },
  "examples": [
    {
      "label": "6 months on NG, paid 22.0c vs basic 17.185c, 650 kWh/mo",
      "utility": "NG",
      "userRateCents": 22.0,
      "months": ["2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01"],
      "kwhByMonth": [650.0, 650.0, 650.0, 650.0, 650.0, 650.0],
      "basicServiceCentsByMonth": [17.185, 17.185, 17.185, 17.185, 17.185, 17.185],
      "savedMonthly": [-31.2975, -31.2975, -31.2975, -31.2975, -31.2975, -31.2975],
      "savedMonthlyDisplay": ["-$31.30", "-$31.30", "-$31.30", "-$31.30", "-$31.30", "-$31.30"],
      "savedTotal": -187.785,
      "savedTotalDisplay": "-$187.79"
    }
  ]
}
```

### Sign convention (important)

```
userMonthly[m]    = userRateCents     * kWh[m] / 100     # what the user paid (supply only)
defaultMonthly[m] = basicServiceCents * kWh[m] / 100     # what basic service would have cost
savedMonthly[m]   = defaultMonthly[m] - userMonthly[m]   # + = SAVED, - = overpaid (signed)
savedTotal        = sum(savedMonthly)
```

- **Positive** `savedMonthly`/`savedTotal` = the user paid **less** than basic service (came out
  ahead). **Negative** = they **overpaid**.
- This is `(basicService - userRate) * kWh / 100` — i.e. calculator.md's
  `diffMonthly = (userRate - basicService) * kWh / 100` with the sign **flipped**, because the
  deliverable is framed as "money you could have saved" (basic-service minus actual).
- Internal math is **unrounded** (`savedTotal` is the exact float). `*Display` strings are half-up
  to cents and match calculator.md's regex `^-?\$\d{1,3}(,\d{3})*\.\d{2}$`. A positive amount
  prints with no leading `+` (e.g. `$13.11`).
- `basicServiceRatesCents` are the fixed basic-service rates for the default forward window
  Aug 2026 – Jan 2027, read from `data/snapshot/fixed_residential_cents_2026-07-02.csv`
  (column→utility: NG→NG, NSTAR→EV_EAST, WMECo→EV_WEST, Unitil→UNITIL). The reusable function is
  `savings(kwh_by_month, user_rate_cents, utility, start_ym, months=6)` in
  `src/backend/savings_model.py`; `examples` bakes worked contract samples into the artifact (one
  overpaid case, one positive-savings case).

## 3. `data/build/map_consumption.json` — per-town map + traffic-light

```json
{
  "generated": "2026-10-24",
  "basis": "statewide-model",
  "modeled": true,
  "note": "No verified per-town consumption source exists; level is the statewide RECS weighted model. Classes reflect state distribution bands, not measured town differences.",
  "thresholds": {
    "unit": "annual kWh",
    "greenMax": 4814.67,
    "greyMax": 7966.61,
    "rule": "GREEN <= P33 < GREY <= P66 < RED (weighted terciles of RECS MA annual kWh)"
  },
  "towns": [
    { "townId": 1, "name": null, "census": null, "annualKwhModel": 5990.09, "class": "GREY" }
  ]
}
```

### Modeled-town honesty caveat (read this before coloring a map)

There is **no verified per-town consumption source** in the repo: RECS 2020 has no town field,
EIA-861M is statewide, and `docs/apis/06-map-layer-candidate-sources.md` lists every town layer as
UNVERIFIED. `docs/specs/map.md` says "never color by a number we don't have." So:

- Every record is flagged `modeled: true` and `basis: "statewide-model"`. The per-town
  `annualKwhModel` is the **statewide NWEIGHT-weighted RECS median** (`5990.09` kWh) — the **same
  value for every town**. Do not present it as a measured town reading.
- Because the level is identical across towns, a choropleth of the raw level is flat. The
  traffic-light classes reflect **state distribution bands**, not between-town differences.

### Traffic-light rule (weighted terciles of the RECS MA annual-kWh distribution)

- **GREEN** (good / low): `annualKwh <= greenMax` (weighted P33 = **4814.67** kWh)
- **GREY** (mid): `greenMax < annualKwh <= greyMax` (weighted P33..P66, 4814.67 .. **7966.61** kWh)
- **RED** (too much): `annualKwh > greyMax` (above weighted P66 = 7966.61 kWh)

Boundary values are inclusive on the upper bound: exactly P33 → GREEN, exactly P66 → GREY. The
cut values live in `thresholds` so the frontend, backend, and tests share one source of truth. At
the current modeled level 5990.09 every town classifies **GREY**.

### Joining to geometry

The artifact is self-contained: 351 records keyed by `townId`, designed to **join on `id`** in a
frontend `towns.json` (`contracts/towns.schema.json`, ids 1..351). When `data/build/towns.json`
exists at build time the builder reads real `id`/`name`/`census`; in the sandbox that file is not
built (it needs a network download), so ids 1..351 are emitted with `name`/`census` = `null`. The
frontend supplies the geometry and labels via the join.
