# APIs and data sources: index

| # | Source | Kind | Auth / key | Runtime or build time | Owner agent | Status | Guide |
|---|---|---|---|---|---|---|---|
| 01 | Mass.gov "Basic Service Rates" XLSX | Static file | None | Build | data-ingest | [V] parsed; snapshot ships | [01](01-massgov-basic-service-xlsx.md) |
| 02 | LMEC 351-town GeoJSON (GitHub raw) | Static file | None | Build | geo-map | [V] built and visually checked | [02](02-lmec-town-boundaries.md) |
| 03 | npm and PyPI packages | Registries | None | Build/dev | all | [V] versions and dates | [03](03-toolchain-npm-pypi.md) |
| 04 | Kiro custom agents, sub-agents, steering | IDE features | Kiro account (event credits: physical code at check-in) | Dev | orchestrator | [V] docs; [U] smoke test at check-in | [04](04-kiro-agents-and-steering.md) |
| 05 | Next.js static export + Vercel | Hosting | Vercel account | Deploy | release | [V] Next docs; [U] CLI steps | [05](05-vercel-static-deploy.md) |
| 06 | Town-level utility and aggregation data | Unknown | Unknown | Build | human (optional) | **[U] nothing found yet** | [06](06-map-layer-candidate-sources.md) |
| 07 | ISO-NE, EIA API, OCR, LLM, Energy Switch MA | — | Keys needed | — | none | Deliberately not used at runtime | [07](07-apis-considered-not-used.md) |
| 08 | EIA RECS 2020 microdata + EIA-861M (static files, no key) | Static files | None | Build | data-ingest | [V] snapshot ships (G-DATA-3) | [08](08-eia-usage-data.md) |
| 11 | EIA-930 grid load + Open-Meteo temperature + EIA-861M refresh (no keys) | Static files / JSON | None | **Daily, in CI** (not in the browser) | backend/live | [V] G-LIVE, refreshed daily | [11](11-live-grid-data.md) |

**At runtime the app makes zero external API calls.** It fetches only its own static JSON from `/data/`. That is a design constraint, not an accident: no keys to leak, nothing to rate-limit, nothing that breaks during the judging window.
