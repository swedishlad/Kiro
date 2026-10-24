# L1 town → utility lookup: a human task (was the layer-research agent)

**Who / when:** a human teammate, 10:40–11:30 (brainstorm window) or any idle slot. **Hard stop 30 min.** No agent, no credits.
If it doesn't pass, nothing breaks: the map is a locator and the user picks one of 4 utilities.

**Mission:** find verifiable town-level data for L1 (utility per town) and then L2 (municipal aggregation), or prove within 60 minutes that we can't.


## Read first
`docs/apis/06-map-layer-candidate-sources.md` (leads + protocol), `docs/apis/02-lmec-town-boundaries.md` §4 (join keys), `contracts/types.ts` (`MapLayerFile`, `L1Value`, `L2Value`).

## Steps
1. Work through the leads in doc 06 in order. For each one, record in `research/map_layers.md`: URL, date, what it contains, format, coverage estimate and terms of use.
2. If a source covers ≥ 95% of towns:
   - Build `data/build/layers/L1_utility.json`, joining on `massgis_town_id` (or `GEOID`).
   - Code mixed towns as `MIXED` and municipal-light-plant towns as `MUNICIPAL_LIGHT_PLANT`, each with a source.
3. **Spot check:** pick 10 random towns (`python3 -c "import random; random.seed(2026); print(random.sample(range(1,352),10))"`) and confirm each against a **different** source. Record the mismatches.
4. Repeat for L2 only if L1 passed and there is time left in your box.

## Done when
Either:
- **L1 file + spot-check table:** ≤ 1 mismatch, coverage stated. That's G-LAYER pass.
- **`blocked`** with the best lead and what a human would need to do (e.g. "the DPU lookup is search-only; needs 351 manual queries").

## Forbidden
Inferring a town's utility from its neighbors, from memory, or from a map image. Scraping anything whose terms forbid it. Any number without a source URL and retrieval date.
