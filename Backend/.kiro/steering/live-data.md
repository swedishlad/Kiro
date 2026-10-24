---
inclusion: always
---
# Live data (since Oct 24): read before touching data/build/ or a date

- `data/build/` is **regenerated every day** by `.github/workflows/refresh-data.yml` → `python3 -m backend.live.update`
  (fetch EIA-930 + Open-Meteo + EIA-861M → gate G-LIVE → rebuild regimes, Monte Carlo, towns → G-HMM, G-FC, G-CITY,
  schemas, pytest → frontend `npm run knowledge` + `npm test` + `npm run build`). It commits only when everything passes
  and new data arrived (`data/build/` and the assistant's generated `Frontend/server/knowledge.ts`).
- **Never hand-edit** `data/build/*.json` or `grid_daily.csv`: the next refresh overwrites it. Change the code, then run the
  refresh (or a single build) and its gate.
- **Never hard-code a data date or value** in code, tests or UI copy (no "2026-08", "2023-12-31", "Nov 2026"). Read it from the
  files: `live_status.json` → `gridThrough`, `homesThrough`, `forecastHorizon`.
- Freshness is daily, not real time: grid load lags ~10 days (EIA-930), homes ~2 months (EIA-861M). Say "data through <date>".
- Sources S19 (EIA-930) and S20 (Open-Meteo) and their validation: `docs/apis/11-live-grid-data.md`.
- The site still makes zero runtime API calls; fetching happens only in CI.
