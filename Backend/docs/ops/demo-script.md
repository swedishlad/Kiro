# Demo script: 2 minutes (fill the {braces} from the JSON files and backtest.md at 19:00)

Every sentence with a claim ID must match `docs/claims.md`. Judges score submitted projects 8–11 PM; this script doubles as the 60–90 s fallback recording and the SundAI description's backbone.

**0:00 Hook (15 s).** "Nobody can look up how much electricity your home uses, not even from your address; that data belongs to you. So most Massachusetts families find out what winter, or August, costs when the bill arrives. And on Feb 1 the default price resets again."

**0:15 Your home (35 s).** Tap **Demo**: Boston, National Grid, 1,500 sq ft, 1980s, single-family, gas heat.
- "From 552 Massachusetts homes in the federal energy survey, a home like this uses about {E1 annual} kWh a year, somewhere between {p10} and {p90}. We show the range because homes that look alike use very different amounts."
- "Notice the peaks: July and August are as high as January [C-usage-shape]. Air conditioning, not just heat."

**0:50 Your next six bills (35 s).** "Here are your next six supply bills, November to April: about ${B3 total} in total."
- "The Feb 1 reset is marked. Our rate model says National Grid lands between {p10} and {p90} cents." Then the badge sentence for each forecast:
  - **Usage, beats-naive:** "We tested the usage outlook on {n} past months; it beat 'same as last year' in {k}." **seasonal-only:** "Nothing beat 'same as last year', so that's what we use, and we say so."
  - **Rate, beats-naive / no-skill:** as forecast.md §6.

**1:25 Your numbers (20 s).** Tap **With my bills**: three months typed. "Type a few months from your bills and it stops being an estimate. The label changes to 'from your bills'."

**1:45 Act + trust (10 s).** "If you're on a competitive supplier, card 4 shows what basic service would cost, in both directions. Every number has a source in this drawer."

**1:55 Close (5 s).** "FairWatt Home: your electricity, planned. Built today in Kiro, with a verifier agent that tried to break it."

## Production path (one slide or one sentence if asked)
Link your utility account (services like Bayou Energy or UtilityAPI) or upload your Green Button file → real interval data replaces the estimate. Address → MassGIS assessor records → home size and age prefilled.

## Likely judge questions (prep answers)
- *"How accurate is the estimate?"* → quote `research/estimator.md`: LOO median error {x}%, band P10–P90, n = 552. The fit explains about a third of the variation, which is why the band is shown.
- *"Why not just ask for the address?"* → usage data belongs to the customer; no public lookup exists, and Massachusetts privacy rules protect it.
- *"Where does the data come from?"* → RECS 2020 (S14), EIA-861M (S15), Mass.gov basic-service rates (S1), AG newsletter (S2), LMEC/MassGIS boundaries.
- *"What about delivery charges?"* → we show the supply portion; delivery is separate and the same on any supplier. The all-in average was 30.48 ¢/kWh in Aug 2026 [S15].
- *"How is this different from Energy Switch MA?"* → copy-compliance open item (c). Don't improvise facts.
