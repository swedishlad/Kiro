# Brief · data-ingest

> **Standby agent.** The orchestrator normally runs steps 1–5 itself (four tested commands, no credits; runbook W1). Launch this agent only if a script or gate fails, or to write `tests/data/` when time allows. Commits by either of you are valid for these paths (structure.md, `data-ingest / orchestrator`).

**Mission:** produce every build-time data file the others read: `data/build/rates.json` (+ the two residential CSVs) passing G-DATA-1/2, and `data/build/recs_ma.csv` + `data/build/eia_ma_monthly.csv` passing G-DATA-3.
**Estimate:** 30 min with the snapshots (Path B, the default); 60 min if the orchestrator asks for fresh downloads (Path A).

## Read first
`docs/apis/01-massgov-basic-service-xlsx.md`, `docs/apis/08-eia-usage-data.md`, `docs/specs/data-dictionary.md`, `contracts/types.ts` (RatesFile).

## Inputs
- **The delegation message says Path A or Path B.** If it doesn't, use Path B and note that under OPEN RISKS.
- `data/snapshot/*.csv` (all verified). For Path A: `data/raw/<rates>.xlsx`, `data/raw/recs2020_public_v7.csv`, `data/raw/sales_revenue.xlsx`.
- `reference/ingest_rates.py`, `reference/verify_snapshot.py`, `reference/test_ingest.py`, `reference/ingest_usage.py`, `reference/verify_usage.py` (tested; don't rewrite).

## Steps
1. Copy `reference/ingest_rates.py` → `scripts/ingest_rates.py` and `reference/ingest_usage.py` → `scripts/ingest_usage.py` unchanged, so the build doesn't depend on `reference/`.
2. **Rates, Path B:** `python3 scripts/ingest_rates.py --from-snapshot data/snapshot/monthly_residential_cents_2026-07-02.csv data/snapshot/fixed_residential_cents_2026-07-02.csv data/build/`
3. **Usage, Path B:** `python3 scripts/ingest_usage.py --from-snapshot data/snapshot/recs_ma_2020.csv data/snapshot/eia_ma_monthly_2026-08.csv data/build/`
4. **Path A** (only if told): rates per docs/apis/01 §5; usage per docs/apis/08 §3–4. Checksums will differ for refreshed files: **send the new numbers as a REQUEST**; only the orchestrator updates `reference/verify_*.py`.
5. Run G-DATA-1, G-DATA-2 and G-DATA-3 (`docs/ops/gates.md`).
6. Write `tests/data/check_rates.py` and `tests/data/check_usage.py` (plain `python3` with `assert`s; pytest isn't pinned): the gate conditions, schema validity, and the exact `current` rates.
7. Write `tests/data/README.md`: the 13 irregular rate terms (Path B = "not checked against the XLSX"), and the EIA customer-count caveat.
8. Commit as `data-ingest: <what> (G-DATA-1/2/3: pass)`.

## Done when
G-DATA-1 PASS; G-DATA-2 prints 0; G-DATA-3 PASS; `current` = 17.185 / 17.323 / 15.934 / 18.921 with termStart 2026-08, termEnd 2027-01; tests pass.

## Forbidden
Hand-typing any rate or kWh. Smoothing, dropping or "fixing" outliers or customer-count jumps. Editing `reference/` or `data/snapshot/`.
