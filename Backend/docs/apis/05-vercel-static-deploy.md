# 05 · Deploy: Next.js static export on Vercel (sources S12; CLI version from npm)

**Status:** the Next.js static-export facts come from the official guide (S12, "lastUpdated 2026-08-09"). The Vercel CLI commands below are standard usage but **unverified in this session [U]**; they get tested in the Friday hello-world deploy.

## 1. Why static
- No server, no API keys, no database. All data is prebuilt JSON in `public/data/`. Users' inputs never leave the browser.
- It survives venue Wi-Fi: the whole app is a few hundred KB and works offline once loaded.

## 2. Next.js config [V: S12]
```js
// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = { output: 'export' };   // `next build` writes ./out
module.exports = nextConfig;
```

**Not available in static export** (S12):
- Dynamic routes without `generateStaticParams()`
- Route handlers that read the request
- Cookies, rewrites, redirects, headers, proxy
- ISR, Server Actions, draft mode
- **`next/image` with the default loader:** use plain `<img>` or a custom loader.

Browser-only APIs (`window`, `localStorage`) must run inside `useEffect` in client components.

## 3. Data flow at build time
```
data/raw/*.xlsx, *.geojson  --(reference/ingest_rates.py, reference/build_geo.mjs)-->  data/build/*.json
data/build/*.json  --(npm run build:data copies + validates with zod)-->  public/data/*.json
public/data/*.json  --(fetch('/data/rates.json') in a client component)-->  UI
```
Add to package.json:
```json
{ "scripts": {
    "build:data": "tsx scripts/copy-and-validate-data.ts",
    "build": "npm run build:data && next build",
    "test": "vitest run",
    "e2e": "playwright test" } }
```

## 4. Deploy [U: verify Friday]
**Option A, Git integration (recommended):**
1. Push to GitHub.
2. Import the repo in the Vercel dashboard. Framework preset: Next.js.
3. Every push deploys. Saturday 18:30 freeze = the last push to `main`.

**Option B, CLI:**
```bash
npx vercel@63.1.2 login
npx vercel@63.1.2            # preview deploy; prints a URL
npx vercel@63.1.2 --prod     # production deploy
```

## 5. Release checklist (gate G-REL)
- [ ] `npm run build` succeeds from a clean clone (`rm -rf node_modules .next out && npm ci && npm run build`).
- [ ] Production URL loads on a phone over a hotspot. Target: under 3 s cold, measured, not assumed.
- [ ] `public/data/*.json` sizes logged. towns.json should be about 108 KB raw / 37 KB gzip at the 300 m setting.
- [ ] A 60–90 s fallback screen recording of the demo is saved locally (in case of a venue network failure).
- [ ] The URL is in `docs/DEMO.md` and in the submission form.
