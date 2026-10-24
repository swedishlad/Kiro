# 10 · Census town population (S18) and the town table

**Status:** downloaded, joined and frozen Oct 24 2026 (G-DATA-5 PASS).

- File: `https://www2.census.gov/programs-surveys/popest/datasets/2020-2024/cities/totals/sub-est2024_25.csv` (53 KB, **no API key**). Rows with `SUMLEV == "061"` are the 351 Massachusetts towns; key = `"25" + COUNTY + COUSUB`; columns `POPESTIMATE2020 … POPESTIMATE2024`.
- The Census **API** (api.census.gov) redirects to `missing_key.html` without a key, so ACS tables (heating fuel, housing type by town) need a free key from api.census.gov/data/key_signup.html. Optional, for a richer city model.
- Join to the boundaries (S6) by GEOID: 344 match directly; **7 towns** changed Census codes when they became cities (North Attleborough, Amesbury, Methuen, Greenfield, Amherst, Easthampton, Watertown) and are crosswalked by county + name.
- Snapshot `data/snapshot/ma_towns_2024.csv`: `town_id, geoid, census_geoid, name, county_fips, county, zone_approx, pop2020, pop2024`. Total 2024 population 7,136,171; Boston 673,458.
- **`zone_approx` is an approximation by county**, not an ISO-NE town list: SEMA = Barnstable, Bristol, Dukes, Nantucket, Norfolk, Plymouth; NEMA = Essex, Middlesex, Suffolk; WCMA = Berkshire, Franklin, Hampden, Hampshire, Worcester. Middlesex and Norfolk straddle zones; this split gives the most consistent consumption per person across zones (max/min 1.44). Anything built on it is **modeled**.

```bash
python3 reference/build_towns.py data/raw/mass-municipalities.geojson data/raw/sub-est2024_25.csv data/build/ma_towns.csv
python3 reference/build_towns.py --from-snapshot data/snapshot/ma_towns_2024.csv data/build/ma_towns.csv
python3 reference/verify_towns.py data/build/ma_towns.csv                                  # G-DATA-5
```
