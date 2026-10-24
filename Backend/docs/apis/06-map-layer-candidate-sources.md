# 06 · Map data layers: candidate sources (ALL UNVERIFIED) and research protocol

**Owner:** human, optional (`docs/ops/l1-human-task.md`, 30-min hard stop). **Status:** nothing in this file is verified. These are leads for the 10:40–11:30 window.
The map ships with **geometry only** (verified, doc 02) unless a layer passes gate **G-LAYER**.

## Layers we want

| Layer | Question it answers | Why it matters for FairWatt |
|---|---|---|
| **L1** Utility serving each town | "Which basic-service rate applies to me?" | Click a town to prefill the utility. Lets the map show next-reset risk by town |
| **L2** Municipal aggregation program | "Does my town buy power for me?" | About half of customers are in aggregation (S3: ~51% as of Mar 2026). Those users compare against the town's rate, not basic service |
| **L3** Derived: reset change by town | "How much will my town's default rate move on Feb 1?" | L1 × forecast. Ships only if L1 ships |
| **MLP** Municipal light plant towns | "Is this app even for me?" | These towns are not served by the four utilities [U: the list needs a source] |

## Leads to check (in this order)
1. **DPU consumer lookup ("find my electric, gas and water company").** Mentioned in our earlier research as prior art. Check whether it exposes a town list or table, not just a search box.
2. **MassGIS.** Look for an electric-utility service-area dataset. If one exists, it would join on town id or geometry. `gis.data.mass.gov` was not reachable from the sandbox, so use a human browser.
3. **Utility websites.** Each utility may publish a list of communities served.
4. **Mass.gov municipal aggregation pages.** Look for a statewide list of active programs. S2 says "almost 70% of Massachusetts municipalities have a program" and points readers to their town website; it gave no table.
5. **Town aggregation sites.** These are per-town (supplier, rate, contract end). Only feasible for a handful of demo towns, never the whole state.

## Protocol (non-negotiable)
1. Every value carries `sources[].url` and `retrieved` (see `MapLayerFile` in `contracts/types.ts`).
2. Coverage must be ≥ 95% of 351 towns. Towns that are genuinely mixed (served by more than one utility) are coded `MIXED`, not guessed.
3. **Spot-check 10 random towns** against a second independent source. More than 1 mismatch = fail.
4. **No inference.** "Neighbouring towns are all Eversource, so this one probably is too" is forbidden.
5. Time-box: 60 minutes. On fail, return `blocked` with the best lead. The map stays a locator and the UI copy says "pick your utility from your bill".

## What the UI does with each outcome

| L1 | L2 | Map shows |
|---|---|---|
| fail | fail | Town locator plus a caption with the statewide aggregation share (S3). The utility is chosen manually |
| pass | fail | Towns colored by utility (4 categorical colors + gray for MLP/unknown). Click prefills the utility |
| pass | pass | Plus a toggle: "towns with an aggregation program" (yes/no). The calculator reminds aggregation users their rate is the town contract |
| fail | pass | L2 toggle only |
