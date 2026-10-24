# 01 · Mass.gov basic-service rate workbook (source S1)

**Used by:** data-ingest (owner), forecaster, calc-engine (via `rates.json`)
**Type:** static XLSX download. No API, no key, no rate limit known. Public government data.
**Status:** [V] inspected and parsed Oct 22 2026. A verified residential snapshot ships in `data/snapshot/`.

## 1. Where it is

| Item | Value |
|---|---|
| Landing page | https://www.mass.gov/info-details/basic-service-information-and-rates (page "last updated July 6, 2026") |
| File label on page | "Basic Service Rates 7.2.2026", XLSX, 256.11 KB |
| Direct download | `https://www.mass.gov/doc/basic-service-rates-722026/download` |
| Bytes served (Oct 22) | 262,258; `content-type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` |
| Publisher statement | The page says historic basic-service rates are in that spreadsheet. The *rates and tariffs* page (S5) says historic tariffs not on utility sites can be requested from the DPU by public records request |

**The file name changes when Mass.gov posts a new version** (expect one around the Feb 1 2027 reset; the timing is [U]). Find it from the landing page each time; never hardcode the old slug in product code.

## 2. How to get it (in order of preference)

1. **Human download (2 min).** Open the landing page, click the XLSX, save as `data/raw/basic_service_rates_2026-07-02.xlsx`, then run:
   ```bash
   pip install openpyxl==3.1.5
   python3 reference/ingest_rates.py data/raw/basic_service_rates_2026-07-02.xlsx data/build/
   # or without any XLSX:  python3 reference/ingest_rates.py --from-snapshot data/snapshot/monthly_residential_cents_2026-07-02.csv data/snapshot/fixed_residential_cents_2026-07-02.csv data/build/
   python3 reference/verify_snapshot.py data/build/monthly_residential_cents.csv data/build/fixed_residential_cents.csv
   ```
2. **Use the shipped snapshot.** `data/snapshot/*.csv` already passes G-DATA-1. Choose this if the live file is unchanged; check that by comparing the landing page's file label to "7.2.2026".
3. **In-browser extraction.** Run `reference/browser_extract_xlsx.js` in a mass.gov tab. Read its header for the procedure.
4. **Will NOT work:**
   - Sandbox shells: `mass.gov` got a proxy `CONNECT 403` on Oct 22.
   - Generic web-fetch tools: they return `[binary data]` for XLSX.

## 3. Workbook anatomy [V]

Seven sheets: `Overview`, `National Grid`, `NStar - Eversource`, `WMECo - Eversource`, `Unitil`, `Monthly Prices`, `Fixed Prices`.

| Sheet | Dimension | Rows |
|---|---|---|
| Overview | A1:K29 | 28 |
| National Grid | A1:R279 | 279 |
| NStar - Eversource | A1:S255 | 255 |
| WMECo - Eversource | A1:R280 | 280 |
| Unitil | A1:V280 | 280 |
| Monthly Prices | A1:Z279 | 279 |
| Fixed Prices | A1:Z280 | 280 |

### `Monthly Prices` and `Fixed Prices` (same grid)

| Cell(s) | Meaning |
|---|---|
| Row 1 | Customer class groups: `Residential` (D), `Small C&I` (I), `Large C&I - NEMA` (N), `- SEMA` (Q), `- WCMA` (T) |
| Row 2 | Utility names under each group. Residential: D `National Grid`, E `NSTAR`, F `WMECo`, G `Unitil` |
| Row 4 onward | One row per month, **newest first**. The block for 2027 starts at row 4 with `Dec` |
| Column A | Year, **only on the first row (Dec) of each year block**. Carry it down |
| Column B | Month label: `Jan Feb Mar Apr May June July Aug Sept Oct Nov Dec` |
| D–G | Residential ¢/kWh (numbers; one stored as text `"9.257\r\n"` at Fixed 2015-Oct NG) |
| Col V (Unitil large C&I) | Text `market` / `n/a`, not residential; ignore |
| Col X/Y | Mirror month/year labels; ignore |

### Semantics that will bite you
- **Units are ¢/kWh.** Proof: the Fixed Prices row 2027-Jan = 17.185 / 17.323 / 15.934 / 18.921. That equals the AG's published Aug 1 2026–Jan 31 2027 rates of $0.17185 / $0.17323 / $0.15934 / $0.18921 (S2).
- **Fixed Prices: the value sits on the term's LAST month.** Term start = previous term end + 1 month, per utility.
- **Monthly Prices are filled through Jan 2027.** These are the variable-option prices for months inside the current term, published in advance (rows for Sep 2026–Jan 2027 existed in a file posted Jul 2026). Treat them as *known at term start*, not realized market prices. Two anchors match Boston.com (S3): Jul 2026 NG 15.546 and Aug 2026 NG 16.074.
- **The `Overview` sheet describes the OLD calendar** (Eversource Jan–Jun/Jul–Dec, NG Nov–Apr/May–Oct, Unitil Dec–May/Jun–Nov). Since 2024 all four utilities end their terms in Jan/Jul, with resets Feb 1 and Aug 1 (S2). Trust the data, not the Overview text.
- **NSTAR has no 2005–2006 values** (241 monthly values vs 265 for the others).
- **13 terms are not 6 months long.** The list is in `docs/specs/data-dictionary.md`. Several 1-month terms show large H1 deviations, so check them against the per-utility tabs before modeling.

## 4. Integrity gate G-DATA-1

```bash
python3 reference/verify_snapshot.py <monthly.csv> <fixed.csv>   # exit 0 = pass
```

It checks row counts, per-column non-null counts, Σround(v×1000) per column, and 8 anchor values (7 exact matches to S2/S3, plus NSTAR 2026-07 = 15.629, which S3 only gives as "15.6"). Reference numbers come from the Oct 22 in-browser parse:

| Sheet | Rows | Counts NG/NSTAR/WMECo/Unitil | Sums NG/NSTAR/WMECo/Unitil |
|---|---|---|---|
| Monthly Prices | 265 | 265 / 241 / 265 / 265 | 3087786 / 2836754 / 2799669 / 3044615 |
| Fixed Prices | 122 | 46 / 41 / 45 / 45 | 529720 / 489518 / 481230 / 527218 |

*(The script is the single source of truth for these numbers. If this table and the script disagree, the script wins and the table is a typo; report it.)*

Known limitation: count and sum checks cannot detect two values swapped between rows of the same column. The anchors and the H1 pre-check (outliers stand out) partly cover that.

## 5. Refresh procedure (when a new file appears)
1. Download the new file. Run `ingest_rates.py`. Checksums **will** differ, which is expected.
2. Diff the new CSV against the snapshot. **All overlapping history must be identical.** Only new rows may appear at the top.
3. Verify the newest fixed rate per utility against a second source: the AG newsletter, a utility press release, or a news article.
4. **The orchestrator** (sole owner of `reference/`) updates the expected numbers in `verify_snapshot.py` and logs it in `research/CHANGELOG.md`. data-ingest sends the new numbers as a REQUEST.
