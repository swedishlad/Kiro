# Kiro — FairWatt Massachusetts energy dashboard

Massachusetts residential electricity use, prices, basic-service rates and grid regimes, built on
public EIA, Mass.gov and ISO New England data.

- [`Backend/`](Backend/README.md) — Python calculation suite; writes the JSON/CSV artifacts in
  `Backend/data/build/`.
- [`Frontend/`](Frontend/README.md) — the dashboard website (React + TypeScript, static build) that
  reads those artifacts. It is the only frontend in the repo. Its "Ask FairWatt" assistant
  (`Frontend/api/chat.ts`, Claude) answers visitors' questions from a knowledge base generated from the
  same artifacts; it needs `ANTHROPIC_API_KEY` ([details](Frontend/README.md#assistant)).

```bash
cd Frontend && npm install && npm run dev
```

Deploys to Vercel from `Frontend/` (see [Frontend/README.md](Frontend/README.md#deploy)).
