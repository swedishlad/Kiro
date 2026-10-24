import { useEffect, useMemo, useState } from "react";

import { usePersistentState } from "../components/hooks.ts";
import { FanChart } from "../components/FanChart.tsx";
import { RegimeNowcast } from "../components/RegimeNowcast.tsx";
import { RANGE_LABELS, RANGE_SHORT, REGIMES, RegimeBadge, RegimeIcon, RegimeLegend, fromGrid, type Regime } from "../components/regime.tsx";
import { RegimeShareColumns, RegimeStackBar } from "../components/Stacked.tsx";
import { Card, ChartCard, Filter, Legend, Segmented } from "../components/ui.tsx";
import { dateLabel, fmtNum, fmtPct, fmtSignedPct, ymLabel } from "../data/format.ts";
import { eia, liveStatus, loadGrid, perAccount, type GridBundle } from "../data/load.ts";
import { ZONE_NAMES, type Area, type GridArea, type RangePoint, type RegimeArea } from "../data/model.ts";
import { gridContext, homesContext, monthlyTotals, type DetailContext } from "../data/nowcast.ts";

const AREAS: RegimeArea[] = ["MA_RES", "MA", "NEMA", "SEMA", "WCMA"];
const AREA_LABEL: Record<RegimeArea, string> = { MA_RES: "Homes", MA: "MA grid", NEMA: "NEMA", SEMA: "SEMA", WCMA: "WCMA" };
const AREA_TITLE: Record<RegimeArea, string> = {
  MA_RES: "Massachusetts homes (EIA, monthly)",
  MA: `${ZONE_NAMES.MA} — ISO-NE / EIA-930, daily`,
  NEMA: `${ZONE_NAMES.NEMA} — ISO-NE / EIA-930, daily`,
  SEMA: `${ZONE_NAMES.SEMA} — ISO-NE / EIA-930, daily`,
  WCMA: `${ZONE_NAMES.WCMA} — ISO-NE / EIA-930, daily`,
};

const toProbs = (p: number[]): Record<Regime, number> => ({ low: p[0], mid: p[1], high: p[2] });
const pct = (v: number) => fmtSignedPct(v / 100, 1);

function horizonLabel(a: GridArea, days: number): string {
  if (a.unit === "day") return `In ${days} days`;
  const months = Math.round(days / 30.4);
  return `In ${months} month${months > 1 ? "s" : ""}`;
}

function runLabel(a: GridArea, days: number): string {
  return a.unit === "day" ? `${fmtNum(days, 0)} days` : `${fmtNum(days / 30.44, 1)} months`;
}

/** The nowcast's table view: every point, plus the detailed panels' values when they are shown. */
function nowcastTable(tl: RangePoint[], daily: boolean, d?: DetailContext) {
  const at = new Map(tl.map((t, i) => [t.date, i]));
  const dp = d?.unit === "GWh" ? 1 : 0;
  const pick = (arr: (number | null)[] | undefined, t: RangePoint) => arr?.[at.get(t.date)!] ?? null;
  return {
    columns: [
      { key: "d", label: daily ? "Date" : "Month", render: (t: RangePoint) => (daily ? t.date : ymLabel(t.date.slice(0, 7))), sort: (t: RangePoint) => t.date },
      { key: "r", label: "Regime", render: (t: RangePoint) => <RegimeBadge regime={fromGrid(t.color)} labels={RANGE_LABELS} /> },
      { key: "p", label: "vs average", align: "r" as const, render: (t: RangePoint) => pct(t.pctVsAverage), sort: (t: RangePoint) => t.pctVsAverage },
      { key: "a", label: "P(above)", align: "r" as const, render: (t: RangePoint) => (t.probs ? fmtPct(t.probs[2]) : "—"), sort: (t: RangePoint) => t.probs?.[2] ?? t.pRed },
      ...(d
        ? [
            { key: "v", label: d.unit === "kWh" ? "kWh / account" : "GWh", align: "r" as const, render: (t: RangePoint) => { const v = pick(d.value, t); return v === null ? "—" : fmtNum(v, dp); } },
            { key: "u", label: `Usual range (${d.unit})`, align: "r" as const, render: (t: RangePoint) => { const lo = pick(d.lo, t); const hi = pick(d.hi, t); return lo === null || hi === null ? "—" : `${fmtNum(lo, dp)}–${fmtNum(hi, dp)}`; } },
            { key: "y", label: "vs a year earlier", align: "r" as const, render: (t: RangePoint) => { const v = pick(d.yoy, t); return v === null ? "—" : fmtSignedPct(v); } },
          ]
        : []),
    ],
    rows: [...tl].reverse(),
  };
}

export default function Grid() {
  const [bundle, setBundle] = useState<GridBundle | null>(null);
  const [area, setArea] = usePersistentState<RegimeArea>("grid-area", "MA_RES", AREAS);
  const [year, setYear] = useState("all");

  useEffect(() => {
    let live = true;
    loadGrid().then((b) => live && setBundle(b));
    return () => {
      live = false;
    };
  }, []);

  const a = bundle?.regimes.areas.find((x) => x.area === area);
  // The grid series behind the forecast: Massachusetts, or the zone picked under Series.
  const gridKey: Area = area === "MA_RES" ? "MA" : area;
  const gridArea = bundle?.regimes.areas.find((x) => x.area === gridKey);
  const years = useMemo(() => (a ? [...new Set(a.timeline.map((t) => t.date.slice(0, 4)))] : []), [a]);
  const yearSafe = years.includes(year) ? year : "all";
  const monthly = useMemo(() => (a ? (yearSafe === "all" ? a.monthly : a.monthly.filter((m) => m.ym.startsWith(yearSafe))) : []), [a, yearSafe]);
  // One nowcast for the selected series, with its value vs the usual range and the change vs a year earlier.
  const tl = useMemo(() => (a ? a.timeline.filter((t) => yearSafe === "all" || t.date.startsWith(yearSafe)) : []), [a, yearSafe]);
  const detail = useMemo(() => (!tl.length ? undefined : area === "MA_RES" ? homesContext(tl, eia, perAccount) : gridContext(tl)), [area, tl]);
  // Actual monthly load for the fan chart: the last two years of full months.
  const fanHistory = useMemo(() => (gridArea ? monthlyTotals(gridArea.timeline).slice(-24) : []), [gridArea]);

  // The forecast covers the grid zones; homes (MA_RES) fall back to the statewide grid forecast.
  const fcArea: Area = gridKey;
  const fc = bundle?.forecast.areas.find((x) => x.area === fcArea);

  const daily = a?.unit === "day";

  return (
    <>
      <div className="page-head">
        <div>
          <h2 className="page-title">Is Massachusetts using more than usual?</h2>
          <p className="page-lede">
            Each month (homes) or day (grid) against the same period in the previous five years: above the usual range is red, within
            grey, below green.
          </p>
        </div>
      </div>

      <div className="filters" role="group" aria-label="Regime filters">
        <Filter label="Series">
          <Segmented label="Series" value={area} onChange={setArea} options={AREAS.map((x) => ({ value: x, label: AREA_LABEL[x], title: AREA_TITLE[x] }))} />
        </Filter>
        <Filter label="Year">
          <select className="select" value={yearSafe} onChange={(e) => setYear(e.target.value)} aria-label="Year">
            <option value="all">All{years.length ? ` (${years[0]}–${years[years.length - 1]})` : ""}</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </Filter>
      </div>

      {!bundle || !a || !fc || !gridArea ? (
        <div className="loading">Loading regimes and forecast…</div>
      ) : (
        <div className="grid">
          <ChartCard
            className="span-12"
            title={`Regime nowcast: ${area === "MA_RES" ? "homes" : area === "MA" ? "Massachusetts grid" : ZONE_NAMES[area]}`}
            source={daily ? "ISO-NE and EIA-930, all customer classes · weather not removed · filtered, no look-ahead" : "EIA-861M · filtered, no look-ahead"}
            table={nowcastTable(tl, daily, detail)}
          >
            <RegimeNowcast area={a} timeline={tl} areas={bundle.regimes.areas} title={AREA_TITLE[area]} label={AREA_LABEL[area]} detail={detail} />
          </ChartCard>

          <Card
            className="span-5"
            title={`${daily ? "Latest day" : "Latest month"}: ${daily ? dateLabel(a.current.date) : ymLabel(a.current.date.slice(0, 7))}`}
            subtitle={daily ? "Grid data run about 10 days behind." : "Home data run about two months behind."}
            source="Outlook: tested model where it beat the long-run odds."
          >
            <div className="stack">
              <div className="row">
                <RegimeBadge regime={fromGrid(a.current.color)} labels={RANGE_LABELS} large />
                <span className="tile-meta">
                  <strong style={{ color: "var(--ink)" }}>{pct(a.current.pctVsAverage)}</strong> vs the 5-year average · usual range ±
                  {fmtNum(a.current.bandPct, 1)}%
                </span>
              </div>
              <RegimeStackBar probs={toProbs(a.current.probs)} labels={RANGE_SHORT} ariaLabel="State probabilities now" />
              {a.outlook.map((o) => (
                <div key={o.days} className="stack" style={{ gap: 4 }}>
                  <span className="tile-label">{horizonLabel(a, o.days)}</span>
                  <RegimeStackBar probs={toProbs(o.probs)} labels={RANGE_SHORT} height={20} ariaLabel={`State probabilities ${horizonLabel(a, o.days).toLowerCase()}`} />
                </div>
              ))}
              <RegimeLegend labels={RANGE_LABELS} />
            </div>
          </Card>

          <Card className="span-7" title="The three regimes" subtitle={AREA_TITLE[area]}>
            <div className="table-wrap" style={{ maxHeight: "none" }}>
              <table className="data">
                <caption className="sr-only">Regime statistics for {AREA_TITLE[area]}</caption>
                <thead>
                  <tr>
                    <th scope="col">Regime</th>
                    <th scope="col" className="r">
                      Centre vs average
                    </th>
                    <th scope="col" className="r">
                      Typical run
                    </th>
                    <th scope="col" className="r">
                      Share of {daily ? "days" : "months"}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {a.states.map((s) => (
                    <tr key={s.color}>
                      <td>
                        <RegimeBadge regime={fromGrid(s.color)} labels={RANGE_LABELS} />
                      </td>
                      <td className="r">
                        {s.meanSdFromAverage > 0 ? "+" : s.meanSdFromAverage < 0 ? "−" : ""}
                        {fmtNum(Math.abs(s.meanSdFromAverage), 1)} sd
                      </td>
                      <td className="r">{runLabel(a, s.expectedDurationDays)}</td>
                      <td className="r">{fmtPct(s.shareOfDays)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="filter-label" style={{ margin: "14px 0 6px" }}>
              Chance of switching, {daily ? "day to day" : "month to month"}
            </p>
            <div className="table-wrap" style={{ maxHeight: "none" }}>
              <table className="data">
                <caption className="sr-only">Transition probabilities for {AREA_TITLE[area]}</caption>
                <thead>
                  <tr>
                    <th scope="col">{daily ? "Today → tomorrow" : "This month → next"}</th>
                    {REGIMES.map((r) => (
                      <th key={r} scope="col" className="r">
                        {RANGE_SHORT[r]}
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
                          {RANGE_SHORT[REGIMES[i]]}
                        </span>
                      </th>
                      {row.map((p, j) => (
                        <td key={j} className="r">
                          {p < 0.0005 ? "—" : fmtPct(p, 1)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="tile-meta" style={{ marginTop: 10 }}>
              Agrees with the plain above / within / below rule {fmtPct(a.agreementWithBandRule)} of the time.
            </p>
          </Card>

          {daily ? (
            <ChartCard
              className="span-12"
              title="Share of days in each regime, by month"
              subtitle="Above-range days sit on the baseline."
              source="No look-ahead (leakage test: pass)."
              table={{
                columns: [
                  { key: "m", label: "Month", render: (m) => ymLabel(m.ym), sort: (m) => m.ym },
                  { key: "l", label: "Below", align: "r", render: (m) => fmtPct(m.green) },
                  { key: "g", label: "Within", align: "r", render: (m) => fmtPct(m.grey) },
                  { key: "h", label: "Above", align: "r", render: (m) => fmtPct(m.red), sort: (m) => m.red },
                ],
                rows: [...monthly].reverse(),
              }}
            >
              <RegimeLegend labels={{ low: "Below-range days", mid: "Within", high: "Above-range days" }} />
              <RegimeShareColumns
                months={monthly.map((m) => m.ym)}
                shares={monthly.map((m) => ({ low: m.green, mid: m.grey, high: m.red }))}
                labels={RANGE_SHORT}
                titleFor={(i) => ymLabel(monthly[i].ym)}
                ariaLabel={`Monthly share of days in each regime for ${AREA_TITLE[area]}`}
              />
            </ChartCard>
          ) : null}

          <ChartCard
            className="span-8"
            title={`Next six months: ${fcArea === "MA" ? "statewide" : fcArea} grid load`}
            subtitle={`Actual monthly load, then the forecast for ${ymLabel(bundle.forecast.horizon[0])} – ${ymLabel(bundle.forecast.horizon[bundle.forecast.horizon.length - 1])}.`}
            source={`${fmtNum(bundle.forecast.nPaths)} simulated paths · refreshed daily`}
            table={{
              columns: [
                { key: "m", label: "Month", render: (m) => ymLabel(m.ym) },
                { key: "10", label: "P10", align: "r", render: (m) => fmtNum(m.p10) },
                { key: "50", label: "Median", align: "r", render: (m) => fmtNum(m.p50) },
                { key: "90", label: "P90", align: "r", render: (m) => fmtNum(m.p90) },
                { key: "s", label: "Same months last year", align: "r", render: (m) => fmtNum(fc.sameMonthsLastObservedGWh[fc.months.indexOf(m)]) },
              ],
              rows: fc.months,
            }}
          >
            <Legend
              items={[
                { label: "Actual", color: "var(--ink)" },
                { label: "Median forecast", color: "var(--series-1)" },
                { label: "50% range", color: "var(--series-1)", key: "band" },
                { label: "90% range", color: "var(--fan-90)", key: "band" },
                { label: `${fc.samplePaths.length} simulated paths`, color: "var(--fan-90)" },
              ]}
            />
            <FanChart
              history={fanHistory}
              forecast={fc.months}
              paths={fc.samplePaths}
              lastYear={fc.sameMonthsLastObservedGWh}
              dataThrough={liveStatus.gridThrough}
              height={300}
              ariaLabel={`Monthly grid load for ${fcArea}: actual history and the six-month forecast`}
            />
          </ChartCard>

          <Card className="span-4" title="Six-month total" subtitle={`${fcArea === "MA" ? "Massachusetts" : fcArea}, all customer classes`}>
            <div className="stack">
              <div>
                <p className="result-value">
                  {fmtNum(fc.total.p50 / 1000, 1)}
                  <span className="result-label" style={{ marginLeft: 6 }}>TWh median</span>
                </p>
                <p className="tile-meta">
                  80% likely between {fmtNum(fc.total.p10 / 1000, 2)} and {fmtNum(fc.total.p90 / 1000, 2)} TWh · same months a year
                  earlier: {fmtNum(fc.sameMonthsLastObservedGWh.reduce((s, v) => s + v, 0) / 1000, 2)} TWh
                </p>
              </div>
              <div className="note">
                {bundle.forecast.backtest ? (
                  <>
                    <strong>Tested on {bundle.forecast.backtest.nWinters} past winters:</strong> the 80% range held the actual{" "}
                    {fmtPct(bundle.forecast.backtest.cov80)} of the time.
                  </>
                ) : (
                  <>
                    <strong>Tested before shown.</strong> Fit only on data to {dateLabel(bundle.forecast.calibration.trainEnd)}, then run on two
                    winters it never saw ({bundle.forecast.calibration.nMonths} zone-months): the 80% range held the actual{" "}
                    {fmtPct(bundle.forecast.calibration.cov80)} of the time (90% range: {fmtPct(bundle.forecast.calibration.cov90)}), and the
                    median's error was {fmtPct(1 - bundle.forecast.calibration.maeVsNaive)} smaller than a “same month last year” guess.
                  </>
                )}
              </div>
            </div>
          </Card>

          <Card className="span-12" title="How to read this">
            <div className="prose">
              <p>
                <strong>Usual range:</strong> {bundle.regimes.definition.range}. Zones: <strong>NEMA</strong> {ZONE_NAMES.NEMA},{" "}
                <strong>SEMA</strong> {ZONE_NAMES.SEMA}, <strong>WCMA</strong> {ZONE_NAMES.WCMA}; <strong>MA grid</strong> adds the three.
              </p>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
