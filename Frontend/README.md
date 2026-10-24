# FairWatt Frontend — Massachusetts energy dashboard

A static React + TypeScript site over the backend's committed artifacts. No API server and no runtime
fetches from third parties: the build bundles `Backend/data/build/*` and `Backend/data/snapshot/*`
directly, so the dashboard always shows exactly what the backend produced.

## Run it

```bash
cd Frontend
npm install
npm run dev        # http://localhost:5173
npm test           # parity tests against the backend artifacts (node --test)
npm run build      # type-check + static build in dist/
npm run preview    # serve dist/ locally
```

Requires Node 22+ (the tests run TypeScript directly through Node's type stripping).
`dist/` uses relative paths, so it can be served from any sub-path (GitHub Pages, S3, a file share).

## Deploy

Vercel builds this folder: `vercel.json` pins the Vite preset, `npm ci`, `npm run build` and the
`dist/` output. In the Vercel project settings, **Root Directory** must be `Frontend` and
"Include files outside the root directory in the Build Step" must stay on (the build reads
`../Backend/data`). No environment variables are needed. Any other static host works the same way:
build, then upload `dist/`.

## Sections

| Tab | What it shows | Backend inputs |
|---|---|---|
| Overview | 12-month average price, KPI tiles, homes vs their usual range, basic-service rates, grid zones + 6-month forecast | `eia_ma_monthly.csv`, `consumption_stats.json`, `savings_model.json`, `regimes.json`, `mc_forecast.json` |
| Usage | Monthly use per account since 2010 with HMM regimes, year-over-year sales, regime explainer, “a home like yours” estimator, RECS distribution and breakdowns | `eia_ma_monthly.csv`, `hmm_regimes.json`, `recs_ma.csv`, `consumption_stats.json`, `map_consumption.json` |
| Prices & savings | Basic-service monthly rates by utility, all-in price vs supply rate, fixed terms, savings calculator | `snapshot/monthly_residential_cents_*.csv`, `snapshot/fixed_residential_cents_*.csv`, `savings_model.json` |
| Regimes & forecast | Homes (monthly) and ISO-NE zones (daily) vs the same period in the previous 5 years, outlook, transition matrix; six-month Monte Carlo forecast with its walk-forward test | `regimes.json`, `mc_forecast.json` |
| Towns | Map of all 351 towns (load zone, population, growth), searchable table | `ma_towns.csv`, `map_consumption.json`, `src/geo/ma-towns.topo.json` |
| Data & methods | Sources, methods, limits, rebuild steps | — |

## Staying in sync with the backend

Where the frontend computes something the backend also computes, it ports the backend's code and
`src/data/data.test.ts` pins the result to the committed artifact:

- savings calculator (`src/data/savings.ts`) reproduces every example in `savings_model.json` to the
  last bit, including Python 3.12+'s compensated `sum()` and half-up cent rounding;
- basic-service term lookup matches `savings_model.py` for every utility and month;
- weighted percentiles reproduce `consumption_stats.json` and the map thresholds;
- the typical-account vector matches `consumption_stats.json` (12-month trailing account mean);
- `regimes.json` and `mc_forecast.json` are checked for the fields and invariants the pages read.

Regenerate the backend artifacts and run `npm test`; a failing test means the two have drifted.

## Layout

```
src/
  data/        parsers, backend ports and their tests (pure, no DOM)
  components/  SVG charts (line, column, stacked, range, scatter, histogram, map) and UI pieces
  sections/    one file per tab; all but Overview are lazy-loaded
  geo/         351-town TopoJSON (MassGIS boundaries via LMEC, simplified to 6%)
```

## Design notes

- Apple-style system UI: grouped grey page, white rounded cards, system colours, flat fills. No
  gradients, no borders on cards, and shadows only on things that float (tooltips).
- Colours are CSS custom properties with separate light and dark sets (`src/styles.css`).
- Type: the system font stack (San Francisco on Apple devices, Segoe UI on Windows), so no web
  fonts are downloaded.
  Regimes always pair colour with a shape (▼ ● ▲) and a word: Low / Mid / High for the level model
  (`hmm_regimes.json`), Below / Within / Above range for the usual-range model (`regimes.json`).
- Every chart has a Table view, keyboard reading (arrow keys) where it is a time series, and a
  hover tooltip; nothing is reachable only by hovering.
- Towns are never coloured by consumption: there is no verified per-town usage source, and the
  backend's map artifact says so.
