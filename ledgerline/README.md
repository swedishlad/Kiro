# Ledgerline

A live sales dashboard built with Next.js (App Router), Tailwind CSS v4, and Recharts.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Deploy to Vercel

Push to GitHub and import the repo at vercel.com/new, or run `npx vercel` in this folder. No environment variables are needed.

## How it works

- `lib/data.ts` generates sample data. Replace `getMetrics` with a database or API call; the returned shape is what the UI reads.
- `app/api/metrics/route.ts` serves it as JSON at `/api/metrics?range=7d|30d|90d`.
- `lib/use-metrics.ts` polls that endpoint every 5 seconds. The Live button pauses it.
- `components/` holds the dashboard, chart, channel bars, and sortable, filterable orders table.
- Colors and fonts are tokens in `app/globals.css`; light and dark themes swap there.
