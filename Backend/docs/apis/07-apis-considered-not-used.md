# 07 · APIs considered and NOT used in Lite (and why)

Writing these down stops an agent from "helpfully" adding them on Saturday.

| API / source | What it would add | Why not in Lite | Status of our knowledge |
|---|---|---|---|
| ISO-NE web services (wholesale LMPs, load) | Wholesale price features for the forecast | Needs an account and credentials (per our earlier research); live calls break the "no keys, static" design; no evidence yet that it beats the H1 + seasonal approach | Endpoint details **[U]**. Not researched in depth |
| EIA API (fuel prices, Henry Hub) | Gas-price driver for winter terms | Needs an API key; same reasons | **[U]** |
| Utility rate pages / tariff PDFs | Second source for the newest rate | **Used manually** as a verification source, not as an API | National Grid tariff PDF seen (Mar 2020 summary sheet only; not a history) |
| Bill-photo OCR (any vision API) | Auto-fill the inputs | Privacy (bills contain name, address, account number); time cost; accuracy risk | Out of scope by decision |
| LLM API for explanations | Friendly text | Numbers must be deterministic; templated copy is enough for Lite. If used, it may only pick from whitelisted templates | Optional stretch, behind G-CLAIMS |
| Energy Switch MA (state comparison site) | Competitive offers | **Prior art, not a data source.** The pitch must explain the difference: we compare *your* rate with the default and forecast the next reset | Not evaluated **[U]** |

**Rule:** adding any external call at runtime needs an orchestrator decision and a new row in `research/sources.md`.
