# Brief · copy-compliance

**Mission:** every user-facing string lives in `src/copy/strings.ts`, and every factual sentence maps to a claim ID in `docs/claims.md` with a source. You also own `research/sources.md`: add a row for every new source anyone uses (others send them to you as REQUESTS).
**Estimate:** 45 min.

## Read first
`.kiro/steering/product.md` (framing rules), `.kiro/steering/ground-truth.md`, `research/claims-seed.md`, `docs/specs/ui.md` §3.

## Steps
1. Start `docs/claims.md` from `research/claims-seed.md`. Format: `C-xx | exact sentence | source ID | verified-on date | status`.
2. Write `strings.ts` for all UI states (ui.md §2), the "How we compute this" drawer, and limits/disclaimers:
   - "Estimated for a home like yours" / "From your bills" (card 2 title, switches at ≥ 3 typed months).
   - "Supply portion of your bill; delivery charges are separate."
   - The two badge templates in bill-forecast.md §6 (numbers come from the JSON files; you write the words).
   - "Why we ask" line for the home inputs: "No one can look up your usage from an address. We estimate from 552 Massachusetts homes in a federal survey."
   - "Check your contract for early-termination fees before switching."
   - "Not financial or legal advice."
   - Reset timing: Feb 1 and Aug 1.
3. **Open items you must resolve or drop:**
   - (a) The AG $738.7M wording is **settled**: newsletter verbatim "since 2018" (C-03). Only re-open it if you find the AG report itself says something different.
   - (b) Consumer phone numbers: verify on the official page today, or omit.
   - (c) The Energy Switch MA difference statement, for the pitch.
   - (d) Add S14 (RECS 2020) and S15 (EIA-861M) to `research/sources.md` from `docs/apis/08-eia-usage-data.md`, with URLs and access date Oct 23 2026.
4. Run `git diff main -- app src` and the G-CLAIMS grep (`docs/ops/gates.md`). Any number or claim without a claim ID goes to the verifier as a finding.

## Done when
`claims.md` has no `TODO-SOURCE`, `strings.ts` has no orphan facts, and open items (a)–(c) are each marked resolved or dropped.

## Forbidden
"Scam", "rip-off", "guaranteed savings", "you will save", "your usage is" (before typed months: it's an estimate), "accurate". Present-tense certainty about either forecast.
