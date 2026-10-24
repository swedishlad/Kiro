import { useEffect, useMemo, useState } from "react";

import { HBarChart } from "../components/BarChart.tsx";
import { useTheme } from "../components/hooks.ts";
import { TownMap } from "../components/TownMap.tsx";
import { Card, DataTable, Filter, type TooltipRow } from "../components/ui.tsx";
import { fmtCompact, fmtNum, fmtSignedPct, ymLabel } from "../data/format.ts";
import { loadTownForecast, towns } from "../data/load.ts";
import { ZONES, ZONE_NAMES, type Town, type TownForecastDoc, type Zone } from "../data/model.ts";

const ZONE_COLOR: Record<Zone, string> = { NEMA: "var(--series-1)", SEMA: "var(--series-2)", WCMA: "var(--series-3)" };

// Sequential blue (log-spaced classes), same direction in both themes: smallest forecast = white,
// largest = strong blue. Dark theme starts a touch off-white so the lowest class stays visible
// against the surface, but the ramp still runs light -> strong blue (never reversed).
const FORECAST_LIGHT = ["#ffffff", "#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#1c5cab", "#0d366b"];
const FORECAST_DARK = ["#eef5ff", "#c3dcfa", "#93bdf2", "#5a9ae9", "#2f7ae0", "#1c5cab", "#0d3a7a"];

// Log-spaced class breaks (MWh) spanning the real p50 range (~199 MWh .. ~2.4M MWh): seven classes,
// Boston in the top class, the smallest towns in the bottom.
const FORECAST_BREAKS = [1000, 5000, 20000, 75000, 250000, 800000];
const FORECAST_LABELS = ["<1 GWh", "1 GWh+", "5 GWh+", "20 GWh+", "75 GWh+", "250 GWh+", "800 GWh+"];

function classOf(v: number, breaks: number[]): number {
  let i = 0;
  while (i < breaks.length && v >= breaks[i]) i++;
  return i;
}

const growth = (t: Town) => t.pop2024 / t.pop2020 - 1;

/** MWh -> compact label with a sensible unit (GWh above 1,000 MWh). */
function fmtMwh(mwh: number): string {
  return mwh >= 1000 ? `${fmtCompact(mwh / 1000, 1)} GWh` : `${fmtCompact(mwh, 0)} MWh`;
}

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
  const [query, setQuery] = useState("");
  const [zone, setZone] = useState<Zone | "all">("all");
  const [county, setCounty] = useState<string>("all");
  const [selected, setSelected] = useState<number | null>(null);
  const [doc, setDoc] = useState<TownForecastDoc | null>(null);

  useEffect(() => {
    let live = true;
    loadTownForecast().then((d) => {
      if (live) setDoc(d);
    });
    return () => {
      live = false;
    };
  }, []);

  const byId = useMemo(() => new Map(towns.map((t) => [t.id, t])), []);
  const fcById = useMemo(() => new Map((doc?.towns ?? []).map((t) => [t.townId, t])), [doc]);
  const counties = useMemo(() => [...new Set(towns.map((t) => t.county))].sort(), []);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return towns.filter((t) => (zone === "all" || t.zone === zone) && (county === "all" || t.county === county) && (!q || t.name.toLowerCase().includes(q)));
  }, [query, zone, county]);
  const inFilter = useMemo(() => new Set(filtered.map((t) => t.id)), [filtered]);
  const filtering = filtered.length !== towns.length;

  const horizonLabel = doc ? `${ymLabel(doc.horizon[0])} – ${ymLabel(doc.horizon[doc.horizon.length - 1])}` : "Nov 2026 – Apr 2027";

  const ramp = dark ? FORECAST_DARK : FORECAST_LIGHT;
  const fillFor = (id: number) => {
    if (filtering && !inFilter.has(id)) return "var(--surface-2)";
    const fc = fcById.get(id);
    if (!fc) return "var(--surface-2)";
    return ramp[classOf(fc.forecast6mMWh.p50, FORECAST_BREAKS)];
  };

  const rowsFor = (id: number): TooltipRow[] => {
    const t = byId.get(id)!;
    const fc = fcById.get(id);
    const rows: TooltipRow[] = [{ key: "rect", color: ZONE_COLOR[t.zone], value: t.zone, label: ZONE_NAMES[t.zone] }];
    if (fc) {
      rows.push(
        { value: fmtMwh(fc.forecast6mMWh.p50), label: "modeled 6-mo forecast (median)" },
        { value: `${fmtMwh(fc.forecast6mMWh.p10)} – ${fmtMwh(fc.forecast6mMWh.p90)}`, label: "80% range (p10–p90)" },
        { value: fmtSignedPct(fc.changeVsLastYearPct / 100), label: "vs same months last year" },
      );
    } else {
      rows.push({ value: fmtNum(t.pop2024), label: "people (2024)" });
    }
    return rows;
  };

  const sel = selected !== null ? byId.get(selected) : undefined;
  const selFc = selected !== null ? fcById.get(selected) : undefined;
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
            All 351 Massachusetts municipalities, coloured by their modeled 6-month electricity forecast ({horizonLabel}). Each town is
            modeled from its population share of its ISO New England zone — no public town-level metered data exists, so this is a modeled
            estimate, not a live feed{doc ? ` (as of ${doc.asOf})` : ""}.
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
              <h3 className="card-title">Map: 6-month forecast</h3>
              <p className="card-sub">Modeled electricity forecast ({horizonLabel}). Hover for details, click to pin a town.</p>
            </div>
          </div>
          <div className="map-layout">
            <div>
              <MapLegend ramp={ramp} loading={!doc} horizonLabel={horizonLabel} />
              <TownMap
                fillFor={fillFor}
                selected={selected}
                onSelect={setSelected}
                titleFor={(id) => {
                  const t = byId.get(id)!;
                  return `${t.name}, ${t.county} County`;
                }}
                rowsFor={rowsFor}
                ariaLabel="Map of Massachusetts towns coloured by their modeled 6-month electricity forecast"
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
                    {selFc ? (
                      <>
                        <dt>Modeled 6-mo forecast</dt>
                        <dd>
                          {fmtMwh(selFc.forecast6mMWh.p50)} <span className="tile-meta">median</span>
                        </dd>
                        <dt>80% range (p10–p90)</dt>
                        <dd>
                          {fmtMwh(selFc.forecast6mMWh.p10)} – {fmtMwh(selFc.forecast6mMWh.p90)}
                        </dd>
                        <dt>Horizon</dt>
                        <dd>{horizonLabel}</dd>
                        <dt>vs last year</dt>
                        <dd>{fmtSignedPct(selFc.changeVsLastYearPct / 100)}</dd>
                      </>
                    ) : (
                      <>
                        <dt>Forecast</dt>
                        <dd>{doc ? "Not available" : "Loading…"}</dd>
                      </>
                    )}
                    <dt>Population 2024</dt>
                    <dd>{fmtNum(sel.pop2024)}</dd>
                    <dt>Population 2020</dt>
                    <dd>{fmtNum(sel.pop2020)}</dd>
                    <dt>Change</dt>
                    <dd>{fmtSignedPct(growth(sel))}</dd>
                    <dt>Census GEOID</dt>
                    <dd>{sel.geoid}</dd>
                  </dl>
                  {selFc ? (
                    <p className="tile-meta">Modeled from {sel.name}'s population share of its ISO-NE zone; vs the same months a year earlier (observed).</p>
                  ) : null}
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
                  <p className="tile-meta">
                    2024 population{filtering ? " of the filtered towns" : ""}. The map colours each town by its modeled 6-month electricity
                    forecast ({horizonLabel}) — pick a town on the map or in the table for its forecast median and range.
                  </p>
                </>
              )}
            </aside>
          </div>
        </section>

        <Card
          className="span-12"
          title="All towns"
          subtitle="Sort by any column; click a row to pin it on the map."
          source={
            doc
              ? `Modeled 6-month forecast from the backend town table (towns_metrics.json, ${doc.method}, zones ${doc.zoneMapping}, as of ${doc.asOf}). U.S. Census population estimates (2020 base, 2024 vintage); zone assignment from the backend's town table (approximate).`
              : "Modeled 6-month forecast from the backend town table (towns_metrics.json, population share of zone). U.S. Census population estimates (2020 base, 2024 vintage); zone assignment from the backend's town table (approximate)."
          }
        >
          <DataTable
            caption="Massachusetts towns"
            maxHeight={520}
            rowKey={(t) => t.id}
            selected={selected}
            onRowClick={(t) => setSelected(t.id)}
            initialSort={{ key: "f", dir: -1 }}
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
              {
                key: "f",
                label: "6-mo forecast",
                align: "r",
                render: (t) => {
                  const fc = fcById.get(t.id);
                  return fc ? fmtMwh(fc.forecast6mMWh.p50) : "—";
                },
                sort: (t) => fcById.get(t.id)?.forecast6mMWh.p50 ?? -1,
              },
              { key: "p24", label: "Pop. 2024", align: "r", render: (t) => fmtNum(t.pop2024), sort: (t) => t.pop2024 },
              { key: "g", label: "Since 2020", align: "r", render: (t) => fmtSignedPct(growth(t)), sort: (t) => growth(t) },
            ]}
            rows={filtered}
          />
        </Card>
      </div>
    </>
  );
}

function MapLegend({ ramp, loading, horizonLabel }: { ramp: string[]; loading: boolean; horizonLabel: string }) {
  return (
    <div style={{ maxWidth: 360, marginBottom: 10 }}>
      <span className="tile-meta">
        Modeled 6-month forecast ({horizonLabel}), MWh{loading ? " — loading…" : ""}
      </span>
      <div className="scale-legend" aria-hidden="true">
        {ramp.map((c) => (
          <span key={c} style={{ background: c }} />
        ))}
      </div>
      <div className="scale-labels" aria-hidden="true">
        {FORECAST_LABELS.map((l) => (
          <span key={l}>{l}</span>
        ))}
      </div>
    </div>
  );
}
