# Verified data snapshot

| File | What |
|---|---|
| `monthly_residential_cents_2026-07-02.csv` | Residential basic-service monthly (variable-option) prices, ¢/kWh, 2005-01 … 2027-01, newest first |
| `fixed_residential_cents_2026-07-02.csv` | Residential fixed-option prices, ¢/kWh, on each term's **last** month |

**Source:** Mass.gov "Basic Service Rates 7.2.2026" (S1), the residential columns D–G of the sheets `Monthly Prices` and `Fixed Prices`.
**Chain of custody:**
1. Oct 22 2026: the file was fetched inside a mass.gov browser tab and parsed in-page (`reference/browser_extract_xlsx.js`), producing the reference checksums.
2. Oct 23 2026: transcribed to these CSVs.
3. Verified:
   - `reference/verify_snapshot.py`: exact rows, per-column counts and sums, plus 8 anchor values (7 exact matches to outside sources, 1 approximate).
   - `reference/test_ingest.py`: a replica workbook built from these CSVs round-trips byte-identically through the parser.

**Known limitation:** count and sum checks can't detect two values swapped between rows of the same column.

**Units:** ¢/kWh (17.185 = $0.17185/kWh). **Blank cell** = no value (NSTAR before 2007; or no term ending that month).
**Use:** public government data. Cite "Massachusetts DPU/Mass.gov basic service rates" with the retrieval date.

---

## Usage snapshot (added Oct 23 2026; G-DATA-3 PASS)

| File | What |
|---|---|
| `recs_ma_2020.csv` | The 552 Massachusetts households in EIA's 2020 Residential Energy Consumption Survey (S14), 12 columns: `DOEID, KWH, DOLLAREL, TOTSQFT_EN, YEARMADERANGE, FUELHEAT, EQUIPM, TYPEHUQ, NHSLDMEM, HDD65, CDD65, NWEIGHT`. Values copied as the source writes them |
| `eia_ma_monthly_2026-08.csv` | Massachusetts residential electricity, monthly 2010-01 … 2026-08 (S15, EIA-861M), ascending: `year, month, status, revenue_kusd, sales_mwh, customers, price_cents, kwh_per_customer` (last column computed, 3 dp). 2026-01 … 2026-08 are *Preliminary* |

**Chain of custody:**
1. Oct 23 2026: downloaded `recs2020_public_v7.csv` (sha256 `8d5f6d31…3b3592`) and `sales_revenue.xlsx` (sha256 `c7963ad7…4c4044e`) from eia.gov.
2. Extracted with `reference/ingest_usage.py`; two runs byte-identical; snapshot mode round-trips byte-identically.
3. Verified with `reference/verify_usage.py`: row counts, column sums, category counts, anchors, and re-derivation of every usage number in `.kiro/steering/ground-truth.md`. A one-cent change to one value fails the gate.

**Known limitations:** RECS is a 2020 survey (COVID year) of 552 homes, so the estimate's band is wide (fit R² 0.34). EIA customer counts jump ±3–10% month to month; use sales for seasonal shape. EIA revises *Preliminary* months, so a fresh download will change the EIA checksums.
**Use:** public U.S. government data. Cite "U.S. EIA, RECS 2020" and "U.S. EIA, Form EIA-861M" with the retrieval date.
