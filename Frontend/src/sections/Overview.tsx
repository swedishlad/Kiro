import { useEffect, useMemo, useState } from "react";

import { ColumnChart, HBarChart } from "../components/BarChart.tsx";
import { LineChart } from "../components/LineChart.tsx";
import { RANGE_LABELS, RANGE_SHORT, RegimeBadge, RegimeLegend, fromGrid, type Regime } from "../components/regime.tsx";
import { Card, ChartCard, StatTile, type Tone } from "../components/ui.tsx";
import { calendarYears, sliceRange, trailing12 } from "../data/derive.ts";
import { dateLabel, fmtCents, fmtCompact, fmtNum, fmtSignedPct, ymLabel, ymShort } from "../data/format.ts";
import { consumptionStats, eia, loadGrid, monthlyRates, savingsModel, type GridBundle } from "../data/load.ts";
import { UTILITIES, ZONE_NAMES, type UtilityId } from "../data/model.ts";

function delta(now: number, before: number, upIsBad: boolean | null): { text: string; tone: Tone } {
  const f = now / before - 1;
  const tone: Tone = upIsBad === null || Math.abs(f) < 0.005 ? "flat" : (f > 0) === upIsBad ? "bad" : "good";
  return { text: `${fmtSignedPct(f)} vs prior 12 mo`, tone };
}

export function Overview() {
  const latest = eia[eia.length - 1];
  const ttm = trailing12(eia);
  const prev = trailing12(eia, 12);
  const years = calendarYears(eia);
  const first = years[0];
  const ratesTerm = savingsModel.basicServiceRatesCents;
  const fixedRates = UTILITIES.map((u) => ratesTerm[u.id]);
  // Newest month of the variable (monthly) option: the coming winter's price.
  const winterYm = monthlyRates.NG[monthlyRates.NG.length - 1].ym;
  const winter = Object.fromEntries(UTILITIES.map((u) => [u.id, monthlyRates[u.id].find((p) => p.ym === winterYm)?.cents ?? 0])) as Record<UtilityId, number>;
  const winterMax = Math.max(...Object.values(winter), ...fixedRates);

  const recent = useMemo(() => sliceRange(eia, "5y"), []);
  const [grid, setGrid] = useState<GridBundle | null>(null);
  useEffect(() => {
    let live = true;
    loadGrid().then((g) => live && setGrid(g));
    return () => {
      live = false;
    };
  }, []);

  // Homes vs their usual range (regimes.json MA_RES), keyed by month; arrives with the lazy grid chunk.
  const homes = grid?.regimes.areas.find((a) => a.area === "MA_RES");
  const homesByYm = useMemo(() => new Map<string, Regime>((homes?.timeline ?? []).map((t) => [t.date.slice(0, 7), fromGrid(t.color)])), [homes]);
  const zones = grid?.regimes.areas.filter((a) => a.area !== "MA_RES") ?? [];

  const priceCols = years.map((y) => ({ label: String(y.year), price: y.priceCents }));

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Massachusetts electricity at a glance</h1>
          <p className="page-lede">
            What homes use, what they pay, and what basic service costs — from public EIA, Mass.gov and ISO New England data. Latest
            month: {ymLabel(latest.ym)}
            {latest.preliminary ? " (preliminary)" : ""}.
          </p>
        </div>
      </div>

      <div className="grid">
        <section className="card span-12" aria-label="Headline price">
          <div className="hero">
            <div>
              <p className="hero-label">Average residential electricity price, last 12 months</p>
              <p className="hero-value">
                {fmtNum(ttm.priceCents, 1)}¢<small>per kWh</small>
              </p>
              <p className="hero-context">
                {ymLabel(ttm.from)} – {ymLabel(ttm.to)}: {fmtSignedPct(ttm.priceCents / prev.priceCents - 1)} on the previous 12 months and{" "}
                {fmtNum(ttm.priceCents / first.priceCents, 1)}× the {first.year} average of {fmtCents(first.priceCents)}. This is what
                Massachusetts homes paid per kWh across all utilities, delivery and supply combined.
              </p>
            </div>
            <div>
              <ColumnChart
                categories={priceCols.map((c) => c.label)}
                values={priceCols.map((c) => c.price)}
                colorFor={(i) => (i === priceCols.length - 1 ? "var(--series-1)" : "var(--muted-series)")}
                height={200}
                yFormat={(v) => `${fmtNum(v)}¢`}
                valueFormat={(v) => fmtCents(v)}
                labelled={[0, priceCols.length - 1]}
                tickLabel={(i) => `’${priceCols[i].label.slice(2)}`}
                titleFor={(i) => `${priceCols[i].label} average price`}
                ariaLabel="Average residential price by calendar year"
              />
            </div>
          </div>
        </section>

        <div className="span-12 tiles">
          <StatTile
            label="Typical home, calendar 2025"
            value={fmtNum(consumptionStats.typicalAccount.annualKwh)}
            unit="kWh / yr"
            meta="EIA statewide average account"
            spark={consumptionStats.typicalAccount.monthlyKwh}
          />
          <StatTile
            label="Residential sales, last 12 months"
            value={fmtNum(ttm.salesGwh / 1000, 1)}
            unit="TWh"
            delta={delta(ttm.salesGwh, prev.salesGwh, null)}
          />
          <StatTile
            label="Residential accounts (12-mo avg)"
            value={fmtCompact(ttm.avgCustomers, 2)}
            delta={delta(ttm.avgCustomers, prev.avgCustomers, null)}
          />
          <StatTile
            label={`Basic service fixed rate, ${ymShort(ratesTerm.term.split("..")[0])} – ${ymShort(ratesTerm.term.split("..")[1])}`}
            value={`${fmtNum(Math.min(...fixedRates), 1)}–${fmtNum(Math.max(...fixedRates), 1)}`}
            unit="¢ / kWh"
            meta="supply only, by utility"
          />
          <div className="tile">
            <span className="tile-label">Homes vs their usual range, {homes ? ymLabel(homes.current.date.slice(0, 7)) : "…"}</span>
            <span style={{ margin: "6px 0 4px" }}>{homes ? <RegimeBadge regime={fromGrid(homes.current.color)} labels={RANGE_LABELS} large /> : "—"}</span>
            <span className="tile-meta">
              {homes ? `${fmtSignedPct(homes.current.pctVsAverage / 100)} vs the same month, last 5 yrs (range ±${fmtNum(homes.current.bandPct, 1)}%)` : "Loading…"}
            </span>
          </div>
        </div>

        <ChartCard
          className="span-8"
          title="Monthly use per residential account"
          subtitle="Last 5 years. The strip underneath compares each month with the same month in the previous five years."
          source={
            <>
              EIA-861M sales ÷ accounts; usual range = 5-year average ± 1 sd, smoothed by a hidden Markov model. <a href="#/grid">More →</a>
            </>
          }
          table={{
            columns: [
              { key: "m", label: "Month", render: (r) => ymLabel(r.ym) },
              { key: "k", label: "kWh / account", align: "r", render: (r) => fmtNum(r.kwhPerCustomer) },
              { key: "g", label: "vs usual range", render: (r) => { const g = homesByYm.get(r.ym); return g ? <RegimeBadge regime={g} labels={RANGE_LABELS} /> : "—"; } },
            ],
            rows: [...recent].reverse(),
          }}
        >
          <RegimeLegend labels={RANGE_LABELS} />
          <LineChart
            x={recent.map((r) => r.ym)}
            xKind="month"
            series={[{ id: "kwh", label: "kWh per account", color: "var(--series-1)", values: recent.map((r) => r.kwhPerCustomer) }]}
            strip={{ label: "vs usual range", values: recent.map((r) => homesByYm.get(r.ym) ?? null), labels: RANGE_SHORT }}
            yFormat={(v) => fmtNum(v)}
            valueFormat={(v) => `${fmtNum(v)} kWh`}
            titleFor={(i) => ymLabel(recent[i].ym)}
            noteFor={(i) => (recent[i].preliminary ? "Preliminary EIA figure" : undefined)}
            height={250}
            ariaLabel="Monthly kWh per residential account over the last five years"
          />
        </ChartCard>

        <Card
          className="span-4"
          title="Basic service rates"
          subtitle="Residential supply, ¢ per kWh, by utility"
          source={
            <>
              Mass.gov DPU; supply portion only. <a href="#/prices">Compare your supplier →</a>
            </>
          }
        >
          <div className="stack">
            <div>
              <p className="filter-label" style={{ marginBottom: 6 }}>
                Fixed option, {ymLabel(ratesTerm.term.split("..")[0])} – {ymLabel(ratesTerm.term.split("..")[1])}
              </p>
              <HBarChart
                rows={UTILITIES.map((u) => ({ label: u.name, value: ratesTerm[u.id], color: "var(--series-1)" }))}
                valueFormat={(v) => fmtCents(v, 2)}
                domainMax={winterMax}
                barHeight={14}
                gap={10}
                ariaLabel="Basic service fixed rates by utility"
              />
            </div>
            <div>
              <p className="filter-label" style={{ marginBottom: 6 }}>
                Monthly option, {ymLabel(winterYm)} (winter peak)
              </p>
              <HBarChart
                rows={UTILITIES.map((u) => ({ label: u.name, value: winter[u.id], color: "var(--series-2)" }))}
                valueFormat={(v) => fmtCents(v, 2)}
                domainMax={winterMax}
                barHeight={14}
                gap={10}
                ariaLabel={`Basic service monthly rates for ${ymLabel(winterYm)} by utility`}
              />
            </div>
          </div>
        </Card>

        <Card
          className="span-12"
          title="The grid: last observed day and the next six months"
          subtitle={
            zones.length
              ? `Each zone on ${dateLabel(zones[0].current.date)} (the latest day EIA has published; refreshed daily) vs its usual range, and the median load forecast for ${ymLabel(grid!.forecast.horizon[0])} – ${ymLabel(grid!.forecast.horizon[grid!.forecast.horizon.length - 1])}.`
              : "Loading ISO New England zones…"
          }
          source={
            <>
              ISO-NE (2017–2023) and EIA-930 daily load (all customer classes); walk-forward-tested Monte Carlo forecast. <a href="#/grid">Explore →</a>
            </>
          }
        >
          {grid ? (
            <div className="link-cards">
              {zones.map((a) => {
                const fc = grid.forecast.areas.find((f) => f.area === a.area);
                return (
                  <div key={a.area} className="state-card">
                    <strong style={{ fontSize: 14 }}>
                      {a.area} <span style={{ fontWeight: 400, color: "var(--ink-2)" }}>· {ZONE_NAMES[a.area as keyof typeof ZONE_NAMES]}</span>
                    </strong>
                    <span>
                      <RegimeBadge regime={fromGrid(a.current.color)} labels={RANGE_LABELS} suffix={` ${fmtSignedPct(a.current.pctVsAverage / 100)}`} />
                    </span>
                    {fc ? (
                      <span className="tile-meta">
                        Next 6 months: <strong style={{ color: "var(--ink)" }}>{fmtNum(fc.total.p50 / 1000, 1)} TWh</strong> (80%:{" "}
                        {fmtNum(fc.total.p10 / 1000, 1)}–{fmtNum(fc.total.p90 / 1000, 1)})
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="loading">Loading…</div>
          )}
        </Card>

        <Card className="span-12" title="Explore">
          <div className="link-cards">
            <a className="link-card" href="#/usage">
              <strong>Usage</strong>
              <span>16 years of monthly use, seasonal shape, and an estimate for a home like yours.</span>
            </a>
            <a className="link-card" href="#/prices">
              <strong>Prices & savings</strong>
              <span>Basic service history by utility and a calculator for your competitive supplier.</span>
            </a>
            <a className="link-card" href="#/grid">
              <strong>Regimes & forecast</strong>
              <span>Homes and grid zones vs their usual range, plus a tested six-month forecast.</span>
            </a>
            <a className="link-card" href="#/towns">
              <strong>Towns</strong>
              <span>All 351 cities and towns on a map: load zone, population and growth.</span>
            </a>
          </div>
        </Card>
      </div>
    </>
  );
}
