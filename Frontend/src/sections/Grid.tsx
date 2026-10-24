import { useEffect, useMemo, useState } from "react";

import { usePersistentState } from "../components/hooks.ts";
import { LineChart } from "../components/LineChart.tsx";
import { RegimeNowcast } from "../components/RegimeNowcast.tsx";
import { RANGE_LABELS, RANGE_SHORT, REGIMES, RegimeBadge, RegimeIcon, RegimeLegend, fromGrid, type Regime } from "../components/regime.tsx";
import { RegimeShareColumns, RegimeStackBar } from "../components/Stacked.tsx";
import { Card, ChartCard, Filter, Legend, Segmented } from "../components/ui.tsx";
import { dateLabel, fmtNum, fmtPct, fmtSignedPct, ymLabel, ymShort } from "../data/format.ts";
import { liveStatus, loadGrid, type GridBundle } from "../data/load.ts";
import { ZONE_NAMES, type Area, type GridArea, type RegimeArea } from "../data/model.ts";

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
  const years = useMemo(() => (a ? [...new Set(a.timeline.map((t) => t.date.slice(0, 4)))] : []), [a]);
  const yearSafe = years.includes(year) ? year : "all";
  const timeline = useMemo(() => (a ? (yearSafe === "all" ? a.timeline : a.timeline.filter((t) => t.date.startsWith(yearSafe))) : []), [a, yearSafe]);
  const monthly = useMemo(() => (a ? (yearSafe === "all" ? a.monthly : a.monthly.filter((m) => m.ym.startsWith(yearSafe))) : []), [a, yearSafe]);

  // The forecast covers the grid zones; homes (MA_RES) fall back to the statewide grid forecast.
  const fcArea: Area = area === "MA_RES" ? "MA" : area;
  const fc = bundle?.forecast.areas.find((x) => x.area === fcArea);

  const daily = a?.unit === "day";

  return (
    <>
      <div className="page-head">
        <div>
          <h2 className="page-title">Is Massachusetts using more than usual?</h2>
          <p className="page-lede">
            Each month (homes) or day (grid zones) is compared with the same period in the previous five years. Inside the usual range —
            the average ± 1 standard deviation — is <strong>Within</strong>; above it is <strong>Above</strong>, below it{" "}
            <strong>Below</strong>. A hidden Markov model smooths the call so one odd day doesn't flip it.
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
        <span className="tile-meta">{AREA_TITLE[area]}</span>
      </div>

      {!bundle || !a || !fc ? (
        <div className="loading">Loading regimes and forecast…</div>
      ) : (
        <div className="grid">
          <ChartCard
            className="span-12"
            title="Regime nowcast"
            subtitle="Top: how far use sat from the average of the same period in the previous five years, in standard deviations, each point marked with the model's call. Bottom: the model's filtered probability of each regime. Hover or use the arrow keys to read any point."
            source={
              daily
                ? "ISO-NE (2017–2023) and EIA-930 daily load, all customer classes; weather is not removed, so a heat wave above the range shows red. Forward-filtered: each point uses only data up to it."
                : "EIA-861M residential kWh per account (12-month mean of accounts). Forward-filtered: each point uses only data up to it. Forecast months use the tested gap model where it beat the long-run odds, otherwise the long-run odds (hatched)."
            }
            table={{
              columns: [
                { key: "d", label: daily ? "Date" : "Month", render: (t) => (daily ? t.date : ymLabel(t.date.slice(0, 7))), sort: (t) => t.date },
                { key: "r", label: "Regime", render: (t) => <RegimeBadge regime={fromGrid(t.color)} labels={RANGE_LABELS} /> },
                { key: "p", label: "vs average", align: "r", render: (t) => pct(t.pctVsAverage), sort: (t) => t.pctVsAverage },
                { key: "z", label: "sd", align: "r", render: (t) => fmtNum(t.pctVsAverage / t.bandPct, 2), sort: (t) => t.pctVsAverage / t.bandPct },
                { key: "b", label: "Usual range", align: "r", render: (t) => `±${fmtNum(t.bandPct, 1)}%` },
                { key: "a", label: "P(above)", align: "r", render: (t) => (t.probs ? fmtPct(t.probs[2]) : "—"), sort: (t) => t.probs?.[2] ?? t.pRed },
              ],
              rows: [...timeline].reverse(),
            }}
          >
            <RegimeNowcast area={a} timeline={timeline} areas={bundle.regimes.areas} title={AREA_TITLE[area]} label={AREA_LABEL[area]} />
          </ChartCard>

          <Card
            className="span-5"
            title={`${daily ? "Latest day" : "Latest month"}: ${daily ? dateLabel(a.current.date) : ymLabel(a.current.date.slice(0, 7))}`}
            subtitle={
              daily
                ? "The latest day EIA has published (it posts ISO-NE zone load about 10 days late); refreshed daily."
                : "Statewide residential use per account (EIA-861M, posted about two months late); refreshed daily."
            }
            source="Outlook: a gap model where it beat the long-run odds in a walk-forward test, otherwise the long-run odds. Not a weather forecast."
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

          <Card className="span-7" title="The three regimes" subtitle={`${AREA_TITLE[area]}: where each state sits, how long it lasts, how often it occurs.`}>
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
              The model agrees with the plain above / within / below rule {fmtPct(a.agreementWithBandRule)} of the time; the rest are short
              excursions it treats as noise inside a longer regime.
            </p>
          </Card>

          {daily ? (
            <ChartCard
              className="span-12"
              title="Share of days in each regime, by month"
              subtitle="Above-range days sit on the baseline. 2020–2023 ran mostly within or below the late-2010s range (COVID, efficiency, rooftop solar); load has grown since 2024."
              source="Forward-filtered: each day uses only data up to that day (leakage test: pass)."
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
            subtitle={`Monte Carlo forecast, ${ymLabel(bundle.forecast.horizon[0])} – ${ymLabel(bundle.forecast.horizon[bundle.forecast.horizon.length - 1])}: median with the 10–90% range, against the same months a year earlier.${area === "MA_RES" ? " (No forecast for the homes series; showing the statewide grid.)" : ""}`}
            source={`${fmtNum(bundle.forecast.nPaths)} simulated paths: past weather seasons × the zone's regime model × its recent load level, fit on daily load through ${dateLabel(liveStatus.gridThrough)} (refreshed daily).`}
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
                { label: "Median forecast", color: "var(--series-1)" },
                { label: "10–90% range", color: "var(--series-1)", key: "band" },
                { label: "Same months a year earlier", color: "var(--ink-2)" },
              ]}
            />
            <LineChart
              x={fc.months.map((m) => ymShort(m.ym))}
              xKind="category"
              series={[
                { id: "last", label: "Same months last year", color: "var(--ink-2)", values: fc.sameMonthsLastObservedGWh },
                { id: "p50", label: "Median", color: "var(--series-1)", values: fc.months.map((m) => m.p50) },
              ]}
              band={{ label: "10–90% range", color: "var(--series-1)", lower: fc.months.map((m) => m.p10), upper: fc.months.map((m) => m.p90) }}
              yFormat={(v) => fmtNum(v)}
              valueFormat={(v) => `${fmtNum(v)} GWh`}
              titleFor={(i) => ymLabel(fc.months[i].ym)}
              height={260}
              ariaLabel={`Six-month load forecast for ${fcArea}`}
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
                    <strong>Tested before shown.</strong> Refit before each of the last {bundle.forecast.backtest.nWinters} winters (
                    {bundle.forecast.backtest.winters}) and run on months it had not seen ({bundle.forecast.backtest.nMonths} zone-months): the
                    80% range held the actual {fmtPct(bundle.forecast.backtest.cov80)} of the time (90% range:{" "}
                    {fmtPct(bundle.forecast.backtest.cov90)}), and the median's error was {fmtPct(1 - bundle.forecast.backtest.maeVsNaive)}{" "}
                    smaller than a “same month last year” guess. Six-month totals missed by {fmtNum(bundle.forecast.backtest.totalMaePct, 1)}% on
                    average.
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
              <ul className="prose" style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                {bundle.forecast.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          </Card>

          <Card className="span-12" title="How to read this" source={bundle.regimes.method}>
            <div className="prose">
              <ul>
                <li>
                  <strong>Usual range:</strong> {bundle.regimes.definition.range}.
                </li>
                {bundle.regimes.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
              <p>
                Zones: <strong>NEMA</strong> {ZONE_NAMES.NEMA}, <strong>SEMA</strong> {ZONE_NAMES.SEMA}, <strong>WCMA</strong>{" "}
                {ZONE_NAMES.WCMA}. <strong>MA grid</strong> adds the three together.
              </p>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
