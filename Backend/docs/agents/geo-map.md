# Brief · geo-map

> **Standby agent.** The orchestrator normally runs steps 1–4 itself (runbook W1). Launch this agent only if the build or its gate fails, or to write `tests/geo/` when time allows. Commits by either of you are valid for these paths (structure.md, `geo-map / orchestrator`).

**Mission:** produce `data/build/towns.json` (351 towns, pre-projected SVG paths) that passes G-GEO.
**Estimate:** 25 min.

## Read first
`docs/apis/02-lmec-town-boundaries.md` (especially §3, the winding-order bug), `docs/specs/map.md`, `contracts/towns.schema.json`.

## Steps
1. `curl -L -o data/raw/mass-municipalities.geojson https://raw.githubusercontent.com/nblmc/massachusetts-municipal-boundaries/main/data-cooked/mass-municipalities.geojson` and confirm 351 features.
2. Copy `reference/build_geo.mjs` → `scripts/build_geo.mjs`, with no logic changes unless a test forces one.
3. `node scripts/build_geo.mjs data/raw/mass-municipalities.geojson data/build/towns.json 300 1`. Expect `distinctCentroids=351 raw=108KB gzip=37KB` and `PASS`. mapshaper and d3-geo are already installed by the scaffold.
4. Validate against `contracts/towns.schema.json` (0 errors).
5. Render `data/build/towns.preview.svg` to PNG (a Playwright screenshot, or open it in a browser) and save it as `data/build/towns.preview.png`. Check the outline of the state, Cape Cod, Martha's Vineyard, Nantucket, Boston Harbor and the Berkshires. Give the PNG path in your return.
6. Write `tests/geo/towns.test.ts`: 351 towns, unique ids 1..351, no NaN, ≥ 345 distinct centroids, file ≤ 600 KB raw.

## Done when
The automatic gate passes, the schema has 0 errors, the test passes, and the PNG is attached. The **visual sign-off is the orchestrator's** call.

## Forbidden
Shipping the 18 MB raw file to `public/`. Using `geoConicConformal` on unprojected GeoJSON (that's the known bug). Adding runtime map libraries.
