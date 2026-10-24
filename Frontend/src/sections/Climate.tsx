import { useEffect, useState } from "react";

import { ColumnChart } from "../components/BarChart.tsx";
import { LineChart } from "../components/LineChart.tsx";
import { MaccChart } from "../components/MaccChart.tsx";
import { Callout, Card, ChartCard, Filter, Legend, Segmented, StatTile } from "../components/ui.tsx";
import { bestDeferral, fetchClimateDashboard, findScenario, hourLabel, movedKwh, sameScenario, tonsPerThousandUsd } from "../data/climate.ts";
import { fmtCompact, fmtNum, fmtPct } from "../data/format.ts";
import { loadClimate } from "../data/load.ts";
import type { ClimateArtifact, ClimateAsset, ClimateDashboard, ClimateScenarioKey } from "../data/model.ts";

// The static site reads the API's saved answers. Set VITE_CLIMATE_API_URL (e.g. http://localhost:8000, Backend/app.py)
// at build time and the page asks that running API instead, for any monthly kWh.
const CLIMATE_API = String(import.meta.env.VITE_CLIMATE_API_URL ?? "").replace(/\/+$/, "");

const KWH_HINT: Record<number, string> = { 600: "About the typical Massachusetts account", 750: "The API's default home" };
const FLEX_LABEL: Record<number, string> = { 0: "None", 6: "6 kWh", 12: "12 kWh" };
const FLEX_HINT: Record<number, string> = {
  0: "Nothing can wait for a cleaner hour",
  6: "Laundry, dishwasher, water heating: can run at any hour",
  12: "Those plus an electric car charging overnight",
};
const SOURCE_MODE: Record<string, string> = {
  regional_iso_ne_fallback: "the regional ISO New England profile (a typical day, not today's grid)",
  live_lme_api: "live marginal emissions from the LME API",
};

const usd = (v: number, digits = 0) => `${v < 0 ? "−" : ""}$${fmtNum(Math.abs(v), digits)}`;
const usdCompact = (v: number) => `${v < 0 ? "−" : ""}$${fmtCompact(Math.abs(v))}`;
const tons = (v: number, digits = 2) => fmtNum(v, digits);

type Live = { key: ClimateScenarioKey } & ({ status: "loading" } | { status: "ok"; data: ClimateDashboard } | { status: "error"; message: string });

export default function Climate() {
  const [artifact, setArtifact] = useState<ClimateArtifact | null>(null);
  const [pick, setPick] = useState<ClimateScenarioKey | null>(null);
  const [customKwh, setCustomKwh] = useState("");
  const [live, setLive] = useState<Live | null>(null);

  useEffect(() => {
    let on = true;
    loadClimate().then((a) => {
      if (!on) return;
      setArtifact(a);
      setPick(a.defaultScenario);
    });
    return () => {
      on = false;
    };
  }, []);

  const custom = CLIMATE_API && customKwh.trim() !== "" && Number(customKwh) >= 50 && Number(customKwh) <= 5000 ? Number(customKwh) : null;
  const key: ClimateScenarioKey | null = pick && (custom !== null ? { ...pick, total_monthly_kwh: custom } : pick);
  const keyId = key ? `${key.total_monthly_kwh}|${key.shiftable_load_kwh}|${key.max_battery_capacity_kwh}` : "";

  useEffect(() => {
    if (!CLIMATE_API || !key) return;
    const ctl = new AbortController();
    setLive({ key, status: "loading" });
    const t = setTimeout(() => {
      fetchClimateDashboard(CLIMATE_API, key, ctl.signal)
        .then((data) => setLive({ key, status: "ok", data }))
        .catch((err: unknown) => {
          if (!ctl.signal.aborted) setLive({ key, status: "error", message: err instanceof Error ? err.message : String(err) });
        });
    }, 300);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [keyId]); // keyId stands for key, which is a new object every render

  const current = live && key && sameScenario(live.key, key) ? live : null;
  const saved = artifact && key ? findScenario(artifact, key) : null;
  const d = current?.status === "ok" ? current.data : saved;
  const set = (patch: Partial<ClimateScenarioKey>) => pick && setPick({ ...pick, ...patch });

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">How much CO₂ does a home's electricity cause?</h1>
          <p className="page-lede">
            One Massachusetts household on the New England grid: its emissions today, how much moving use to cleaner hours could cut, which
            upgrades pay for themselves per ton avoided, and whether solar or a battery is worth buying now or later. Pick a home below.
            Every figure is <strong>modeled</strong> for a home like that, not read from a meter.
          </p>
        </div>
      </div>

      {!artifact || !pick || !key ? (
        <div className="loading">Loading the climate model…</div>
      ) : (
        <>
          <div className="filters" role="group" aria-label="Household">
            <Filter label="Monthly use">
              <Segmented
                label="Monthly use"
                value={custom !== null ? "" : String(pick.total_monthly_kwh)}
                onChange={(v) => {
                  setCustomKwh("");
                  set({ total_monthly_kwh: Number(v) });
                }}
                options={artifact.options.total_monthly_kwh.map((k) => ({ value: String(k), label: `${fmtNum(k)} kWh`, title: KWH_HINT[k] }))}
              />
              {CLIMATE_API ? (
                <input
                  className="input"
                  type="number"
                  min={50}
                  max={5000}
                  step={10}
                  inputMode="numeric"
                  placeholder="Other"
                  aria-label="Monthly use in kWh, any value (asks the Climate API)"
                  value={customKwh}
                  onChange={(e) => setCustomKwh(e.target.value)}
                  style={{ width: 96 }}
                />
              ) : null}
            </Filter>
            <Filter label="Flexible use a day">
              <Segmented
                label="Flexible use a day"
                value={String(pick.shiftable_load_kwh)}
                onChange={(v) => set({ shiftable_load_kwh: Number(v) })}
                options={artifact.options.shiftable_load_kwh.map((k) => ({ value: String(k), label: FLEX_LABEL[k] ?? `${fmtNum(k)} kWh`, title: FLEX_HINT[k] }))}
              />
            </Filter>
            <Filter label="Home battery">
              <Segmented
                label="Home battery"
                value={String(pick.max_battery_capacity_kwh)}
                onChange={(v) => set({ max_battery_capacity_kwh: Number(v) })}
                options={artifact.options.max_battery_capacity_kwh.map((k) => ({ value: String(k), label: k === 0 ? "None" : `${fmtNum(k)} kWh` }))}
              />
            </Filter>
            {CLIMATE_API ? (
              <span className="tile-meta" role="status">
                {current?.status === "ok"
                  ? `Live from the Climate API, ${fmtNum(current.data.metadata.compute_ms)} ms`
                  : current?.status === "error"
                    ? `Climate API unavailable (${current.message})${saved ? "; showing the saved answer" : ""}`
                    : "Asking the Climate API…"}
              </span>
            ) : null}
          </div>

          {d ? (
            <ClimateBody d={d} artifact={artifact} battery={key.max_battery_capacity_kwh > 0} />
          ) : current?.status === "error" ? (
            <Callout>
              The Climate API could not answer for {fmtNum(key.total_monthly_kwh)} kWh: {current.message}. Pick one of the preset monthly
              amounts to see the saved answer.
            </Callout>
          ) : (
            <div className="loading">Computing…</div>
          )}
        </>
      )}
    </>
  );
}

function ClimateBody({ d, artifact, battery }: { d: ClimateDashboard; artifact: ClimateArtifact; battery: boolean }) {
  const { summary: s, now_arbitrage: now, later_decisions: later, metadata: meta } = d;
  const as = artifact.assumptions;
  const scc = artifact.apiDefaults.scc_usd_per_ton;
  const weight = artifact.apiDefaults.carbon_vs_cost_weight;
  const hours = now.hourly_series;
  const hourNames = hours.map((h) => hourLabel(h.hour));
  const intensity = hours.map((h) => h.emissions_intensity_g_co2e_per_kwh);
  const cleanest = intensity.indexOf(Math.min(...intensity));
  const dirtiest = intensity.indexOf(Math.max(...intensity));
  const moved = movedKwh(d);
  const fan = later.fan_chart;
  const last = fan.years.length - 1;
  const peakFrom = as.touUsdPerKwh.peakHours[0];
  const peakTo = as.touUsdPerKwh.peakHours[as.touUsdPerKwh.peakHours.length - 1] + 1;

  return (
    <div className="grid">
      <div className="span-12 tiles" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <StatTile label="CO₂ from this home's electricity" value={tons(s.current_annual_metric_tons)} unit="t CO₂e / yr" meta="at today's grid mix" />
        <StatTile
          label={`Over ${as.analysisYears} years if nothing changes`}
          value={fmtNum(s.lifetime_co2_liability_metric_tons, 1)}
          unit="t CO₂e"
          meta={`today's yearly total × ${as.analysisYears}`}
        />
        <StatTile
          label="Cut from timing alone"
          value={fmtNum(s.best_case_reduction_pct, 1)}
          unit="%"
          meta={s.best_case_reduction_pct > 0 ? `${tons(now.schedulable_reductions_annual_metric_tons)} t a year, same kWh at cleaner hours` : "no flexible use or battery to move"}
        />
        <StatTile label="Social cost of these emissions" value={usd(s.social_carbon_damage_yr_usd)} unit="/ yr" meta={`at ${usd(scc)} a ton; not on your bill`} />
        <StatTile
          label="Carbon yield of solar + timing"
          value={fmtNum(tonsPerThousandUsd(s.portfolio_carbon_yield_pct), 2)}
          unit="t / yr per $1k"
          meta="CO₂ avoided a year per $1,000 of solar price"
        />
      </div>

      <ChartCard
        className="span-8"
        title="Moving use to cleaner hours"
        subtitle={
          moved > 0.01
            ? `A typical day for this home: its usual hour-by-hour use, and the schedule an optimizer picks instead (${fmtPct(weight)} weight on CO₂, the rest on the bill). It moves about ${fmtNum(moved, 1)} kWh a day into cleaner, cheaper hours${battery ? ", charging the battery overnight to cover the evening peak" : ""}.`
            : "A typical day for this home. With no flexible use and no battery there is nothing to move, so the two lines are the same."
        }
        source={`Time-of-use rate in the model: ${fmtNum(as.touUsdPerKwh.offPeak * 100)}¢/kWh, ${fmtNum(as.touUsdPerKwh.peak * 100)}¢ from ${hourLabel(peakFrom)} to ${hourLabel(peakTo % 24)}. Linear program (HiGHS) in the backend; battery round trip ${fmtPct(as.batteryRoundTripEfficiency)}.`}
        table={{
          columns: [
            { key: "h", label: "Hour", render: (h) => hourLabel(h.hour) },
            { key: "g", label: "Grid g CO₂e/kWh", align: "r", render: (h) => fmtNum(h.emissions_intensity_g_co2e_per_kwh) },
            { key: "b", label: "Usual kWh", align: "r", render: (h) => fmtNum(h.baseline_load_kwh, 2) },
            { key: "o", label: "Shifted kWh", align: "r", render: (h) => fmtNum(h.optimized_load_kwh, 2) },
          ],
          rows: hours,
        }}
      >
        <Legend
          items={[
            { label: "Usual pattern", color: "var(--ink-2)" },
            { label: "Shifted to cleaner hours", color: "var(--series-1)" },
          ]}
        />
        <LineChart
          x={hourNames}
          xKind="category"
          series={[
            { id: "base", label: "Usual pattern", color: "var(--ink-2)", values: hours.map((h) => h.baseline_load_kwh) },
            { id: "opt", label: "Shifted", color: "var(--series-1)", values: hours.map((h) => h.optimized_load_kwh) },
          ]}
          zeroBased
          yFormat={(v) => fmtNum(v)}
          valueFormat={(v) => `${fmtNum(v, 2)} kWh`}
          titleFor={(i) => `${hourNames[i]} · grid ${fmtNum(intensity[i])} g CO₂e/kWh`}
          height={280}
          ariaLabel="Hourly use, usual pattern versus shifted to cleaner hours"
        />
      </ChartCard>

      <ChartCard
        className="span-4"
        title="How dirty the grid is, by hour"
        subtitle={`Extra CO₂ per extra kWh (marginal emissions), a typical day: cleanest at ${hourNames[cleanest]}, dirtiest at ${hourNames[dirtiest]} when gas peaking plants run.`}
        source={`Average ${fmtNum(now.average_grid_intensity_g_co2e_per_kwh)}, peak ${fmtNum(now.marginal_peak_intensity_g_co2e_per_kwh)} g CO₂e/kWh. Source: ${SOURCE_MODE[meta.data_source_mode] ?? meta.data_source_mode}.`}
        table={{
          columns: [
            { key: "h", label: "Hour", render: (h) => hourLabel(h.hour) },
            { key: "g", label: "g CO₂e/kWh", align: "r", render: (h) => fmtNum(h.emissions_intensity_g_co2e_per_kwh) },
          ],
          rows: hours,
        }}
      >
        <ColumnChart
          categories={hourNames}
          values={intensity}
          colorFor={(i) => (i === dirtiest ? "var(--series-2)" : i === cleanest ? "var(--series-1)" : "var(--muted-series)")}
          height={280}
          yFormat={(v) => fmtNum(v)}
          valueFormat={(v) => `${fmtNum(v)} g`}
          labelled={[cleanest, dirtiest]}
          titleFor={(i) => hourNames[i]}
          ariaLabel="Marginal grid emissions by hour of a typical day, grams CO2e per kWh"
        />
      </ChartCard>

      <ChartCard
        className="span-7"
        title="What to do first: cost per ton of CO₂ avoided"
        subtitle="Each bar is as wide as the CO₂ the step avoids a year and as tall as its net cost per ton, cheapest first. Below the line, the bill savings outweigh the cost."
        source="Load shift and battery come from the optimizer above; thermostat and weatherization are the backend's fixed typical-home estimates."
        table={{
          columns: [
            { key: "n", label: "Step", render: (m) => m.intervention_name },
            { key: "c", label: "Net $/t", align: "r", render: (m) => usd(m.abatement_cost_usd_per_ton), sort: (m) => m.abatement_cost_usd_per_ton },
            { key: "t", label: "t CO₂e / yr", align: "r", render: (m) => tons(m.annual_tons_abated), sort: (m) => m.annual_tons_abated },
            { key: "s", label: "Bill savings / yr", align: "r", render: (m) => usd(m.annual_net_financial_savings_usd), sort: (m) => m.annual_net_financial_savings_usd },
          ],
          rows: now.macc_curve,
        }}
      >
        <Legend
          items={[
            { label: "Pays for itself", color: "var(--series-1)", key: "rect" },
            { label: "Costs money", color: "var(--series-2)", key: "rect" },
          ]}
        />
        <MaccChart
          bars={now.macc_curve.map((m) => ({
            label: m.intervention_name,
            costPerTon: m.abatement_cost_usd_per_ton,
            tonsPerYear: m.annual_tons_abated,
            rows: [
              { key: "rect", color: m.abatement_cost_usd_per_ton < 0 ? "var(--series-1)" : "var(--series-2)", value: usd(m.abatement_cost_usd_per_ton), label: "net per ton" },
              { value: tons(m.annual_tons_abated), label: "t CO₂e a year" },
              { value: usd(m.annual_net_financial_savings_usd), label: "bill savings a year" },
            ],
          }))}
          costFormat={(v) => usdCompact(v)}
          tonsFormat={(v) => fmtNum(v, 1)}
          ariaLabel="Marginal abatement cost curve"
        />
        <ol className="macc-list">
          {now.macc_curve.map((m, i) => (
            <li key={m.intervention_name}>
              <span className="macc-rank">{i + 1}</span>
              <span>{m.intervention_name}</span>
              <span className="macc-meta">
                {usd(m.abatement_cost_usd_per_ton)} a ton · {tons(m.annual_tons_abated)} t a year · {usd(m.annual_net_financial_savings_usd)} off the bill a year
              </span>
            </li>
          ))}
        </ol>
      </ChartCard>

      <ChartCard
        className="span-5"
        title="This home's CO₂ as the grid gets cleaner"
        subtitle={`Yearly emissions over ${fan.years.length} years: median and the 5–95% range of ${fmtNum(meta.mc_paths)} simulated paths. Median year 1: ${tons(fan.median_tons[0])} t; year ${fan.years[last]}: ${tons(fan.median_tons[last])} t.`}
        source={`Monte Carlo: grid carbon intensity wanders around a ${fmtPct(as.annualGridDecarbRate, 1)}-a-year decline (Ornstein–Uhlenbeck, θ ${as.ouTheta}, σ ${as.ouSigmaGPerKwh} g); seed ${meta.mc_seed}. Uses the day's average grid intensity, so year 1 is below the hour-weighted total above.`}
        table={{
          columns: [
            { key: "y", label: "Year", render: (i) => String(fan.years[i]) },
            { key: "5", label: "P5", align: "r", render: (i) => tons(fan.p05_lower_bound_tons[i]) },
            { key: "50", label: "Median", align: "r", render: (i) => tons(fan.median_tons[i]) },
            { key: "95", label: "P95", align: "r", render: (i) => tons(fan.p95_upper_bound_tons[i]) },
          ],
          rows: fan.years.map((_, i) => i),
        }}
      >
        <Legend
          items={[
            { label: "Median", color: "var(--series-1)" },
            { label: "5–95% range", color: "var(--series-1)", key: "band" },
          ]}
        />
        <LineChart
          x={fan.years.map(String)}
          xKind="category"
          series={[{ id: "p50", label: "Median", color: "var(--series-1)", values: fan.median_tons }]}
          band={{ label: "5–95% range", color: "var(--series-1)", lower: fan.p05_lower_bound_tons, upper: fan.p95_upper_bound_tons }}
          zeroBased
          yFormat={(v) => fmtNum(v, 1)}
          valueFormat={(v) => `${tons(v)} t`}
          titleFor={(i) => `Year ${fan.years[i]}`}
          height={260}
          ariaLabel="Yearly CO2 over the next 20 years, median and 5 to 95 percent range"
        />
      </ChartCard>

      {later.assets.map((a) => (
        <AssetCard key={a.asset_name} a={a} artifact={artifact} />
      ))}

      <Card className="span-12" title="How this is modeled" source={`${artifact.endpoint} (Backend/app.py) · saved by ${artifact.builtBy} · Monte Carlo engine: ${artifact.mcEngine}`}>
        <div className="prose">
          <ul>
            <li>
              <strong>Grid emissions:</strong> marginal emissions for each hour from {SOURCE_MODE[meta.data_source_mode] ?? meta.data_source_mode}.
              The same day is used all year.
            </li>
            <li>
              <strong>This home:</strong> the monthly kWh spread over a typical residential hour-by-hour shape. Flexible use is the kWh a day that
              can run at any hour; the battery is usable capacity. Everything else is at the API's defaults (ZIP {artifact.apiDefaults.zip_code},{" "}
              {artifact.apiDefaults.billing_days}-day month, {fmtNum(artifact.apiDefaults.max_grid_draw_kw)} kW grid limit).
            </li>
            <li>
              <strong>Dollars:</strong> the social cost of carbon is {usd(scc)} a ton (U.S. EPA's 2023 estimate): damage to society, not a charge on the
              bill. Bill savings use the time-of-use rate above; solar savings use {fmtNum(as.avoidedElectricityUsdPerKwh * 100)}¢/kWh.
            </li>
            <li>
              <strong>Solar and battery timing:</strong> net value in today's dollars ({fmtPct(as.discountRate)} a year discount) of buying now or after
              1–3 years, as prices fall and the grid gets cleaner. It assumes a {fmtPct(as.assets[0]?.federalTaxCreditPct ?? 0)} federal tax credit on
              the price; check what credits apply before buying.
            </li>
            <li>
              <strong>What it is not:</strong> a reading of anyone's meter or a quote. The numbers move with the household inputs and the model's
              assumptions; they are a way to compare options, not a promise of savings.
            </li>
          </ul>
        </div>
      </Card>
    </div>
  );
}

function AssetCard({ a, artifact }: { a: ClimateAsset; artifact: ClimateArtifact }) {
  const spec = artifact.assumptions.assets.find((x) => x.name === a.asset_name);
  const steps = a.deferral_analysis;
  const best = bestDeferral(a);
  const bestIdx = steps.indexOf(best);
  const now = steps[0];
  const install = a.recommendation === "INSTALL NOW";
  const when = (y: number) => (y === 0 ? "Now" : `In ${y} yr${y > 1 ? "s" : ""}`);
  return (
    <Card
      className="span-6"
      title={a.asset_name}
      subtitle={
        install
          ? `Buying now is worth ${usd(now.net_option_value_usd)} in today's dollars; waiting a year, ${usd(steps[1]?.net_option_value_usd ?? now.net_option_value_usd)}. Each year of waiting also releases ${tons(a.delay_cost_metric_tons_per_yr)} t of CO₂ it would have avoided.`
          : `Waiting ${best.defer_years} year${best.defer_years > 1 ? "s" : ""} is worth the most (${usd(best.net_option_value_usd)} vs ${usd(now.net_option_value_usd)} now) as prices fall ${fmtPct(a.annual_hardware_deflation_rate, 1)} a year${best.net_option_value_usd < 0 ? "; no timing here pays for itself" : ""}.`
      }
    >
      <div className="stack">
        <div className="row">
          <span className="badge badge-lg">
            <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 999, background: install ? "var(--low)" : "var(--mid)" }} />
            {install ? "Install now" : "Hold and wait"}
          </span>
          <span className="tile-meta">the backend's timing call</span>
        </div>
        <dl className="kv">
          <dt>Price before credits</dt>
          <dd>{usd(a.capex_usd)}</dd>
          <dt>Price trend</dt>
          <dd>−{fmtPct(a.annual_hardware_deflation_rate, 1)} a year</dd>
          <dt>Net cost per ton avoided</dt>
          <dd>
            {usd(a.marginal_abatement_cost_usd_per_ton)}
            {a.marginal_abatement_cost_usd_per_ton < 0 ? " (saves money)" : ""}
          </dd>
          <dt>CO₂ avoided over its life</dt>
          <dd>
            {fmtNum(a.co2_averted_lifetime_tons_median, 1)} t ({fmtNum(a.co2_averted_lifetime_tons_p05, 1)}–{fmtNum(a.co2_averted_lifetime_tons_p95, 1)})
            {spec ? `, ${spec.lifeYears} years` : ""}
          </dd>
        </dl>
        <div>
          <p className="filter-label" style={{ marginBottom: 6 }}>
            Net value if bought…
          </p>
          <ColumnChart
            categories={steps.map((x) => when(x.defer_years))}
            values={steps.map((x) => x.net_option_value_usd)}
            colorFor={(i) => (i === bestIdx ? "var(--series-1)" : "var(--muted-series)")}
            height={180}
            yFormat={usdCompact}
            valueFormat={(v) => usd(v)}
            labelled={steps.flatMap((x, i) => (i === bestIdx || (i === 0 && x.net_option_value_usd >= 0) ? [i] : []))}
            titleFor={(i) => `${a.asset_name}: bought ${when(steps[i].defer_years).toLowerCase()}`}
            ariaLabel={`${a.asset_name}: net value by year of purchase`}
          />
        </div>
      </div>
    </Card>
  );
}
