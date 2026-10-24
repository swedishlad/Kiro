import { useEffect, useMemo, useState } from "react";

import { usePersistentState } from "../components/hooks.ts";
import { REGIMES, REGIME_META, RegimeBadge, RegimeIcon, RegimeLegend, fromGrid, type Regime } from "../components/regime.tsx";
import { RegimeScatter } from "../components/Scatter.tsx";
import { RegimeShareColumns, RegimeStackBar } from "../components/Stacked.tsx";
import { Card, ChartCard, Filter, Segmented } from "../components/ui.tsx";
import { dateLabel, fmtNum, fmtPct, ymLabel } from "../data/format.ts";
import { loadGrid, zonePop2024, type GridBundle } from "../data/load.ts";
import { ZONES, ZONE_NAMES, type Area } from "../data/model.ts";

const AREAS: Area[] = ["MA", "NEMA", "SEMA", "WCMA"];
const YEARS = ["all", "2019", "2020", "2021", "2022", "2023"] as const;
type YearFilter = (typeof YEARS)[number];

const toProbs = (p: number[]): Record<Regime, number> => ({ low: p[0], mid: p[1], high: p[2] });

interface Day {
  date: string;
  gwh: number;
  tempF: number;
  regime: Regime | null;
}

function dailyFor(bundle: GridBundle, area: Area): Day[] {
  const timeline = bundle.regimes.areas.find((a) => a.area === area)!.timeline;
  const regimeByDate = new Map(timeline.map((t) => [t.date, fromGrid(t.color)]));
  const byDate = new Map<string, { gwh: number; temp: number; w: number }>();
  const totalPop = ZONES.reduce((s, z) => s + zonePop2024[z], 0);
  for (const r of bundle.daily) {
    if (area !== "MA" && r.zone !== area) continue;
    // MA = summed load and population-weighted temperature, the backend's `with_ma`.
    const w = area === "MA" ? zonePop2024[r.zone] / totalPop : 1;
    const cur = byDate.get(r.date) ?? { gwh: 0, temp: 0, w: 0 };
    cur.gwh += r.rtMwh / 1000;
    cur.temp += w * r.tempF;
    cur.w += w;
    byDate.set(r.date, cur);
  }
  return [...byDate.entries()]
    .filter(([date]) => regimeByDate.has(date))
    .map(([date, v]) => ({ date, gwh: v.gwh, tempF: v.temp / v.w, regime: regimeByDate.get(date) ?? null }));
}

export default function Grid() {
  const [bundle, setBundle] = useState<GridBundle | null>(null);
  const [area, setArea] = usePersistentState<Area>("grid-area", "MA", AREAS);
  const [year, setYear] = usePersistentState<YearFilter>("grid-year", "all", YEARS);

  useEffect(() => {
    let live = true;
    loadGrid().then((b) => live && setBundle(b));
    return () => {
      live = false;
    };
  }, []);

  const a = bundle?.regimes.areas.find((x) => x.area === area);
  const days = useMemo(() => (bundle ? dailyFor(bundle, area) : []), [bundle, area]);
  const shownDays = useMemo(() => (year === "all" ? days : days.filter((d) => d.date.startsWith(year))), [days, year]);
  const monthly = useMemo(() => (a ? (year === "all" ? a.monthly : a.monthly.filter((m) => m.ym.startsWith(year))) : []), [a, year]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Grid load against the weather</h1>
          <p className="page-lede">
            ISO New England's daily load for the three Massachusetts zones, adjusted for temperature and weekends. A hidden Markov model
            sorts each day into a regime: <strong>Low</strong> when use ran below what the weather explains, <strong>High</strong> when it
            ran above.
          </p>
        </div>
      </div>

      <div className="filters" role="group" aria-label="Grid filters">
        <Filter label="Area">
          <Segmented label="Area" value={area} onChange={setArea} options={AREAS.map((x) => ({ value: x, label: x, title: ZONE_NAMES[x] }))} />
        </Filter>
        <Filter label="Year">
          <Segmented label="Year" value={year} onChange={setYear} options={YEARS.map((y) => ({ value: y, label: y === "all" ? "2019–2023" : y }))} />
        </Filter>
        <span className="tile-meta">{ZONE_NAMES[area]}</span>
      </div>

      {!bundle || !a ? (
        <div className="loading">Loading ISO New England data…</div>
      ) : (
        <div className="grid">
          <Card
            className="span-5"
            title={`Regime on ${dateLabel(a.current.date)}`}
            subtitle="The last day in the ISO-NE files in this repo, and where the model expects the regime to be after 7, 30 and 90 days."
            source="Outlook = today's state probabilities × the transition matrix raised to the horizon. Not a weather forecast."
          >
            <div className="stack">
              <div className="row">
                <RegimeBadge regime={fromGrid(a.current.color)} large />
                <span className="tile-meta">{fmtPct(Math.max(...a.current.probs))} probability</span>
              </div>
              <RegimeStackBar probs={toProbs(a.current.probs)} ariaLabel="State probabilities today" />
              {a.outlook.map((o) => (
                <div key={o.days} className="stack" style={{ gap: 4 }}>
                  <span className="tile-label">In {o.days} days</span>
                  <RegimeStackBar probs={toProbs(o.probs)} height={20} ariaLabel={`State probabilities in ${o.days} days`} />
                </div>
              ))}
              <RegimeLegend />
            </div>
          </Card>

          <ChartCard
            className="span-7"
            title="Daily load vs temperature"
            subtitle={`${area}, ${year === "all" ? "2019–2023" : year}. The U-shape is heating on the left and cooling on the right; the regime is how far a day sat from that curve.`}
            source="ISO-NE real-time load (all customer classes), daily mean temperature for the zone. MA temperature is weighted by 2024 zone population."
            table={{
              columns: [
                { key: "d", label: "Date", render: (d) => d.date, sort: (d) => d.date },
                { key: "t", label: "Temp °F", align: "r", render: (d) => fmtNum(d.tempF, 1), sort: (d) => d.tempF },
                { key: "g", label: "Load GWh", align: "r", render: (d) => fmtNum(d.gwh, 1), sort: (d) => d.gwh },
                { key: "r", label: "Regime", render: (d) => (d.regime ? <RegimeBadge regime={d.regime} /> : "—") },
              ],
              rows: [...shownDays].reverse(),
            }}
          >
            <RegimeLegend labels={{ low: "Low (below weather-expected)", mid: "Mid", high: "High (above)" }} />
            <RegimeScatter
              points={shownDays.map((d) => ({ x: d.tempF, y: d.gwh, regime: d.regime }))}
              xFormat={(v) => `${fmtNum(v)}°`}
              yFormat={(v) => fmtNum(v)}
              xTitle="Daily mean temperature (°F)"
              yTitle="Load, GWh per day"
              titleFor={(i) => dateLabel(shownDays[i].date)}
              rowsFor={(i) => [
                { value: `${fmtNum(shownDays[i].gwh, 1)} GWh`, label: "load" },
                { value: `${fmtNum(shownDays[i].tempF, 1)}°F`, label: "temperature" },
                ...(shownDays[i].regime ? [{ key: <RegimeIcon regime={shownDays[i].regime!} />, value: REGIME_META[shownDays[i].regime!].label, label: "regime" }] : []),
              ]}
              ariaLabel={`Scatter of daily load against temperature for ${area}`}
            />
          </ChartCard>

          <ChartCard
            className="span-12"
            title="Share of days in each regime, by month"
            subtitle="High sits on the baseline. Long red runs mean demand stayed above what the weather explains — the model's “too much” state."
            source="Forward-filtered: each day's regime uses only data up to that day (leakage test: pass)."
            table={{
              columns: [
                { key: "m", label: "Month", render: (m) => ymLabel(m.ym), sort: (m) => m.ym },
                { key: "l", label: "Low", align: "r", render: (m) => fmtPct(m.green) },
                { key: "g", label: "Mid", align: "r", render: (m) => fmtPct(m.grey) },
                { key: "h", label: "High", align: "r", render: (m) => fmtPct(m.red), sort: (m) => m.red },
              ],
              rows: [...monthly].reverse(),
            }}
          >
            <RegimeLegend labels={{ low: "Low days", mid: "Mid days", high: "High days" }} />
            <RegimeShareColumns
              months={monthly.map((m) => m.ym)}
              shares={monthly.map((m) => ({ low: m.green, mid: m.grey, high: m.red }))}
              titleFor={(i) => ymLabel(monthly[i].ym)}
              ariaLabel={`Monthly share of days in each regime for ${area}`}
            />
          </ChartCard>

          <Card className="span-7" title="The three regimes" subtitle={`${area}: average gap from weather-expected load and how long each regime tends to last.`}>
            <div className="table-wrap" style={{ maxHeight: "none" }}>
              <table className="data">
                <caption className="sr-only">Regime statistics for {area}</caption>
                <thead>
                  <tr>
                    <th scope="col">Regime</th>
                    <th scope="col" className="r">
                      Avg vs expected
                    </th>
                    <th scope="col" className="r">
                      Spread (sd)
                    </th>
                    <th scope="col" className="r">
                      Typical run
                    </th>
                    <th scope="col" className="r">
                      Share of days
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {a.states.map((s) => (
                    <tr key={s.color}>
                      <td>
                        <RegimeBadge regime={fromGrid(s.color)} />
                      </td>
                      <td className="r">
                        {s.meanResidualGWh > 0 ? "+" : "−"}
                        {fmtNum(Math.abs(s.meanResidualGWh), 1)} GWh/day
                      </td>
                      <td className="r">{fmtNum(s.sdResidualGWh, 1)} GWh</td>
                      <td className="r">{fmtNum(s.expectedDurationDays, 0)} days</td>
                      <td className="r">{fmtPct(s.shareOfDays)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="filter-label" style={{ margin: "14px 0 6px" }}>
              Chance of switching, day to day
            </p>
            <div className="table-wrap" style={{ maxHeight: "none" }}>
              <table className="data">
                <caption className="sr-only">Daily transition probabilities for {area}</caption>
                <thead>
                  <tr>
                    <th scope="col">Today → tomorrow</th>
                    {REGIMES.map((r) => (
                      <th key={r} scope="col" className="r">
                        {REGIME_META[r].label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {a.transition.map((row, i) => (
                    <tr key={i}>
                      <th scope="row" style={{ fontWeight: 500 }}>
                        <span className="row" style={{ gap: 4 }}>
                          <RegimeIcon regime={REGIMES[i]} />
                          {REGIME_META[REGIMES[i]].label}
                        </span>
                      </th>
                      {row.map((p, j) => (
                        <td key={j} className="r">
                          {fmtPct(p, 1)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="span-5" title="How to read this" source={bundle.regimes.method}>
            <div className="prose">
              <ul>
                {bundle.regimes.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
              <p>
                Zones: <strong>NEMA</strong> {ZONE_NAMES.NEMA}, <strong>SEMA</strong> {ZONE_NAMES.SEMA}, <strong>WCMA</strong>{" "}
                {ZONE_NAMES.WCMA}. <strong>MA</strong> adds the three together.
              </p>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
