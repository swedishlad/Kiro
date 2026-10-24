import { useEffect, useMemo, useState } from "react";

import { HBarChart } from "../components/BarChart.tsx";
import { useTheme, usePersistentState } from "../components/hooks.ts";
import { TownMap } from "../components/TownMap.tsx";
import { Callout, Card, DataTable, Filter, Legend, Segmented, type TooltipRow } from "../components/ui.tsx";
import { fmtCompact, fmtNum, fmtSignedPct } from "../data/format.ts";
import { loadMapConsumption, towns } from "../data/load.ts";
import { ZONES, ZONE_NAMES, type MapConsumption, type Town, type Zone } from "../data/model.ts";

const LAYERS = ["zone", "population", "growth"] as const;
type Layer = (typeof LAYERS)[number];
const LAYER_LABEL: Record<Layer, string> = { zone: "Load zone", population: "Population", growth: "Growth 2020–24" };

const ZONE_COLOR: Record<Zone, string> = { NEMA: "var(--series-1)", SEMA: "var(--series-2)", WCMA: "var(--series-3)" };

// Sequential blue for population (log-spaced classes); light->dark on light, dark->light on dark,
// so small towns always recede toward the surface.
const POP_BREAKS = [1000, 3000, 7500, 15000, 30000, 60000];
const POP_LIGHT = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"];
const POP_DARK = ["#13304f", "#184f95", "#256abf", "#3987e5", "#6da7ec", "#9ec5f4", "#cde2fb"];

// Diverging growth: orange = shrinking, blue = growing, neutral grey midpoint; three steps per arm.
const GROWTH_BREAKS = [-0.04, -0.02, -0.005, 0.005, 0.02, 0.04];
const GROWTH_LIGHT = ["#c9501f", "#ef9a6e", "#f6cdb7", "#e5e5ea", "#b7d3f6", "#5598e7", "#1c5cab"];
const GROWTH_DARK = ["#f0956a", "#b8521f", "#6b3418", "#3a3a3c", "#1c4a80", "#2f74c9", "#86b6ef"];

function classOf(v: number, breaks: number[]): number {
  let i = 0;
  while (i < breaks.length && v >= breaks[i]) i++;
  return i;
}

const growth = (t: Town) => t.pop2024 / t.pop2020 - 1;

/** Pre-select this zone on the Grid tab (same key its area filter persists under). */
function rememberGridArea(z: Zone) {
  try {
    localStorage.setItem("fw-grid-area", z);
  } catch {
    /* storage unavailable: the Grid tab just opens on its default */
  }
}

export default function Towns() {
  const { dark } = useTheme();
  const [layer, setLayer] = usePersistentState<Layer>("towns-layer", "zone", LAYERS);
  const [query, setQuery] = useState("");
  const [zone, setZone] = useState<Zone | "all">("all");
  const [county, setCounty] = useState<string>("all");
  const [selected, setSelected] = useState<number | null>(null);
  const [modeled, setModeled] = useState<MapConsumption | null>(null);

  useEffect(() => {
    let live = true;
    loadMapConsumption().then((m) => live && setModeled(m));
    return () => {
      live = false;
    };
  }, []);

  const byId = useMemo(() => new Map(towns.map((t) => [t.id, t])), []);
  const counties = useMemo(() => [...new Set(towns.map((t) => t.county))].sort(), []);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return towns.filter((t) => (zone === "all" || t.zone === zone) && (county === "all" || t.county === county) && (!q || t.name.toLowerCase().includes(q)));
  }, [query, zone, county]);
  const inFilter = useMemo(() => new Set(filtered.map((t) => t.id)), [filtered]);
  const filtering = filtered.length !== towns.length;

  const popRamp = dark ? POP_DARK : POP_LIGHT;
  const growthRamp = dark ? GROWTH_DARK : GROWTH_LIGHT;
  const fillFor = (id: number) => {
    const t = byId.get(id);
    if (!t) return "var(--surface-2)";
    if (filtering && !inFilter.has(id)) return "var(--surface-2)";
    if (layer === "zone") return ZONE_COLOR[t.zone];
    if (layer === "population") return popRamp[classOf(t.pop2024, POP_BREAKS)];
    return growthRamp[classOf(growth(t), GROWTH_BREAKS)];
  };

  const rowsFor = (id: number): TooltipRow[] => {
    const t = byId.get(id)!;
    return [
      { key: "rect", color: ZONE_COLOR[t.zone], value: t.zone, label: ZONE_NAMES[t.zone] },
      { value: fmtNum(t.pop2024), label: "people (2024)" },
      { value: fmtSignedPct(growth(t)), label: "since 2020" },
    ];
  };

  const sel = selected !== null ? byId.get(selected) : undefined;
  const zoneTotals = ZONES.map((z) => {
    const list = filtered.filter((t) => t.zone === z);
    return { zone: z, towns: list.length, pop: list.reduce((s, t) => s + t.pop2024, 0) };
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Cities and towns</h1>
          <p className="page-lede">
            All 351 Massachusetts municipalities, the ISO New England load zone each sits in, and how their populations changed. Find your
            town to see which zone's grid data applies to it.
          </p>
        </div>
      </div>

      <div className="filters" role="group" aria-label="Town filters">
        <Filter label="Find">
          <input className="input input-search" type="search" placeholder="Town name" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search towns" />
        </Filter>
        <Filter label="Zone">
          <select className="select" value={zone} onChange={(e) => setZone(e.target.value as Zone | "all")} aria-label="Load zone">
            <option value="all">All zones</option>
            {ZONES.map((z) => (
              <option key={z} value={z}>
                {z} · {ZONE_NAMES[z]}
              </option>
            ))}
          </select>
        </Filter>
        <Filter label="County">
          <select className="select" value={county} onChange={(e) => setCounty(e.target.value)} aria-label="County">
            <option value="all">All counties</option>
            {counties.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Filter>
        <span className="tile-meta">
          {filtered.length} of {towns.length} towns
        </span>
      </div>

      <div className="grid">
        <section className="card span-12" aria-label="Town map">
          <div className="card-head">
            <div>
              <h3 className="card-title">Map: {LAYER_LABEL[layer].toLowerCase()}</h3>
              <p className="card-sub">Hover for details, click to pin a town.</p>
            </div>
            <div className="card-actions">
              <Segmented label="Map layer" value={layer} onChange={setLayer} options={LAYERS.map((l) => ({ value: l, label: LAYER_LABEL[l] }))} />
            </div>
          </div>
          <div className="map-layout">
            <div>
              <MapLegend layer={layer} popRamp={popRamp} growthRamp={growthRamp} />
              <TownMap
                fillFor={fillFor}
                selected={selected}
                onSelect={setSelected}
                titleFor={(id) => {
                  const t = byId.get(id)!;
                  return `${t.name}, ${t.county} County`;
                }}
                rowsFor={rowsFor}
                ariaLabel={`Map of Massachusetts towns coloured by ${LAYER_LABEL[layer].toLowerCase()}`}
              />
            </div>
            <aside className="town-panel" aria-live="polite">
              {sel ? (
                <>
                  <div>
                    <p className="filter-label">Selected town</p>
                    <h3 style={{ fontSize: 20 }}>{sel.name}</h3>
                    <p className="card-sub">{sel.county} County</p>
                  </div>
                  <dl className="kv">
                    <dt>Load zone</dt>
                    <dd>
                      {sel.zone} · {ZONE_NAMES[sel.zone]}
                    </dd>
                    <dt>Population 2024</dt>
                    <dd>{fmtNum(sel.pop2024)}</dd>
                    <dt>Population 2020</dt>
                    <dd>{fmtNum(sel.pop2020)}</dd>
                    <dt>Change</dt>
                    <dd>{fmtSignedPct(growth(sel))}</dd>
                    <dt>Census GEOID</dt>
                    <dd>{sel.geoid}</dd>
                  </dl>
                  <a href="#/grid" onClick={() => rememberGridArea(sel.zone)}>
                    See {sel.zone} grid regimes →
                  </a>
                  <button type="button" className="theme-toggle" onClick={() => setSelected(null)} style={{ justifySelf: "start" }}>
                    Clear selection
                  </button>
                </>
              ) : (
                <>
                  <p className="filter-label">Zones</p>
                  <HBarChart
                    rows={zoneTotals.map((z) => ({ label: z.zone, sub: `${z.towns} towns`, value: z.pop, color: ZONE_COLOR[z.zone] }))}
                    valueFormat={(v) => fmtCompact(v, 2)}
                    barHeight={14}
                    gap={10}
                    ariaLabel="2024 population by load zone"
                  />
                  <p className="tile-meta">2024 population{filtering ? " of the filtered towns" : ""}. Pick a town on the map or in the table.</p>
                </>
              )}
            </aside>
          </div>
        </section>

        <Card className="span-8" title="All towns" subtitle="Sort by any column; click a row to pin it on the map." source="U.S. Census population estimates (2020 base, 2024 vintage); zone assignment from the backend's town table (approximate).">
          <DataTable
            caption="Massachusetts towns"
            maxHeight={520}
            rowKey={(t) => t.id}
            selected={selected}
            onRowClick={(t) => setSelected(t.id)}
            initialSort={{ key: "p24", dir: -1 }}
            columns={[
              { key: "n", label: "Town", render: (t: Town) => t.name, sort: (t) => t.name },
              { key: "c", label: "County", render: (t) => t.county, sort: (t) => t.county },
              {
                key: "z",
                label: "Zone",
                render: (t) => (
                  <span className="row" style={{ gap: 6 }}>
                    <span className="key-rect" style={{ background: ZONE_COLOR[t.zone] }} />
                    {t.zone}
                  </span>
                ),
                sort: (t) => t.zone,
              },
              { key: "p24", label: "Pop. 2024", align: "r", render: (t) => fmtNum(t.pop2024), sort: (t) => t.pop2024 },
              { key: "g", label: "Since 2020", align: "r", render: (t) => fmtSignedPct(growth(t)), sort: (t) => growth(t) },
            ]}
            rows={filtered}
          />
        </Card>

        <Card className="span-4" title="Why the map isn't coloured by usage">
          <div className="stack">
            <Callout>
              There is no verified per-town electricity-use source: RECS 2020 has no town field and EIA-861M is statewide. The backend's map
              artifact therefore gives every town the same modeled level
              {modeled ? (
                <>
                  {" "}
                  — <strong>{fmtNum(modeled.towns[0].annualKwhModel)} kWh/yr</strong>, class {modeled.towns[0].class} —
                </>
              ) : null}{" "}
              and we don't paint differences that aren't in the data.
            </Callout>
            <p className="prose">
              What does differ by town is the ISO-NE load zone, which decides which zone's grid regime applies, and population. Use the
              Usage tab's “home like yours” estimate for your own household.
            </p>
          </div>
        </Card>
      </div>
    </>
  );
}

function MapLegend({ layer, popRamp, growthRamp }: { layer: Layer; popRamp: string[]; growthRamp: string[] }) {
  if (layer === "zone") {
    return <Legend items={ZONES.map((z) => ({ label: `${z} · ${ZONE_NAMES[z]}`, color: ZONE_COLOR[z], key: "rect" as const }))} />;
  }
  const ramp = layer === "population" ? popRamp : growthRamp;
  const labels =
    layer === "population"
      ? ["<1K", "1K+", "3K+", "7.5K+", "15K+", "30K+", "60K+"]
      : ["<−4%", "−4%", "−2%", "±0.5%", "+0.5%", "+2%", "+4%"];
  return (
    <div style={{ maxWidth: 360, marginBottom: 10 }}>
      <span className="tile-meta">{layer === "population" ? "People, 2024" : "Population change 2020–2024 (orange shrinking, blue growing)"}</span>
      <div className="scale-legend" aria-hidden="true">
        {ramp.map((c) => (
          <span key={c} style={{ background: c }} />
        ))}
      </div>
      <div className="scale-labels" aria-hidden="true">
        {labels.map((l) => (
          <span key={l}>{l}</span>
        ))}
      </div>
    </div>
  );
}
