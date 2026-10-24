# Requirements Document

## Introduction

FairWatt Home helps a Massachusetts household understand its electricity: what a home like theirs uses each month, what their next six supply bills could be across the Feb 1 2027 basic-service reset, and what they would pay on the utility's default supply instead. Nobody can look up a home's usage from an address, so the app **estimates** from public data (EIA RECS 2020, 552 Massachusetts homes; EIA-861M monthly sales) and lets the user **refine** with their own monthly kWh. Both forecasts are walk-forward backtested, and the interface says honestly whether they beat a simple baseline. The app is a static site with zero runtime network calls.

Sources and verified numbers: `.kiro/steering/ground-truth.md`. Full rationale: `docs/superpowers/specs/2026-10-23-fairwatt-home-design.md`. Detailed formulas and golden vectors: `docs/specs/estimator.md`, `docs/specs/bill-forecast.md`, `docs/specs/calculator.md`, `docs/specs/forecast.md`.

## Requirements

### Requirement 1: Estimate usage for a home like mine

**User Story:** As a Massachusetts resident who cannot easily see my usage, I want an estimate of my home's monthly electricity use from a few facts about it, so that I know roughly what to expect.

#### Acceptance Criteria

1. WHEN the user supplies square footage, year built, housing type and heating fuel THE SYSTEM SHALL show 12 monthly kWh values with a P10–P90 band.
2. WHEN the home is 1,500 sq ft, gas-heated, single-family detached (golden E1) THE SYSTEM SHALL show an annual P50 of 6,197.49 kWh, P10 3,401.26 and P90 10,217.94 using the fixture model.
3. WHILE fewer than 3 months of the user's own kWh are entered THE SYSTEM SHALL label the result "estimated for a home like yours".
4. IF square footage is outside 200–15,000 THEN THE SYSTEM SHALL show an input error and no estimate (golden E5).
5. THE SYSTEM SHALL show the typical Massachusetts account's monthly usage as a separate comparison line and SHALL NOT mix it into the estimate.
6. THE SYSTEM SHALL show monthly peaks in July–August and January as found in the data and SHALL NOT assume winter is the highest season.

### Requirement 2: Refine with my own bills

**User Story:** As a user with a few bills in hand, I want to type my monthly kWh, so that the app uses my real pattern instead of an estimate.

#### Acceptance Criteria

1. WHEN the user enters kWh for 3 to 11 months THE SYSTEM SHALL scale the estimated curve to the user's mean and label the result "from your bills" (golden E4: k = 1.484001).
2. WHEN the user enters kWh for all 12 months THE SYSTEM SHALL use the typed values as the curve.
3. WHEN the user enters 1 or 2 months THE SYSTEM SHALL keep the estimate, show the typed points, and explain that 3 months are needed.
4. IF a typed month is outside 50–5,000 kWh or a month is repeated THEN THE SYSTEM SHALL show an input error and no estimate (golden E6).

### Requirement 3: See my next six supply bills

**User Story:** As a household budgeting for winter, I want my next six supply bills with a range, so that the Feb 1 reset does not surprise me.

#### Acceptance Criteria

1. WHEN an estimate exists THE SYSTEM SHALL show the six calendar months after today with kWh, rate and dollar P10/P50/P90 and a six-month total (golden B1, B2, B3).
2. THE SYSTEM SHALL use the current basic-service rate through Jan 31 2027 and the rate forecast for Feb–Jul 2027.
3. IF a horizon month has no available rate THEN THE SYSTEM SHALL show "rate not available" for that month and withhold the total (golden B4).
4. THE SYSTEM SHALL label every dollar figure "supply portion" and state that delivery charges are separate.
5. THE SYSTEM SHALL mark the Feb 1 reset on the six-bill chart.

### Requirement 4: Honest forecasts

**User Story:** As a skeptical user or judge, I want to know whether the forecasts beat a simple guess, so that I can trust or discount them.

#### Acceptance Criteria

1. THE SYSTEM SHALL backtest the usage forecast (K0, K1) and the rate forecast (M0–M2) walk-forward with a leakage test that passes.
2. WHEN K1 does not beat K0 on mean absolute log error with 80% coverage between 0.70 and 0.90 THE SYSTEM SHALL ship K0 and show "Follows last year's seasonal pattern".
3. WHEN no rate model beats M0 under its ship rule THE SYSTEM SHALL label the range "how big resets usually are (not a forecast)".
4. THE SYSTEM SHALL show the number of backtest cases beside every badge and SHALL NOT use the word "accurate".

### Requirement 5: Compare with basic service and act

**User Story:** As a customer of a competitive supplier, I want to compare my rate with the default and see a simple saving, so that I can decide whether to act.

#### Acceptance Criteria

1. WHEN the user enters a supply rate THE SYSTEM SHALL show the difference versus basic service per month and per year in both directions (goldens G3, G4).
2. IF the rate looks like dollars (0 < rate < 1) THEN THE SYSTEM SHALL offer the cents value as a one-click fix.
3. IF today is after the loaded rate term THEN THE SYSTEM SHALL block the comparison with "rates for this period aren't loaded yet".
4. WHEN a six-bill forecast exists THE SYSTEM SHALL show the dollar saving from trimming 10% in the two highest-usage months (golden T1).

### Requirement 6: Pick my town

**User Story:** As a resident, I want to find my town on a real map or by search, so that setup feels local.

#### Acceptance Criteria

1. THE SYSTEM SHALL render all 351 Massachusetts towns from pre-projected SVG paths and a search box with the same result.
2. WHEN a verified town-to-utility layer exists THE SYSTEM SHALL prefill the utility; OTHERWISE THE SYSTEM SHALL ask the user to choose one of four utilities.
3. THE SYSTEM SHALL be usable by keyboard and at 375 px width.

### Requirement 7: Transparent and private

**User Story:** As a privacy-minded user, I want to know where every number comes from and that nothing leaves my browser.

#### Acceptance Criteria

1. THE SYSTEM SHALL make no network requests at runtime except same-origin static files.
2. THE SYSTEM SHALL list every source with a link and access date in a sources drawer, and SHALL show a data table under every chart.
3. THE SYSTEM SHALL NOT store user inputs unless in a clearly labeled local setting.
4. IF a data file fails to load or validate THEN THE SYSTEM SHALL show "couldn't load data" and no numbers.

### Requirement 8: Delivered and submitted

**User Story:** As the team, we want a deployed, verified app submitted correctly, so that judges can see it working and see how it was built.

#### Acceptance Criteria

1. WHEN the feature freeze occurs THE SYSTEM SHALL be deployed as a static site that loads on a phone.
2. THE SYSTEM SHALL pass every gate in `docs/ops/gates.md`, including an independent verifier pass with no open blockers.
3. THE SYSTEM SHALL be in the Kiro-connected GitHub repository with its latest commit visible, and SHALL be submitted on SundAI before 20:00.
4. THE SYSTEM SHALL include `docs/KIRO.md` and pass gate G-KIRO, showing how steering, this spec, hooks and sub-agents were used.
