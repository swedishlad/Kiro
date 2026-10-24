# Claims seed (copy-compliance turns this into docs/claims.md)

Format: `ID | sentence as it may appear | source | status`. Status: OK = verified wording; CHECK = must be confirmed before use; DROP-IF-UNCONFIRMED.

| ID | Sentence | Source | Status |
|---|---|---|---|
| C-01 | National Grid's default (basic service) fixed rate rose from 15.372¢ to 17.185¢ per kWh on Aug 1, 2026. | S1, S3 | OK |
| C-01b | National Grid's default rate rose from about 15.4¢ to about 17.2¢ per kWh on Aug 1, 2026. | rounded C-01 | OK (spoken version) |
| C-02 | Basic-service fixed rates for Aug 1 2026 – Jan 31 2027: National Grid 17.185¢, Eversource East 17.323¢, Eversource West 15.934¢, Unitil 18.921¢ per kWh. | S1, S2 | OK |
| C-03 | The Attorney General reports that since 2018, residential customers who switched to competitive supply paid over $738.7 million more than they would have on basic service. | S2 (verbatim re-check Oct 23: "since 2018, residential customers who switched to Competitive Supply paid over $738.7 million more") | OK |
| C-04 | From July 2024 to June 2025, net losses totaled $87.4 million. | S2 | OK |
| C-05 | Low-income customers lost an average of $286 per year, versus $181 for other customers. | S2 | OK |
| C-06 | Basic-service rates change every six months; the next change is Feb 1, 2027. | S2 (+ term end Jan 31 2027) | OK |
| C-07 | Across 140 past rate periods since 2010, the fixed price was within 3% of the average of that period's monthly prices 86% of the time. | C (h1_precheck) | OK. Say "rate periods", not "six-month periods": 13 terms were irregular |
| C-08 | About half of Massachusetts customers get supply through municipal aggregation; about a quarter are on basic service; about a fifth on competitive supply (state data, March 2026). | S3 | OK, with the date |
| C-09 | Almost 70% of Massachusetts municipalities have an aggregation program. | S2 | OK |
| C-10 | Basic-service monthly prices since 2005 ranged from 5.844¢ to 40.5¢ per kWh. | C from S1 | OK |
| C-11 | A typical reset moves the default rate by about 16–27%, up or down (average size of past changes since 2010, by utility). | C (h1_precheck, simple %) | OK: NSTAR 16.4, WMECo 15.8, Unitil 18.6, NG 27.4 |
| C-12 | Consumer help line: … | — | **DROP-IF-UNCONFIRMED** (conflicting AG numbers seen) |
| C-13 | How FairWatt differs from Energy Switch MA: … | — | **CHECK** (not evaluated) |
| C-14 | State legislation status | S4 (as of Aug 4 2026) | **DROP-IF-UNCONFIRMED** after Aug 4 |
| C-15 | We estimate from 552 Massachusetts homes in the federal Residential Energy Consumption Survey (2020). | S14 | OK |
| C-16 | Massachusetts homes use about as much electricity in July and August as in January. | S15, computed (calendar-month means 2010–2026: Jul 746, Aug 740, Jan 694 kWh per account) | OK |
| C-17 | Predicting a month's statewide residential use by the same month last year has been off by about 6% on average since 2011. | S15, computed (5.9% on sales) | OK |
| C-18 | Supply is roughly half of a typical bill; the all-in average residential price was 30.48¢ per kWh in Aug 2026. | S15 (preliminary) | OK, say "preliminary" if asked |
| C-19 | Nobody can look up a home's electricity use from its address; that data belongs to the customer. | design rationale | CHECK: phrase as "we can't, and no public lookup exists" |
