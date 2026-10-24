# Brief · ui-builder (pairs with the teammate; the teammate has final say on design)

**Mission:** the single page in `docs/specs/ui.md`, coded against fixtures first, then wired to real JSON.
**Estimate:** 3.5 h across W1–W2 (≈ 11:50 → 16:00). Commit as `ui-builder: <what> (G-UI: pass)`.

## Read first
`docs/specs/ui.md`, `docs/specs/map.md`, `docs/specs/estimator.md` §2 + §4, `docs/specs/bill-forecast.md` §3 + §6, `docs/specs/calculator.md` §2–3, `contracts/types.ts`, `docs/ops/scaffold.md`.

## Files you own
`app/**`, `src/ui/**`, `public/**` (except `public/data/**`), `tests/ui/**`.

## Steps
1. **W1 (fixtures).**
   - Create `src/ui/fixtures/` with a tiny `RatesFile`, a 3-town `TownsFile`, an `EstimateModelFile` (the estimator.md §5 fixture), two `UsageForecastFile`s (`beats-naive`, `seasonal-only`) and two `ForecastFile`s (`beats-naive`, `no-skill`).
   - Build the 4 cards + drawer against them, including **every state** in ui.md §2. Card 2 title must switch between "estimated for a home like yours" and "from your bills".
   - Charts: 12-bar usage chart with a band and the typical line; 6-bar dollar chart with ranges and the Feb 1 reset marked. Hand-written SVG, `<details>` table under each.
   - Keep `public/icon.svg` and the `icons` metadata in `app/layout.tsx`. Without them, `/favicon.ico` 404s and G-UI fails on the console error.
2. Import `estimate()`, `forecastBills()`, `trim()` from `src/engine/estimate/` and `compare()`, `formatUsd()` from `src/engine/`. Don't reimplement any math; if they aren't merged yet, code against the contract signatures.
3. **W2 (real data).** Use release's `loadAll()` from `src/data/load.ts`. Don't write your own validators. Show the "Data load failure" state on any error.
4. **Map component.**
   - One `<path>` per town.
   - Search and display use `town.census` (mixed case). `town.name` is the upper-case MassGIS name, used only for joins.
   - It's the **town picker** inside card 1 (search box first). Click/tap selects. Utility prefill **only if** `layers/L1_utility.json` exists in the manifest; otherwise the user picks from 4 utilities.
5. **Demo buttons:** ui.md §5 (E1 + G3 home; "With my bills" adds E4's three months).
6. **Tokens:** light and dark, `:root` + `prefers-color-scheme`. 16 px gutters. Check at 375 px.
7. **Extend `tests/ui/smoke.spec.ts` into the G-UI spec:** every state reachable, keyboard path (inputs → result → map search), no console errors, no horizontal scroll, screenshots to `tests/ui/screens/`.

## Done when
- W1: `npx next build` passes with fixtures.
- W2: G-UI passes (`npm run build && npx playwright test tests/ui`).

## Forbidden
- Hardcoded numbers in components. Copy comes from `src/copy/strings.ts`, data from JSON.
- Chart or map libraries, and runtime external requests.
- `next/image` with the default loader (unsupported in static export).
- Writing in `tests/e2e/` (the verifier's folder).
