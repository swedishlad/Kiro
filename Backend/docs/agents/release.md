# Brief · release

**Mission:** the data loading layer (W1), then a static production deploy anyone can open on a phone, plus a demo script and a fallback recording (W2–W5).
**Estimate:** W1 40 min; deploy 30 min.

## Read first
`docs/apis/05-vercel-static-deploy.md`, `docs/ops/scaffold.md`, `contracts/types.ts`, `contracts/*.schema.json`, `docs/ops/demo-script.md`.

## Files you own
`next.config.js`, `vercel.json` (only if needed), `src/data/**`, `scripts/copy-and-validate-data.ts`, `public/data/**`, `docs/DEMO.md`, `docs/SUBMISSION.md`.

## W1 steps (launch with the first wave)
1. **`src/data/schemas.ts`:** zod schemas mirroring `contracts/rates.schema.json`, `towns.schema.json`, `forecast.schema.json`, `estimate_model.schema.json`, `usage_forecast.schema.json` and `MapLayerFile`. Export inferred types, and type-check them against `contracts/types.ts` (e.g. `satisfies`).
2. **`src/data/load.ts`:** a client-side `loadAll()` that fetches `/data/{rates,towns,forecast,estimate_model,usage_forecast}.json` (+ `layers/*.json` if listed in a small `/data/manifest.json`). It validates each file and returns either typed data or a typed error. **ui-builder imports this; nobody else writes validators.**
3. **`scripts/copy-and-validate-data.ts`** (run with `tsx`):
   - Validate `data/build/*.json` with the same schemas and copy them to `public/data/`. Write `manifest.json`.
   - **Exit non-zero on any error.** Missing `forecast.json`, `usage_forecast.json`, `estimate_model.json` or `towns.json` is an error after W2 starts; before that, allow `--allow-missing`.
   - Delete the scaffold's `public/data/ping.json`.
4. REQUEST to the orchestrator: set `"build:data": "tsx scripts/copy-and-validate-data.ts"` and `"build": "npm run build:data && next build"` in package.json at your merge.

## Deploy steps (preview deploys any time from W2; final production deploy at the 18:30 freeze)
0. The GitHub repo must be the one connected through Kiro (the event checks it). Push from Kiro; confirm the latest commit is visible on github.com.
5. Clean-clone build: `rm -rf node_modules .next out && npm ci && npm run build`.
6. Deploy (Git integration, or `npx vercel@63.1.2 --prod`). Open the URL on a phone over a hotspot and time the cold load.
7. `docs/DEMO.md`: URL, the 2-minute script (from `docs/ops/demo-script.md`, filled with the real forecast numbers), "Limits" (accepted verifier findings), and sources.
8. Record a 60–90 s screen capture of the demo path as an offline fallback.
9. **`docs/SUBMISSION.md`** by 18:30, from `docs/ops/submission.md`: project name, track **Energy & climate tech**, one-paragraph description, what's real vs estimated, live URL, GitHub repo URL, team names, "Built in Kiro". The human pastes it into SundAI at 18:45 (gate G-SUBMIT).

## Done when
W1: schemas + loader + copy script committed; `npm run build` works with the W1 data. Release: G-REL + `docs/SUBMISSION.md` complete.
