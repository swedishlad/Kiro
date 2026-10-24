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

## Sections

| Tab | What it shows | Backend inputs |
|---|---|---|
| Overview | 12-month average price, KPI tiles, recent use with regimes, basic-service rates, grid status | `eia_ma_monthly.csv`, `consumption_stats.json`, `hmm_regimes.json`, `savings_model.json`, `regimes.json` |
| Usage | Monthly use per account since 2010 with HMM regimes, year-over-year sales, regime explainer, “a home like yours” estimator, RECS distribution and breakdowns | `eia_ma_monthly.csv`, `hmm_regimes.json`, `recs_ma.csv`, `consumption_stats.json`, `map_consumption.json` |
| Prices & savings | Basic-service monthly rates by utility, all-in price vs supply rate, fixed terms, savings calculator | `snapshot/monthly_residential_cents_*.csv`, `snapshot/fixed_residential_cents_*.csv`, `savings_model.json` |
| Grid regimes | ISO-NE daily load vs temperature by zone, monthly regime shares, outlook, transition matrix | `regimes.json`, `isone_ma_daily.csv`, `ma_towns.csv` |
| Towns | Map of all 351 towns (load zone, population, growth), searchable table | `ma_towns.csv`, `map_consumption.json`, `src/geo/ma-towns.topo.json` |
| Data & methods | Sources, methods, limits, rebuild steps | — |

## Staying in sync with the backend

Where the frontend computes something the backend also computes, it ports the backend's code and
`src/data/data.test.ts` pins the result to the committed artifact:

- savings calculator (`src/data/savings.ts`) reproduces every example in `savings_model.json` to the
  last bit, including Python 3.12+'s compensated `sum()` and half-up cent rounding;
- basic-service term lookup matches `savings_model.py` for every utility and month;
- weighted percentiles reproduce `consumption_stats.json` and the map thresholds;
- the typical-account vector matches `consumption_stats.json` (12-month trailing account mean).

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

- Colours are CSS custom properties with separate, validated light and dark sets (`src/styles.css`).
  The Low / Mid / High regimes always pair colour with a shape (▼ ● ▲) and a word.
- Every chart has a Table view, keyboard reading (arrow keys) where it is a time series, and a
  hover tooltip; nothing is reachable only by hovering.
- Towns are never coloured by consumption: there is no verified per-town usage source, and the
  backend's map artifact says so.
