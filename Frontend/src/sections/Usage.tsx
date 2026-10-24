import { useMemo, useState } from "react";

import { ColumnChart } from "../components/BarChart.tsx";
import { KwhHistogram } from "../components/Histogram.tsx";
import { usePersistentState } from "../components/hooks.ts";
import { LineChart } from "../components/LineChart.tsx";
import { RangeChart } from "../components/RangeChart.tsx";
import { REGIMES, REGIME_META, RegimeBadge, RegimeIcon, RegimeLegend, fromHmm, fromLevel } from "../components/regime.tsx";
import { Callout, Card, ChartCard, Filter, Legend, Segmented } from "../components/ui.tsx";
import { RANGES, RANGE_LABEL, sliceRange, type Range } from "../data/derive.ts";
import { MONTHS, fmtNum, fmtPct, fmtSignedPct, ymLabel } from "../data/format.ts";
import { MIN_HOMES, estimateHome, type AnswerKey, type HomeAnswers } from "../data/homes.ts";
import { consumptionStats, eia, hmm, hmmByYm, recs } from "../data/load.ts";
import { HEAT_FUELS, HOME_TYPES, SQFT_BUCKETS, SQFT_LABELS, type SqftBucket } from "../data/model.ts";
import { classify, weightedHistogram, weightedShareAtOrBelow } from "../data/stats.ts";

// Same cut points as data/build/map_consumption.json (weighted P33 / P66 of RECS MA annual kWh);
// the parity test in data.test.ts pins them to the artifact.
import mapThresholds from "@backend/build/map_consumption.json";

const { greenMax, greyMax } = (mapThresholds as { thresholds: { greenMax: number; greyMax: number } }).thresholds;

const ANSWER_LABEL: Record<AnswerKey, string> = { sqft: "size", type: "home type", fuel: "heating fuel", members: "household size" };

export default function Usage() {
  const [range, setRange] = usePersistentState<Range>("usage-range", "all", RANGES);
  const rows = useMemo(() => sliceRange(eia, range), [range]);

  // Sales vs the same month a year earlier (statewide sales; customer counts are too noisy for this).
  const yoy = useMemo(() => {
    const byYm = new Map(eia.map((r) => [r.ym, r]));
    return rows.flatMap((r) => {
      const prior = byYm.get(`${r.year - 1}-${String(r.month).padStart(2, "0")}`);
      return prior ? [{ ym: r.ym, change: r.salesMwh / prior.salesMwh - 1, preliminary: r.preliminary }] : [];
    });
  }, [rows]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">How much electricity Massachusetts homes use</h1>
          <p className="page-lede">
            Statewide monthly use per residential account since 2010 (EIA-861M), the model's low / mid / high use regimes, and the RECS
            2020 survey of 552 Massachusetts homes for “a home like yours”.
          </p>
        </div>
      </div>

      <div className="filters" role="group" aria-label="History filters">
        <Filter label="History">
          <Segmented label="Time range" value={range} onChange={setRange} options={RANGES.map((r) => ({ value: r, label: RANGE_LABEL[r] }))} />
        </Filter>
        <span className="tile-meta">
          {ymLabel(rows[0].ym)} – {ymLabel(rows[rows.length - 1].ym)} · {rows.length} months
        </span>
      </div>

      <div className="grid">
        <ChartCard
          className="span-12"
          title="Monthly use per residential account"
          subtitle="kWh per account each month; the strip underneath is the use regime the hidden Markov model assigns to that month."
          source="EIA-861M (kWh per customer = sales ÷ accounts). 2026 months are preliminary and will be revised."
          table={{
            columns: [
              { key: "m", label: "Month", render: (r) => ymLabel(r.ym), sort: (r) => r.ym },
              { key: "k", label: "kWh / account", align: "r", render: (r) => fmtNum(r.kwhPerCustomer, 1), sort: (r) => r.kwhPerCustomer },
              { key: "s", label: "Sales (GWh)", align: "r", render: (r) => fmtNum(r.salesMwh / 1000, 0), sort: (r) => r.salesMwh },
              { key: "c", label: "Accounts", align: "r", render: (r) => fmtNum(r.customers), sort: (r) => r.customers },
              { key: "g", label: "Regime", render: (r) => { const t = hmmByYm.get(r.ym); return t ? <RegimeBadge regime={fromHmm(t.regime)} /> : "—"; } },
              { key: "p", label: "Status", render: (r) => (r.preliminary ? "Preliminary" : "Final") },
            ],
            rows: [...rows].reverse(),
          }}
        >
          <RegimeLegend labels={{ low: "Low-use regime", mid: "Mid", high: "High-use regime" }} />
          <LineChart
            x={rows.map((r) => r.ym)}
            xKind="month"
            series={[{ id: "kwh", label: "kWh per account", color: "var(--series-1)", values: rows.map((r) => r.kwhPerCustomer) }]}
            strip={{ label: "use regime", values: rows.map((r) => { const t = hmmByYm.get(r.ym); return t ? fromHmm(t.regime) : null; }) }}
            yFormat={(v) => fmtNum(v)}
            valueFormat={(v) => `${fmtNum(v)} kWh`}
            titleFor={(i) => ymLabel(rows[i].ym)}
            noteFor={(i) => (rows[i].preliminary ? "Preliminary EIA figure" : undefined)}
            height={300}
            ariaLabel="Monthly kWh per residential account"
          />
        </ChartCard>

        <ChartCard
          className="span-7"
          title="Residential sales vs the same month a year earlier"
          subtitle="Above zero: homes bought more electricity than a year before; below: less."
          source="EIA-861M residential sales (MWh). Uses total sales, not per-account figures, because monthly account counts are noisy."
          table={{
            columns: [
              { key: "m", label: "Month", render: (r) => ymLabel(r.ym), sort: (r) => r.ym },
              { key: "c", label: "Change", align: "r", render: (r) => fmtSignedPct(r.change), sort: (r) => r.change },
            ],
            rows: [...yoy].reverse(),
          }}
        >
          <Legend
            items={[
              { label: "More than a year earlier", color: "var(--series-2)", key: "rect" },
              { label: "Less", color: "var(--series-1)", key: "rect" },
            ]}
          />
          <ColumnChart
            categories={yoy.map((r) => r.ym)}
            values={yoy.map((r) => r.change)}
            colorFor={(i) => (yoy[i].change >= 0 ? "var(--series-2)" : "var(--series-1)")}
            yFormat={(v) => fmtSignedPct(v, 0)}
            valueFormat={(v) => fmtSignedPct(v)}
            tickLabel={(i) => (yoy.length > 30 ? yoy[i].ym.slice(0, 4) : `${MONTHS[Number(yoy[i].ym.slice(5)) - 1]} ’${yoy[i].ym.slice(2, 4)}`)}
            titleFor={(i) => ymLabel(yoy[i].ym)}
            rowsFor={(i) => [{ key: "rect", color: yoy[i].change >= 0 ? "var(--series-2)" : "var(--series-1)", value: fmtSignedPct(yoy[i].change), label: "vs same month last year" }]}
            noteFor={(i) => (yoy[i].preliminary ? "Preliminary EIA figure" : undefined)}
            height={300}
            ariaLabel="Year-over-year change in residential electricity sales by month"
          />
        </ChartCard>

        <Card
          className="span-5"
          title="What the use regimes mean"
          subtitle={`${hmm.n_states}-state Gaussian hidden Markov model over ${hmm.timeline.length} months of kWh per account (${hmm.engine}, seed ${hmm.seed}).`}
          source="States are ordered by mean use: Low < Mid < High. Backend/data/build/hmm_regimes.json."
        >
          <div className="stack">
            {hmm.states.map((s) => {
              const r = fromHmm(s.regime);
              const stay = s.index < hmm.transition_matrix.length ? hmm.transition_matrix[s.index][s.index] : 0;
              return (
                <div key={s.index} className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
                  <RegimeBadge regime={r} />
                  <span className="tile-meta" style={{ textAlign: "right" }}>
                    <strong style={{ color: "var(--ink)" }}>{fmtNum(s.mean)} kWh</strong> avg · ±{fmtNum(Math.sqrt(s.variance))} · {fmtPct(s.stationary_prob)} of months
                    {stay > 0.001 ? ` · stays ${fmtPct(stay)}` : ""}
                  </span>
                </div>
              );
            })}
            <p className="note">
              The model keys on the level of use, not the calendar, so the regimes mostly track the seasons: <strong>High</strong> months
              are summer air-conditioning and mid-winter peaks, <strong>Low</strong> months are spring and autumn. A peak month that
              lands in Mid or Low, or a shoulder month in High, is the one worth a closer look.
            </p>
            <TransitionTable />
          </div>
        </Card>
      </div>

      <HomeLikeYours />
    </>
  );
}

function TransitionTable() {
  return (
    <div className="table-wrap" style={{ maxHeight: "none" }}>
      <table className="data">
        <caption className="sr-only">Chance of moving from one regime to another next month</caption>
        <thead>
          <tr>
            <th scope="col">This month → next</th>
            {REGIMES.map((r) => (
              <th key={r} scope="col" className="r">
                <span className="row" style={{ gap: 4, justifyContent: "flex-end" }}>
                  <RegimeIcon regime={r} />
                  {REGIME_META[r].label}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {hmm.transition_matrix.map((row, i) => (
            <tr key={i}>
              <th scope="row" style={{ fontWeight: 500 }}>
                <span className="row" style={{ gap: 4 }}>
                  <RegimeIcon regime={REGIMES[i]} />
                  {REGIME_META[REGIMES[i]].label}
                </span>
              </th>
              {row.map((p, j) => (
                <td key={j} className="r">
                  {p < 0.0005 ? "—" : fmtPct(p)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const MEMBER_OPTIONS: { value: number | "any"; label: string }[] = [
  { value: "any", label: "Any" },
  { value: 1, label: "1" },
  { value: 2, label: "2" },
  { value: 3, label: "3" },
  { value: 4, label: "4" },
  { value: 5, label: "5+" },
];

function HomeLikeYours() {
  const [answers, setAnswers] = useState<HomeAnswers>({ sqft: "1000-1999", type: 2, fuel: 1, members: "any" });
  const [own, setOwn] = useState("");
  const est = useMemo(() => estimateHome(recs, answers), [answers]);
  const all = useMemo(() => recs.map((h) => ({ value: h.kwh, weight: h.weight })), []);
  const bins = useMemo(() => weightedHistogram(all, Array.from({ length: 21 }, (_, i) => i * 1000)), [all]);
  const ownKwh = own.trim() === "" ? null : Number(own.replace(/,/g, ""));
  const ownValid = ownKwh !== null && Number.isFinite(ownKwh) && ownKwh > 0 && ownKwh < 100000;
  const set = <K extends keyof HomeAnswers>(k: K, v: HomeAnswers[K]) => setAnswers((a) => ({ ...a, [k]: v }));
  const parse = (v: string) => (v === "any" ? "any" : Number(v));
  const estClass = fromLevel(classify(est.p50, greenMax, greyMax));
  const hly = consumptionStats.homeLikeYours;
  const ta = consumptionStats.typicalAccount;

  return (
    <>
      <div className="page-head" style={{ marginTop: 32 }}>
        <div>
          <h2 className="page-title" style={{ fontSize: 20 }}>
            A home like yours
          </h2>
          <p className="page-lede">
            Estimates from the {hly.annualKwh.n} Massachusetts homes in EIA's 2020 Residential Energy Consumption Survey, weighted to
            represent all homes in the state. These are ranges for similar homes, not a reading of your meter.
          </p>
        </div>
      </div>

      <div className="grid">
        <Card className="span-5" title="Describe your home">
          <div className="form-grid">
            <label className="field">
              Home type
              <select className="select" value={String(answers.type)} onChange={(e) => set("type", parse(e.target.value))}>
                <option value="any">Any</option>
                {Object.entries(HOME_TYPES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Size
              <select className="select" value={answers.sqft} onChange={(e) => set("sqft", e.target.value as SqftBucket | "any")}>
                <option value="any">Any</option>
                {SQFT_BUCKETS.map((b) => (
                  <option key={b} value={b}>
                    {SQFT_LABELS[b]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Main heating fuel
              <select className="select" value={String(answers.fuel)} onChange={(e) => set("fuel", parse(e.target.value))}>
                <option value="any">Any</option>
                {Object.entries(HEAT_FUELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              People in household
              <select className="select" value={String(answers.members)} onChange={(e) => set("members", parse(e.target.value))}>
                {MEMBER_OPTIONS.map((o) => (
                  <option key={String(o.value)} value={String(o.value)}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="stack" style={{ marginTop: 18 }}>
            <div>
              <p className="result-label">Homes like this typically use</p>
              <div className="result">
                <span className="result-value">{fmtNum(est.p50)}</span>
                <span className="result-label">kWh / yr (median)</span>
                <RegimeBadge regime={estClass} suffix=" for MA" />
              </div>
              <p className="tile-meta">
                Most fall between {fmtNum(est.p10)} and {fmtNum(est.p90)} kWh (P10–P90) · about {fmtNum(est.p50 / 12)} kWh a month · based
                on {est.n} surveyed homes
              </p>
            </div>
            {est.relaxed.length ? (
              <Callout>
                Fewer than {MIN_HOMES} surveyed homes match every answer, so this ignores your {est.relaxed.map((k) => ANSWER_LABEL[k]).join(" and ")}.
              </Callout>
            ) : null}
            <label className="field">
              Your own annual use (optional)
              <input
                className="input"
                inputMode="numeric"
                placeholder="e.g. 6,500 — sum of 12 bills"
                value={own}
                onChange={(e) => setOwn(e.target.value)}
                aria-describedby="own-hint"
              />
              <span className="field-hint" id="own-hint">
                Add up the kWh on your last 12 electric bills.
              </span>
            </label>
            {ownKwh !== null && !ownValid ? <p className="error">Enter a yearly total in kWh, like 6500.</p> : null}
            {ownValid ? (
              <p className="note">
                <RegimeBadge regime={fromLevel(classify(ownKwh!, greenMax, greyMax))} /> You use more than{" "}
                <strong>{fmtPct(weightedShareAtOrBelow(all, ownKwh! - 1e-9))}</strong> of Massachusetts homes, and{" "}
                {fmtSignedPct(ownKwh! / est.p50 - 1, 0)} vs the median home like yours.
              </p>
            ) : null}
          </div>
        </Card>

        <ChartCard
          className="span-7"
          title="Where Massachusetts homes fall"
          subtitle={`Share of homes by annual kWh. Low ≤ ${fmtNum(greenMax)} kWh < Mid ≤ ${fmtNum(greyMax)} kWh < High — the state's lower, middle and upper thirds.`}
          source="RECS 2020, 552 MA homes, NWEIGHT-weighted. The same cut points colour the backend's map classes."
          table={{
            columns: [
              { key: "b", label: "Annual kWh", render: (b) => `${fmtNum(b.x0)}–${fmtNum(b.x1)}${b.x1 === 20000 ? "+" : ""}` },
              { key: "s", label: "Share of homes", align: "r", render: (b) => fmtPct(b.share, 1) },
            ],
            rows: bins,
          }}
        >
          <KwhHistogram
            bins={bins}
            greenMax={greenMax}
            greyMax={greyMax}
            marker={ownValid ? { value: ownKwh!, label: `You: ${fmtNum(ownKwh!)}` } : { value: est.p50, label: `Homes like yours: ${fmtNum(est.p50)}` }}
            height={260}
            ariaLabel="Distribution of annual electricity use across Massachusetts homes"
          />
        </ChartCard>

        <ChartCard
          className="span-6"
          title="A year of use, month by month"
          subtitle="Typical account in 2025 (EIA) against the RECS median home and its P10–P90 band. Two different populations, shown side by side, never blended."
          source="RECS band = annual band × the statewide seasonal share of each month (EIA 2019–2025)."
          table={{
            columns: [
              { key: "m", label: "Month", render: (r) => MONTHS[r.month - 1] },
              { key: "t", label: "EIA typical account", align: "r", render: (r) => fmtNum(ta.monthlyKwh[r.month - 1]) },
              { key: "p", label: "RECS median", align: "r", render: (r) => fmtNum(r.p50) },
              { key: "b", label: "RECS P10–P90", align: "r", render: (r) => `${fmtNum(r.p10)}–${fmtNum(r.p90)}` },
            ],
            rows: hly.monthlyKwh,
          }}
        >
          <Legend
            items={[
              { label: "EIA typical account, 2025", color: "var(--series-1)" },
              { label: "RECS median home", color: "var(--series-2)" },
              { label: "RECS P10–P90", color: "var(--series-2)", key: "band" },
            ]}
          />
          <LineChart
            x={MONTHS}
            xKind="category"
            series={[
              { id: "eia", label: "EIA typical account", color: "var(--series-1)", values: ta.monthlyKwh },
              { id: "recs", label: "RECS median", color: "var(--series-2)", values: hly.monthlyKwh.map((m) => m.p50) },
            ]}
            band={{ label: "RECS P10–P90", color: "var(--series-2)", lower: hly.monthlyKwh.map((m) => m.p10), upper: hly.monthlyKwh.map((m) => m.p90) }}
            zeroBased
            yFormat={(v) => fmtNum(v)}
            valueFormat={(v) => `${fmtNum(v)} kWh`}
            titleFor={(i) => MONTHS[i]}
            height={260}
            ariaLabel="Monthly kWh: EIA typical account versus RECS median home with P10 to P90 band"
          />
        </ChartCard>

        <ChartCard
          className="span-6"
          title="What drives the difference"
          subtitle="Annual kWh by home size and by main heating fuel: dot = median, bar = P10–P90."
          source="RECS 2020 weighted percentiles (consumption_stats.json)."
          table={{
            columns: [
              { key: "g", label: "Group", render: (r) => r.label },
              { key: "m", label: "Median", align: "r", render: (r) => fmtNum(r.p50) },
              { key: "r", label: "P10–P90", align: "r", render: (r) => `${fmtNum(r.p10)}–${fmtNum(r.p90)}` },
            ],
            rows: [
              ...SQFT_BUCKETS.map((b) => ({ label: SQFT_LABELS[b], ...hly.bySqftBucket[b] })),
              ...(["gas", "oil", "electricity", "propane", "wood"] as const).map((f) => ({ label: `Heats with ${f}`, ...hly.byHeatFuel[f] })),
            ],
          }}
        >
          <p className="filter-label" style={{ marginBottom: 4 }}>
            By size
          </p>
          <RangeChart
            rows={SQFT_BUCKETS.map((b) => ({ label: SQFT_LABELS[b], ...hly.bySqftBucket[b], highlight: answers.sqft === "any" || answers.sqft === b }))}
            format={(v) => fmtNum(v)}
            axisFormat={(v) => (v === 0 ? "0" : `${fmtNum(v / 1000)}k`)}
            domainMax={20000}
            labelWidth={130}
            ariaLabel="Annual kWh by home size"
          />
          <p className="filter-label" style={{ margin: "12px 0 4px" }}>
            By heating fuel
          </p>
          <RangeChart
            rows={(
              [
                ["gas", 1, "Natural gas"],
                ["oil", 3, "Fuel oil"],
                ["electricity", 5, "Electricity"],
                ["propane", 2, "Propane"],
                ["wood", 7, "Wood or pellets"],
              ] as const
            ).map(([k, code, label]) => ({ label, ...hly.byHeatFuel[k], highlight: answers.fuel === "any" || answers.fuel === code }))}
            format={(v) => fmtNum(v)}
            axisFormat={(v) => (v === 0 ? "0" : `${fmtNum(v / 1000)}k`)}
            domainMax={20000}
            labelWidth={130}
            ariaLabel="Annual kWh by main heating fuel"
          />
        </ChartCard>
      </div>
    </>
  );
}
