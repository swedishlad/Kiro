# Reference scripts (tested Oct 23 2026)

Frozen: change them only with orchestrator approval and a CHANGELOG entry. Agents copy them into `scripts/` for the build.

| Script | What it does | Tested how | Needs |
|---|---|---|---|
| `verify_snapshot.py` | Gate G-DATA-1: rows, per-column counts and sums, 8 anchors | PASS on `data/snapshot/` | stdlib |
| `ingest_rates.py` | XLSX (or `--from-snapshot` CSVs) → residential CSVs + `rates.json`; lists irregular terms | Replica workbook → byte-identical CSVs; snapshot round-trip identical; rates.json validates against the schema | openpyxl 3.1.5 (XLSX mode only) |
| `test_ingest.py` | Builds a replica workbook with the real file's quirks and runs ingest + verify | PASS | openpyxl |
| `build_geo.mjs` | LMEC GeoJSON → `towns.json` (EPSG:26986 planar, pre-projected SVG paths) + preview SVG | 351 towns, 351 distinct centroids, 108 KB raw / 37 KB gzip at 300 m (incl. `census` names); rendered and inspected | mapshaper 0.7.82, d3-geo 3.1.1; run from repo root |
| `browser_extract_xlsx.js` | In-page fetch + unzip + parse of the Mass.gov XLSX (fallback) | The same logic produced the snapshot on Oct 22 | a browser tab on mass.gov |
| `h1_precheck.py` | Descriptive H1 stats and reset sizes | Output in `research/h1_precheck_output.txt` | stdlib |
| `check_ownership.py` | Gate G-OWN: changed files vs `.kiro/steering/structure.md` | Pass and fail cases incl. the `public/data/**` override | stdlib |
| `gen_agents.py` | Writes `.kiro/agents/*.json` + `.claude/agents/*.md` from one table | All JSON valid | stdlib |

**Not tested here:** the live Mass.gov XLSX through `ingest_rates.py` (the sandbox can't reach mass.gov). The replica reproduces the quirks we observed; run the real file on Friday if you can download it.
