# 09 · ISO New England zonal load (S17): real regional demand + temperature, 2017–2023

**Status:** downloaded, aggregated and frozen Oct 24 2026 (G-DATA-4 PASS). Default path on build day: the snapshot.

- Files: `https://www.iso-ne.com/static-assets/documents/<YYYY>/02/<YYYY>_smd_hourly.xlsx` for 2017–2023 (≈ 7.7 MB each). 2016 and earlier, 2024 and 2025 did **not** resolve at this pattern on Oct 24 (other upload months tried: 01–08 of the same and next year).
- Sheets: `NEMA` (Northeast MA incl. Boston), `SEMA` (Southeast MA), `WCMA` (West/Central MA), plus the other New England zones and `ISO NE CA`. Columns: `Date, Hr_End, DA_Demand, RT_Demand, DA_LMP, …, Dry_Bulb, Dew_Point`. 24 rows per day in every file (no 23/25-hour days).
- **What RT_Demand is:** wholesale settlement load in MW for **all customer classes** (residential, commercial, industrial), net of behind-the-meter generation. It is regional grid consumption, not a household bill.
- Daily snapshot `data/snapshot/isone_ma_daily_2017-2023.csv`: 7,668 rows = 2,556 days × 3 zones; columns `date, zone, rt_mwh, da_mwh, peak_mw, temp_f, dewpoint_f, hours`.
- Facts used by the models (re-derived by G-DATA-4): mean daily load NEMA 64.453 GWh, SEMA 38.001, WCMA 43.783; temperature (HDD/CDD at 65 °F, squared terms) + weekend explain **R² 0.840 / 0.874 / 0.800**; the residual's lag-1 autocorrelation is **0.593 / 0.533 / 0.608**, so weather-adjusted consumption persists from day to day (the basis for the HMM).

```bash
python3 reference/ingest_isone.py data/raw/isone data/build/isone_ma_daily.csv        # raw path (7 xlsx in data/raw/isone/)
python3 reference/ingest_isone.py --from-snapshot data/snapshot/isone_ma_daily_2017-2023.csv data/build/isone_ma_daily.csv
python3 reference/verify_isone.py data/build/isone_ma_daily.csv                          # G-DATA-4
```
