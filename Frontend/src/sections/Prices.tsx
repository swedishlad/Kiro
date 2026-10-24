import { useMemo, useState } from "react";

import { ColumnChart, HBarChart } from "../components/BarChart.tsx";
import { usePersistentState } from "../components/hooks.ts";
import { LineChart } from "../components/LineChart.tsx";
import { Callout, Card, ChartCard, DataTable, Filter, Legend, Segmented } from "../components/ui.tsx";
import { RANGES, RANGE_LABEL, sliceRange, type Range } from "../data/derive.ts";
import { addMonths, fmtCents, fmtNum, moneyDisplay, ymIndex, ymLabel, ymShort } from "../data/format.ts";
import { consumptionStats, eia, monthlyRates, savingsModel, spans } from "../data/load.ts";
import { UTILITIES, UTILITY_IDS, utilityById, type UtilityId } from "../data/model.ts";
import { computeSavings, coveredWindow, seasonalKwh, type SavingsResult } from "../data/savings.ts";

const SLOT: Record<UtilityId, string> = {
  NG: "var(--series-1)",
  EV_EAST: "var(--series-2)",
  EV_WEST: "var(--series-3)",
  UNITIL: "var(--series-4)",
};

export default function Prices() {
  const [utility, setUtility] = usePersistentState<UtilityId>("utility", "NG", UTILITY_IDS);
  const [range, setRange] = usePersistentState<Range>("prices-range", "10y", RANGES);
  const u = utilityById(utility);

  const rateMonths = useMemo(() => sliceRange(monthlyRates.NG.map((p) => p.ym), range), [range]);
  const startIdx = monthlyRates.NG.length - rateMonths.length;

  // All-in average (EIA) vs this utility's basic-service supply rate, on one ¢/kWh axis.
  const eiaRows = useMemo(() => sliceRange(eia, range), [range]);
  const supplyByYm = new Map(monthlyRates[utility].map((p) => [p.ym, p.cents]));

  const terms = spans[utility].slice(-10);

  return (
    <>
      <div className="page-head">
        <div>
          <h2 className="page-title">Prices and basic service</h2>
          <p className="page-lede">
            Basic service is the default electricity supply your utility buys for you at rates set every six months and approved by the
            Department of Public Utilities. Compare it with what homes pay overall, and check whether a competitive supplier saved you
            money.
          </p>
        </div>
      </div>

      <div className="filters" role="group" aria-label="Price filters">
        <Filter label="Utility">
          <Segmented label="Utility" value={utility} onChange={setUtility} options={UTILITIES.map((x) => ({ value: x.id, label: x.name }))} />
        </Filter>
        <Filter label="History">
          <Segmented label="Time range" value={range} onChange={setRange} options={RANGES.map((r) => ({ value: r, label: RANGE_LABEL[r] }))} />
        </Filter>
      </div>

      <div className="grid">
        <ChartCard
          className="span-12"
          title="Basic service monthly rates, residential"
          subtitle={`${u.name} highlighted; the other three utilities in grey for context. Winter rates spike because New England's gas supply is tight in the cold months.`}
          source="Mass.gov DPU basic service rates (variable, monthly option), retrieved 2 Jul 2026. Supply portion only — delivery charges are extra. NSTAR (now Eversource East) has no monthly values before 2007."
          table={{
            columns: [
              { key: "m", label: "Month", render: (i: number) => ymLabel(rateMonths[i]), sort: (i) => i },
              ...UTILITIES.map((x) => ({
                key: x.id,
                label: x.name,
                align: "r" as const,
                render: (i: number) => {
                  const c = monthlyRates[x.id][startIdx + i].cents;
                  return c === null ? "—" : fmtCents(c, 3);
                },
              })),
            ],
            rows: rateMonths.map((_, i) => i).reverse(),
          }}
        >
          <Legend
            items={[
              { label: `${u.name} (${u.detail})`, color: SLOT[utility] },
              { label: "Other utilities", color: "var(--muted-series)" },
            ]}
          />
          <LineChart
            x={rateMonths}
            xKind="month"
            series={[
              ...UTILITIES.filter((x) => x.id !== utility).map((x) => ({
                id: x.id,
                label: x.name,
                color: "var(--muted-series)",
                muted: true,
                values: monthlyRates[x.id].slice(startIdx).map((p) => p.cents),
              })),
              { id: utility, label: u.name, color: SLOT[utility], values: monthlyRates[utility].slice(startIdx).map((p) => p.cents) },
            ]}
            zeroBased
            yFormat={(v) => `${fmtNum(v)}¢`}
            valueFormat={(v) => fmtCents(v, 2)}
            titleFor={(i) => ymLabel(rateMonths[i])}
            height={300}
            ariaLabel={`Basic service monthly rates for ${u.name} with other utilities for context`}
          />
        </ChartCard>

        <ChartCard
          className="span-7"
          title="All-in price vs the supply rate"
          subtitle={`What a kWh costs a Massachusetts home on average (delivery + supply, all utilities) against ${u.name}'s basic-service supply rate.`}
          source="EIA-861M revenue ÷ sales (all residential customers, including those on competitive supply) and Mass.gov basic service. The gap is roughly delivery, transmission and program charges."
          table={{
            columns: [
              { key: "m", label: "Month", render: (r) => ymLabel(r.ym), sort: (r) => r.ym },
              { key: "a", label: "All-in average", align: "r", render: (r) => fmtCents(r.priceCents, 2) },
              { key: "s", label: `${u.name} supply`, align: "r", render: (r) => { const c = supplyByYm.get(r.ym); return c == null ? "—" : fmtCents(c, 2); } },
            ],
            rows: [...eiaRows].reverse(),
          }}
        >
          <Legend
            items={[
              { label: "All-in average price (EIA)", color: "var(--ink-2)" },
              { label: `${u.name} basic service supply`, color: SLOT[utility] },
            ]}
          />
          <LineChart
            x={eiaRows.map((r) => r.ym)}
            xKind="month"
            series={[
              { id: "eia", label: "All-in average", color: "var(--ink-2)", values: eiaRows.map((r) => r.priceCents) },
              { id: "bs", label: `${u.name} supply`, color: SLOT[utility], values: eiaRows.map((r) => supplyByYm.get(r.ym) ?? null) },
            ]}
            zeroBased
            endLabels
            yFormat={(v) => `${fmtNum(v)}¢`}
            valueFormat={(v) => fmtCents(v, 2)}
            titleFor={(i) => ymLabel(eiaRows[i].ym)}
            noteFor={(i) => (eiaRows[i].preliminary ? "EIA figure is preliminary" : undefined)}
            height={270}
            ariaLabel="All-in average residential price versus basic service supply rate"
          />
        </ChartCard>

        <ChartCard
          className="span-5"
          title={`${u.name}: fixed-option terms`}
          subtitle="The fixed basic-service rate for each six-month term — what the savings calculator compares against."
          source="Mass.gov fixed residential prices; a rate covers the months since the previous term ended."
          table={{
            columns: [
              { key: "t", label: "Term", render: (t) => `${ymLabel(t.start)} – ${ymLabel(t.end)}` },
              { key: "c", label: "Fixed rate", align: "r", render: (t) => fmtCents(t.cents, 3) },
            ],
            rows: [...terms].reverse(),
          }}
        >
          <ColumnChart
            categories={terms.map((t) => `${ymShort(t.start)} – ${ymShort(t.end)}`)}
            values={terms.map((t) => t.cents)}
            colorFor={(i) => (i === terms.length - 1 ? SLOT[utility] : "var(--muted-series)")}
            yFormat={(v) => `${fmtNum(v)}¢`}
            valueFormat={(v) => fmtCents(v, 2)}
            labelled={[terms.length - 1, terms.reduce((m, t, i) => (t.cents > terms[m].cents ? i : m), 0)]}
            tickLabel={(i) => ymShort(terms[i].end)}
            titleFor={(i) => `${ymLabel(terms[i].start)} – ${ymLabel(terms[i].end)}`}
            height={270}
            ariaLabel={`Fixed basic service rate by term for ${u.name}`}
          />
        </ChartCard>

        <SavingsCalculator utility={utility} />
      </div>
    </>
  );
}

type UsageMode = "flat" | "annual";

function SavingsCalculator({ utility }: { utility: UtilityId }) {
  const u = utilityById(utility);
  const covered = coveredWindow(spans, utility);
  const defaultStart = savingsModel.basicServiceRatesCents.term.split("..")[0];
  const [rate, setRate] = useState("22.0");
  const [mode, setMode] = useState<UsageMode>("flat");
  const [flatKwh, setFlatKwh] = useState("650");
  const [annualKwh, setAnnualKwh] = useState(String(consumptionStats.typicalAccount.annualKwh));
  const [start, setStart] = useState(defaultStart);
  const [months, setMonths] = useState(String(savingsModel.defaultPeriodMonths));

  // Start months the data covers, newest first; the period can't run past the last known term.
  const startOptions = useMemo(() => {
    const out: string[] = [];
    for (let k = ymIndex(covered.last); k >= ymIndex(covered.first); k--) out.push(addMonths(covered.first, k - ymIndex(covered.first)));
    return out;
  }, [covered.first, covered.last]);
  const safeStart = startOptions.includes(start) ? start : startOptions.includes(defaultStart) ? defaultStart : startOptions[0];
  const maxMonths = Math.min(12, ymIndex(covered.last) - ymIndex(safeStart) + 1);
  const nMonths = Math.max(1, Math.min(maxMonths, Number(months) || 1));

  const parsed = useMemo((): { result: SavingsResult } | { error: string } => {
    const r = Number(rate);
    if (rate.trim() === "" || !Number.isFinite(r) || r < 0 || r > 100) return { error: "Enter your supplier's rate in cents per kWh, e.g. 22.0" };
    let kwh: number[];
    if (mode === "flat") {
      const k = Number(flatKwh.replace(/,/g, ""));
      if (!Number.isFinite(k) || k < 0 || k > 20000) return { error: "Enter monthly use in kWh, e.g. 650" };
      kwh = Array(nMonths).fill(k);
    } else {
      const a = Number(annualKwh.replace(/,/g, ""));
      if (!Number.isFinite(a) || a < 0 || a > 200000) return { error: "Enter annual use in kWh, e.g. 7135" };
      kwh = seasonalKwh(a, consumptionStats.seasonalShares, safeStart, nMonths);
    }
    try {
      return { result: computeSavings(spans, { utility, userRateCents: r, startYm: safeStart, kwhByMonth: kwh }) };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [rate, mode, flatKwh, annualKwh, nMonths, safeStart, utility]);

  const res = "result" in parsed ? parsed.result : null;
  const saved = res ? res.savedTotal : 0;
  const verdict = !res ? "" : Math.abs(saved) < 0.005 ? "Same as basic service" : saved > 0 ? "You saved vs basic service" : "You overpaid vs basic service";

  return (
    <>
      <Card
        className="span-5"
        title="Did your supplier save you money?"
        subtitle={`Compares your competitive supply rate with ${u.name}'s fixed basic-service rate over the same months.`}
        source="Supply portion only: delivery charges are the same either way, so they cancel out."
      >
        <div className="form-grid">
          <label className="field">
            Your supply rate (¢/kWh)
            <input className="input" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
            <span className="field-hint">“Supply” or “generation” line on your bill</span>
          </label>
          <label className="field">
            First month
            <select className="select" value={safeStart} onChange={(e) => setStart(e.target.value)}>
              {startOptions.map((m) => (
                <option key={m} value={m}>
                  {ymLabel(m)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Number of months
            <select className="select" value={String(nMonths)} onChange={(e) => setMonths(e.target.value)}>
              {Array.from({ length: maxMonths }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="stack" style={{ marginTop: 14 }}>
          <Segmented
            label="How to enter usage"
            value={mode}
            onChange={setMode}
            options={[
              { value: "flat", label: "Same kWh every month" },
              { value: "annual", label: "Annual kWh, spread by season" },
            ]}
          />
          {mode === "flat" ? (
            <label className="field">
              kWh per month
              <input className="input" inputMode="numeric" value={flatKwh} onChange={(e) => setFlatKwh(e.target.value)} />
            </label>
          ) : (
            <label className="field">
              kWh per year
              <input className="input" inputMode="numeric" value={annualKwh} onChange={(e) => setAnnualKwh(e.target.value)} />
              <span className="field-hint">Spread with the statewide monthly pattern (more in Jul–Aug and Jan).</span>
            </label>
          )}
          {"error" in parsed ? (
            <p className="error" role="alert">
              {parsed.error}
            </p>
          ) : null}
          {res ? (
            <div aria-live="polite">
              <p className="result-label">{verdict}</p>
              <p className="result-value" style={{ color: saved > 0.004 ? "var(--good-text)" : saved < -0.004 ? "var(--bad-text)" : "var(--ink)" }}>
                {moneyDisplay(saved)}
              </p>
              <p className="tile-meta">
                over {res.months.length} month{res.months.length > 1 ? "s" : ""}, {ymLabel(res.months[0])} – {ymLabel(res.months[res.months.length - 1])} ·{" "}
                {fmtNum(res.kwhByMonth.reduce((a, b) => a + b, 0))} kWh
              </p>
            </div>
          ) : null}
          <Callout>
            Positive means your rate beat basic service; negative means basic service would have been cheaper. Rates from{" "}
            {ymLabel(covered.first)} to {ymLabel(covered.last)} are available for {u.name}.
          </Callout>
        </div>
      </Card>

      <ChartCard
        className="span-7"
        title="Month by month"
        subtitle="Each bar is basic-service cost minus what you paid that month."
        source="Same math as the backend's savings_model.py: (basic − your rate) × kWh ÷ 100, rounded half-up to cents for display."
        table={
          res
            ? {
                columns: [
                  { key: "m", label: "Month", render: (i: number) => ymLabel(res.months[i]) },
                  { key: "k", label: "kWh", align: "r", render: (i) => fmtNum(res.kwhByMonth[i]) },
                  { key: "b", label: "Basic ¢/kWh", align: "r", render: (i) => fmtNum(res.basicServiceCentsByMonth[i], 3) },
                  { key: "d", label: "Basic cost", align: "r", render: (i) => moneyDisplay(res.defaultMonthly[i]) },
                  { key: "u", label: "You paid", align: "r", render: (i) => moneyDisplay(res.userMonthly[i]) },
                  { key: "s", label: "Saved", align: "r", render: (i) => res.savedMonthlyDisplay[i] },
                ],
                rows: res.months.map((_, i) => i),
              }
            : undefined
        }
      >
        {res ? (
          <>
            <Legend
              items={[
                { label: "Saved", color: "var(--low)", key: "rect" },
                { label: "Overpaid", color: "var(--high)", key: "rect" },
              ]}
            />
            <ColumnChart
              categories={res.months}
              values={res.savedMonthly}
              colorFor={(i) => (res.savedMonthly[i] >= 0 ? "var(--low)" : "var(--high)")}
              yFormat={(v) => (Math.abs(v) >= 1000 ? moneyDisplay(v).replace(/\.\d\d$/, "") : moneyDisplay(v).replace(/\.00$/, ""))}
              valueFormat={(v) => moneyDisplay(v)}
              labelled={res.months.length <= 6 ? res.months.map((_, i) => i) : []}
              tickLabel={(i) => ymShort(res.months[i])}
              titleFor={(i) => ymLabel(res.months[i])}
              rowsFor={(i) => [
                { key: "rect", color: res.savedMonthly[i] >= 0 ? "var(--low)" : "var(--high)", value: res.savedMonthlyDisplay[i], label: res.savedMonthly[i] >= 0 ? "saved" : "overpaid" },
                { value: `${fmtNum(res.kwhByMonth[i])} kWh`, label: "use" },
                { value: `${fmtCents(res.basicServiceCentsByMonth[i], 3)} vs ${fmtCents(res.userRateCents, 3)}`, label: "basic vs yours" },
              ]}
              height={260}
              ariaLabel="Savings or overpayment by month"
            />
            <div style={{ marginTop: 12 }}>
              <p className="filter-label" style={{ marginBottom: 6 }}>
                Current basic-service fixed rates
              </p>
              <HBarChart
                rows={UTILITIES.map((x) => ({
                  label: x.name,
                  value: savingsModel.basicServiceRatesCents[x.id],
                  color: x.id === utility ? SLOT[x.id] : "var(--muted-series)",
                }))}
                valueFormat={(v) => fmtCents(v, 3)}
                barHeight={14}
                gap={10}
                ariaLabel={`Basic service fixed rates, ${savingsModel.basicServiceRatesCents.term.replace("..", " to ")}`}
              />
            </div>
          </>
        ) : (
          <p className="loading">Fix the inputs to see the breakdown.</p>
        )}
      </ChartCard>

      <Card className="span-12" title="Worked examples from the backend" subtitle="The calculator reproduces these figures from savings_model.json exactly (checked in the test suite).">
        <DataTable
          caption="Backend savings examples"
          columns={[
            { key: "l", label: "Example", render: (e) => e.label },
            { key: "u", label: "Utility", render: (e) => utilityById(e.utility).name },
            { key: "r", label: "Your rate", align: "r", render: (e) => fmtCents(e.userRateCents, 1) },
            { key: "t", label: "Result", align: "r", render: (e) => e.savedTotalDisplay },
          ]}
          rows={savingsModel.examples}
        />
      </Card>
    </>
  );
}
