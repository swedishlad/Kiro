# Spec · UI (owners: teammate + ui-builder)

FairWatt Home. Inputs and outputs: `HomeInput`, `UsageEstimate`, `BillForecast`, `CompareOutcome`, `TrimScenario` in `contracts/types.ts`.

## 1. One page, four cards, one drawer

```
┌──────────────────────────────────────────────┐
│  FairWatt Home · your electricity, planned    │
├──────────────────────────────────────────────┤
│ [1] YOUR HOME  Town (search / map) · Utility ▾│
│     Sq ft ─●── · Year built ▾ · Type ▾ · Heat ▾│
│     ▸ Have your bills? kWh for up to 12 months │
│     ▸ Your supply rate from the bill (¢/kWh)  │
│     [Show me]  [Demo]                          │
├──────────────────────────────────────────────┤
│ [2] A HOME LIKE YOURS   (estimated)           │
│     12 monthly bars + P10–P90 band            │
│     line: typical MA account · ~6,200 kWh/yr  │
├──────────────────────────────────────────────┤
│ [3] YOUR NEXT SIX BILLS  (supply portion)     │
│     Nov … Apr: $ bars with ranges · total     │
│     Feb 1 reset marked · 2 badges             │
├──────────────────────────────────────────────┤
│ [4] WHAT YOU CAN DO                           │
│     vs basic service: +$10.29/mo (if rate)    │
│     trim 10% in your 2 peak months: −$19      │
├──────────────────────────────────────────────┤
│ ▸ How we compute this · Sources · Limits      │
└──────────────────────────────────────────────┘
```
Numbers in the sketch are illustrative; the demo preset uses golden vectors E1/B3/T1 (estimator.md, bill-forecast.md) and G3 (calculator.md).
The town map (map.md) opens from the Town field as a picker; it is not a separate card.

## 2. States (each one must be designed and tested)

| State | Trigger | What the user sees |
|---|---|---|
| Empty | First load | Card 1 with a one-line "why we ask" and a Demo button |
| Estimated | Valid home, < 3 typed months | Cards 2–4; card 2 title says **"estimated for a home like yours"**, band visible |
| From your bills | ≥ 3 typed months | Card 2 title **"from your bills"**; band collapsed; typed points marked |
| Too few months | 1–2 typed months | Estimated state + note "add at least 3 months to use your own numbers" |
| No supply rate | `userCents` empty | Card 4 shows the trim scenario only + "add your supply rate to compare with basic service" |
| Rate warning | `RATE_UNUSUAL` | Card 4 result + yellow note |
| Input error | Any hard validation (calc or estimate) | Inline field error; no numbers in cards 2–4 |
| Dollar slip | `0 < u < 1` | "Did you mean 17¢?" button |
| Usage seasonal-only | `usage_forecast.skill = "seasonal-only"` | Usage badge "Follows last year's seasonal pattern" |
| Rate no-skill | `forecast.skill = "no-skill"` | Feb–Apr bars labeled "rate range, not a forecast" |
| Rate unavailable | horizon month after 2027-07, or stale term | That month "rate not available"; total withheld |
| Data load failure | fetch fails | "Couldn't load data"; no numbers shown |

## 3. Copy rules (copy-compliance owns the strings file)
- Every factual sentence has a claim ID in `docs/claims.md`.
- Use "would have paid", "at today's rates", "basic service (the utility's default supply)". Never "scam" or "rip-off".
- Must appear:
  - "Estimated for a home like yours" (until ≥ 3 typed months), "from your bills" after
  - "Supply portion of your bill; delivery charges are separate"
  - "Supply portion only; delivery charges don't change"
  - "Check your contract for early-termination fees"
  - "Not financial or legal advice"
  - Reset dates: Feb 1 and Aug 1
- Consumer help phone numbers: **only after verification** on the official page (open question in research/open-questions.md).

## 4. Visual system
- **Tokens on `:root`**, with dark values under `@media (prefers-color-scheme: dark)`. Explicit `body` background.
- **Categorical palette** (from our earlier PeakCall mock; checked there with a palette-contrast script, not re-validated for this page): blue `#2a78d6`, orange `#eb6834`, aqua `#1baf7a`, violet `#6250d6`; gray for unknown. Dark-mode variants: blue `#3987e5`, orange `#d95926`, violet `#9085e9`. **Aqua has no tested dark variant;** choose and contrast-check one before using aqua in dark mode.
- **Charts are hand-written SVG:** no dual axes, a direct label on the current-rate marker and the Feb 1 reset, bands as light fills behind P50 bars, and a `<details>` table under every chart.
- **Layout:** 16 px side gutters; usable at 375 px; no horizontal scroll.
- **Accessibility:** labels on every input, focus rings visible, and all four cards reachable and readable by keyboard and screen reader.

## 5. Demo mode
- The "Demo" button fills: Boston, National Grid, 1,500 sq ft, 1980s, single-family detached, gas heat, supply rate 18.9¢ (golden E1 + G3), then scrolls to card 2.
- A second preset "With my bills" adds Jan 900 / Feb 800 / Mar 700 kWh (golden E4) to show the switch to "from your bills".
- Deterministic, no network beyond the already-loaded JSON, works offline after the first load.
