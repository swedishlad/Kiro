# Spec · F3 Map (owners: geo-map for data, ui-builder for the component)

## 1. Purpose
FairWatt Home uses the map as the **town picker** in card 1 (search box first, map as the visual way to choose). It shows where the user lives and, **only with a verified layer**, what applies there. A map with no trustworthy data on it is decoration. If L1 fails, the map is a locator and nothing more, and the copy says so.

## 2. Geometry (done; see docs/apis/02)
- `data/build/towns.json`: 351 towns as pre-projected SVG paths in a 680×420 panel, about 108 KB raw / 37 KB gzip.
- Preview: `img/map_preview_300m.png`, `img/map_preview_zoom.png`.

## 3. Component behavior

| Interaction | Behavior |
|---|---|
| Render | One `<svg viewBox="0 0 680 420" role="img" aria-label="Map of Massachusetts towns">`; one `<path>` per town; thin strokes; responsive width, height from the aspect ratio |
| Hover / focus | Town outline thickens; tooltip shows the town name (+ utility if L1) |
| Click / Enter | Selects the town. If L1 passed and the town maps to one utility, prefill the utility select (the user can still change it) |
| Search | Text box with town-name autocomplete on `town.census` (mixed case, e.g. "Boston"; `town.name` is the upper-case MassGIS name, for joins only). Same result as a click. Keyboard users need this: 351 tiny paths are not tab-able in practice |
| Legend | Only when a layer is on: utility categorical colors (max 4 + gray "municipal light plant / unknown") |
| Table fallback | `<details>` → table of town, utility, source; covers screen readers and "show me the data" judges |
| Caption | Always shows the source: "Boundaries: Leventhal Map & Education Center (MassGIS/Census). Utility layer: {source, date}" |

## 4. Color rules
- Categorical, max 5 hues: one per utility plus neutral gray. Colors are defined as CSS tokens with light and dark values (see ui.md).
- **Never color by a number we don't have.** L3 (reset change) uses a diverging scale centered at 0 and appears only if L1 and a skill-passing forecast both exist.

## 5. Gates
- **G-GEO** (automatic part from build_geo.mjs + a human visual check).
- **G-LAYER** per layer (docs/apis/06). Optional: the layer is now a 30-minute human task in the 10:40–11:30 window (`research/map_layers.md`); if it doesn't pass, the map is a locator and the user picks the utility.
- **G-UI** includes the map at 375 px width: towns visible, tooltip usable by touch (tap = select).
