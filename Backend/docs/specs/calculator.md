# Spec · F1 Calculator (owner: calc-engine)

## 1. In plain words
Your electricity bill has a **supply** line: price per kWh × kWh used. If you're with a competitive supplier, that price is your contract price. If you'd stayed on the utility's default ("basic service"), the price would be the utility's current fixed basic-service rate. FairWatt multiplies both by your kWh and shows the difference.

That's it: no hidden model. Being this simple is the feature, because anyone can check it with a calculator.

## 2. Formulas
Let `u` = user's supply rate (¢/kWh), `b` = basic-service fixed rate for the chosen utility from `rates.current` (¢/kWh), and `k` = kWh per month.

```
userMonthly    = u × k / 100            dollars
defaultMonthly = b × k / 100            dollars
diffMonthly    = (u − b) × k / 100      + means the user pays MORE than basic service
diffAnnual     = diffMonthly × 12       label: "per year at today's rates"
```
- **Display rounding only:** half-up to cents. Keep internal math unrounded. Never round `u` or `b`.
- **Both directions:** if `u < b`, say "you're paying $X/mo **less** than basic service right now". Don't hide good news. The Aug 2026 reset raised basic service, so some contracts are now cheaper.
- **Scope note shown in the UI:** supply portion only. Delivery charges are the same either way, so they cancel out.

## 3. Validation (`CompareOutcome` in contracts)

| Check | Rule | Type | UI behavior |
|---|---|---|---|
| Rate looks like dollars | `0 < u < 1` | error + suggestion | "Did you mean **{u×100}¢**?" (one-click fix) |
| Rate hard range | `u < 1 or u > 100` | error | "That rate looks off. Check the 'Supply' line on your bill" |
| Rate unusual | `u < 5 or u > 45` | warning | Show the result plus a yellow note. Basic service 2005–Jan 2027 (S1): monthly prices 5.844–40.5¢, fixed terms 6.23–33.891¢ |
| kWh hard range | `k < 1 or k > 5000` | error | "Typical homes use a few hundred kWh a month" |
| Utility missing | not in `UtilityId` | error `UTILITY_MISSING` | Select required |
| Data stale | `today` after the last day of month `rates.current[ut].termEnd` | error `DATA_STALE`, **blocks the result** | "Rates for this period aren't loaded yet", fail-closed |

## 4. Golden vectors (must pass exactly, after display rounding)

| ID | Input | Expected | Source |
|---|---|---|---|
| G1a | b = 17.185, k = 650 | defaultMonthly **$111.70** | S2 (AG worked example, National Grid) |
| G1b | b = 17.323, k = 650 | **$112.60** | S2 (Eversource East) |
| G1c | b = 15.934, k = 650 | **$103.57** | S2 (Eversource West) |
| G1d | b = 18.921, k = 650 | **$122.99** | S2 (Unitil) |
| G2 | u = 14.840, k = 500 | userMonthly **$74.20** | S2 sample bill |
| G3 | NG, u = 18.9, k = 600 | user **$113.40**, default **$103.11**, diff **+$10.29/mo**, **+$123.48/yr** | computed (demo preset) |
| G4 | NG, u = 15.0, k = 600 | diff **−$13.11/mo** (user pays less) | computed (both-directions test) |

Check of G4: (15.0 − 17.185) × 600 / 100 = −13.11.

## 5. Property tests (fast-check)
1. `u == b` ⇒ `diffMonthly == 0`.
2. Antisymmetry: `diff(u, b) == −diff(b, u)`.
3. Linear in kWh: `diff(k1 + k2) == diff(k1) + diff(k2)`, within 1e-9.
4. `diffAnnual == 12 × diffMonthly` exactly.
5. Over a grid u ∈ [1, 100], k ∈ [1, 5000]: no `NaN` or `Infinity`, and display strings match `^-?\$\d{1,3}(,\d{3})*\.\d{2}$` (ASCII hyphen-minus, e.g. `-$13.11`).
6. Any `0 < u < 1` returns `RATE_LOOKS_LIKE_DOLLARS` with `suggestion == u × 100`.

## 6. Non-goals
Prorating partial bill periods; taxes; early-termination fees (we *mention* them, but don't compute them); delivery charges.

## 7. D2 · Money you could have saved vs the basic service rate: `savedVsBasic(input, rates)` (TS, `src/engine/household/saved.ts`)
- For each month `ym` in `input.months`: `basicCents(ym)` = the **fixed** basic-service rate in force for `input.utility` (the `fixedTerms` entry with start ≤ ym ≤ end in rates.json). `diffDollars = (userCents − basicCents) × kwh / 100`.
- `totalDollars` = Σ diff; `label` = `could-have-saved` if > 0.005, `saved` if < −0.005, else `even`. UI wording: "You could have saved $X on basic service" / "You saved $X vs basic service". Supply portion only.
- Default months (UI): the 12 months ending at the current term's end, kWh from the estimate's monthly P50 (or typed).
- Fail closed: a month with no fixed term → that month is excluded and listed in a warning; never guessed.

| ID | Input | Expected |
|---|---|---|
| S1 | NG, userCents 18.9, 600 kWh every month 2026-02 … 2027-01 | total **+$188.75** (6 × 21.168 + 6 × 10.29), `could-have-saved` |
| S2 | NG, userCents 15.0, same months | total **−$92.05** (6 × −2.232 + 6 × −13.11), `saved` |
| S3 | userCents equal to each month's basic rate | total $0.00, `even` |
