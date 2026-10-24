# 08 · EIA usage data: RECS 2020 (S14) and EIA-861M (S15)

**Status:** downloaded, inspected and frozen Oct 23 2026 (G-DATA-3 PASS). The snapshot in `data/snapshot/` is the default path on build day; a fresh download is only needed if the orchestrator decides to refresh the EIA months.

## 1. RECS 2020 public microdata (S14)
- Page: https://www.eia.gov/consumption/residential/data/2020/index.php?view=microdata
- File: `https://www.eia.gov/consumption/residential/data/2020/csv/recs2020_public_v7.csv` (56 MB, 18,496 rows, 799 columns). Codebook: `.../2020/xls/RECS%202020%20Codebook%20for%20Public%20File%20-%20v7.xlsx` (the page's `public_layout.csv` link returned HTML, not CSV, on Oct 23; use the codebook).
- Filter `state_postal == "MA"` → 552 rows. Columns and codes: ground-truth.md.
- Weights: `NWEIGHT` (households represented). Use it for medians and the regression. Replicate weights `NWEIGHT1..60` exist for proper standard errors; out of scope today.
- Caveats: 2020 (COVID) consumption; `KWH` is partly modeled (EIA end-use model) and includes self-generated solar.

## 2. EIA-861M sales and revenue (S15)
- Page: https://www.eia.gov/electricity/data/eia861m/
- File: `https://www.eia.gov/electricity/data/eia861m/xls/sales_revenue.xlsx` (2.3 MB). Sheet `Monthly-States`; header rows 1–3; data from row 4, newest first.
- Columns: A Year, B Month, C State, D Data Status, E–H Residential (Revenue $k, Sales MWh, Customers, Price ¢/kWh), then Commercial, Industrial, …
- MA residential: 200 months 2010-01 … 2026-08; 2026 months are *Preliminary* and get revised.
- Caveat: customer counts swing ±3–10% month to month (billing artifacts). Shapes from sales; per-customer values with a 12-month mean of customers.

## 3. Commands
```bash
python3 reference/ingest_usage.py data/raw/recs2020_public_v7.csv data/raw/sales_revenue.xlsx data/build/   # raw path
python3 reference/ingest_usage.py --from-snapshot data/snapshot/recs_ma_2020.csv data/snapshot/eia_ma_monthly_2026-08.csv data/build/
python3 reference/verify_usage.py data/build/recs_ma.csv data/build/eia_ma_monthly.csv    # G-DATA-3
```

## 4. If you refresh the EIA file
Newer months appear and Preliminary months may be revised, so G-DATA-3's EIA checksums will change. Steps: (1) confirm 2010-01 … 2025-12 *Final* rows are unchanged against the snapshot (diff); (2) send the new checksums to the orchestrator as a REQUEST; only the orchestrator edits `reference/verify_usage.py`. Don't refresh on event day unless the orchestrator asks: the snapshot is enough.

## 5. Not used (tried Oct 23)
- Green Button sample files: the Green Button Alliance S3 links return 403; energy.gov's NSTAR monthly sample page is 404.
- MassGIS assessor parcels (year built, living area by address): mass.gov returns 403 to scripts; statewide data is a geodatabase. Production path only.
