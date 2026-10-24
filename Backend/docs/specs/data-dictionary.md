# Data dictionary

## data/snapshot/ (shipped, verified: G-DATA-1 PASS)

| File | Rows | Columns | Meaning |
|---|---|---|---|
| `monthly_residential_cents_2026-07-02.csv` | 265 (2005-01 … 2027-01, newest first) | `year, month, NG, NSTAR, WMECo, Unitil` | Residential basic-service **variable-option** price per month, ¢/kWh. Months in the current term are published in advance |
| `fixed_residential_cents_2026-07-02.csv` | 122 | `term_end_year, term_end_month, NG, NSTAR, WMECo, Unitil` | Residential **fixed-option** price, ¢/kWh, on the row of the term's **last month**. Blank = that utility has no term ending that month |

**Provenance:** Mass.gov "Basic Service Rates 7.2.2026" (S1), parsed in-browser Oct 22 2026 and transcribed to CSV on Oct 23. Verified by exact checksums + 8 anchors (`reference/verify_snapshot.py`) and byte-identical re-parse through `reference/ingest_rates.py` on a replica workbook.

**Column → UtilityId:** NG → `NG`, NSTAR → `EV_EAST`, WMECo → `EV_WEST`, Unitil → `UNITIL`.

## Irregular terms (not 6 months), from `ingest_rates.py`

| Utility | Start | End | Months | ¢/kWh | H1 deviation | Note |
|---|---|---|---|---|---|---|
| NG | 2009-11 | 2009-12 | 2 | 8.639 | — (pre-2010 cut) | verify in NG tab |
| NG | 2010-01 | 2010-04 | 4 | 8.828 | −3.00% | |
| NG | 2016-05 | 2016-09 | 5 | 8.042 | +0.21% | NG has ends at 2016-09 AND 2016-10 |
| NG | 2016-10 | 2016-10 | 1 | 8.084 | +1.48% | 1-month term |
| NG | 2023-11 | 2024-07 | 9 | 18.213 | +3.33% | transition to Feb/Aug calendar |
| EV_EAST | 2018-01 | 2018-01 | 1 | 12.881 | **−13.41%** | 1-month term, suspicious |
| EV_EAST | 2018-02 | 2018-06 | 5 | 12.888 | +4.94% | |
| EV_EAST | 2024-01 | 2024-07 | 7 | 17.216 | +4.15% | transition |
| EV_WEST | 2018-01 | 2018-01 | 1 | 10.486 | **−17.08%** | 1-month term, suspicious |
| EV_WEST | 2018-02 | 2018-06 | 5 | 10.503 | +6.49% | |
| EV_WEST | 2024-01 | 2024-07 | 7 | 15.81 | +2.65% | transition |
| UNITIL | 2022-12 | 2022-12 | 1 | 17.859 | **−14.02%** | 1-month term, suspicious |
| UNITIL | 2023-01 | 2023-07 | 7 | 21.429 | +5.94% | transition |

**Rule for the forecaster:** keep these terms in the data, but flag them. Report backtest metrics with and without terms whose length ≠ 6. Since 2024 every term is Feb–Jul or Aug–Jan, which is the regime the Feb 2027 target lives in.

## Usage snapshot (G-DATA-3 PASS; details and chain of custody in `data/snapshot/README.md`)

| File | Rows | Columns | Meaning |
|---|---|---|---|
| `recs_ma_2020.csv` | 552 | `DOEID, KWH, DOLLAREL, TOTSQFT_EN, YEARMADERANGE, FUELHEAT, EQUIPM, TYPEHUQ, NHSLDMEM, HDD65, CDD65, NWEIGHT` | One row per surveyed MA household, RECS 2020 (S14). Codes: ground-truth.md. `NWEIGHT` = households represented |
| `eia_ma_monthly_2026-08.csv` | 200 (2010-01 … 2026-08, ascending) | `year, month, status, revenue_kusd, sales_mwh, customers, price_cents, kwh_per_customer` | MA residential totals per month, EIA-861M (S15). `price_cents` is the all-in average (supply + delivery). Customer counts are noisy month to month: use `sales_mwh` for shapes |

## data/build/ (produced on build day)

| File | Producer | Contract | Size (expected) |
|---|---|---|---|
| `rates.json` | ingest_rates.py | `contracts/rates.schema.json` | 94 KB as written (indent=1); 66 KB minified |
| `towns.json` | build_geo.mjs | `contracts/towns.schema.json` | 108 KB raw / 37 KB gzip at 300 m |
| `layers/L1_utility.json`, `layers/L2_aggregation.json` | human (TC), optional | `MapLayerFile` in types.ts | small; only if G-LAYER passes |
| `forecast.json` | forecaster | `contracts/forecast.schema.json` | < 10 KB |
| `recs_ma.csv`, `eia_ma_monthly.csv` | ingest_usage.py (data-ingest) | G-DATA-3 | 33 KB / 11 KB |
| `estimate_model.json` | calc-engine (estimator fit) | `contracts/estimate_model.schema.json` | < 5 KB |
| `usage_forecast.json` | forecaster (K0/K1) | `contracts/usage_forecast.schema.json` | < 5 KB |
