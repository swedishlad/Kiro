# 02 · Massachusetts town boundaries: LMEC GitHub file (source S6)

**Used by:** geo-map (owner), ui-builder (via `towns.json`), the optional L1 human task (join key, `docs/ops/l1-human-task.md`)
**Type:** static file on GitHub (raw download). No key.
**Status:** [V] downloaded and inspected Oct 22 2026; build recipe tested Oct 23 2026.

## 1. Where it is

| Item | Value |
|---|---|
| Repo | https://github.com/nblmc/massachusetts-municipal-boundaries (Leventhal Map & Education Center "data cooking project"; author listed: Garrett Dash Nelson) |
| File | `data-cooked/mass-municipalities.geojson` |
| Raw URL | `https://raw.githubusercontent.com/nblmc/massachusetts-municipal-boundaries/main/data-cooked/mass-municipalities.geojson` |
| Size | 18,095,553 bytes (Oct 22) |
| CRS | `urn:ogc:def:crs:OGC:1.3:CRS84` (lon/lat) |
| Features | **351**: 316 Polygon + 35 MultiPolygon; 351 unique names |
| Properties | `massgis_name` (e.g. `BOSTON`), `massgis_town_id` (1–351, unique), `census_name` (e.g. `Boston`), `GEOID` (10 digits, starts `25`) |
| Bbox | lon −73.508 … −69.928, lat 41.239 … 42.887 |
| Reachability | `raw.githubusercontent.com` worked from the sandbox; `gis.data.mass.gov` and ArcGIS REST hosts did not |
| License | **Not stated in the README [U].** The data derive from MassGIS/Census public boundaries. Credit "Leventhal Map & Education Center; MassGIS" on the page, and ask organizers if unsure |

```bash
mkdir -p data/raw
curl -L -o data/raw/mass-municipalities.geojson \
  https://raw.githubusercontent.com/nblmc/massachusetts-municipal-boundaries/main/data-cooked/mass-municipalities.geojson
python3 -c "import json;d=json.load(open('data/raw/mass-municipalities.geojson'));print(len(d['features']))"   # expect 351
```

## 2. Build recipe (tested)

```bash
# mapshaper@0.7.82 and d3-geo@3.1.1 are installed by the scaffold (docs/ops/scaffold.md)
node reference/build_geo.mjs data/raw/mass-municipalities.geojson data/build/towns.json 300 1
```

Measured results from the 18 MB source on Oct 23 (rows other than the default were measured before the `census` name field was added, which costs ≈ 7 KB raw / 3 KB gzip):

| Simplify interval | Coordinate decimals | Raw | Gzip | Distinct centroids |
|---|---|---|---|---|
| 150 m | 1 | 142 KB | 49 KB | 351 |
| **300 m (default)** | **1** | **101 KB → 108 KB with `census` field** | **34 KB → 37 KB** | **351** |
| 300 m | 0 | 78 KB | 25 KB | 351 |
| 500 m | 1 | 82 KB | 27 KB | 351 |

At the 680 px panel width, 1 px ≈ 440 m, so a 300 m interval is sub-pixel. A visual check of the state and a zoomed coast view looked clean: `docs/specs/img/map_preview_300m.png` and `map_preview_zoom.png`.

## 3. The bug that already happened (don't repeat it)

The first attempt projected the lon/lat GeoJSON with `d3.geoConicConformal()` directly.
- **Symptom:** every town got the *same* centroid (340, 217.4). Paths traced the whole panel, and the files were huge (697 KB) but compressed to only ~7 KB.
- **Cause:** d3's spherical geometry expects clockwise exterior rings. RFC 7946 GeoJSON (what mapshaper writes) winds them counter-clockwise, so d3 treated each town as "the globe minus the town".
- **Fix:** project to **Massachusetts State Plane, EPSG:26986** inside mapshaper (`-proj EPSG:26986`), then fit with `d3.geoIdentity().reflectY(true)`. Planar coordinates have no winding ambiguity.
- **Guard:** the build fails if fewer than 345 centroids are distinct.

## 4. Join keys for data layers
- Primary: `massgis_town_id` (stable integer 1–351).
- Secondary: `GEOID` (Census county-subdivision id) for any Census-keyed data.
- Name joins are a last resort. Normalize upper-case and strip "TOWN OF"/"CITY OF". Note that `massgis_name` is upper-case (`BOSTON`), while `census_name` is mixed case.
