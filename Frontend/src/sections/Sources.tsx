import { Card, DataTable } from "../components/ui.tsx";
import { fmtNum } from "../data/format.ts";
import { consumptionStats, eia, hmm, recs, savingsModel, towns } from "../data/load.ts";

const SOURCES = [
  {
    file: "data/build/eia_ma_monthly.csv",
    what: "Massachusetts residential electricity: revenue, sales, accounts, average price, kWh per account",
    source: "U.S. EIA, Form EIA-861M",
    coverage: `${eia[0].ym} – ${eia[eia.length - 1].ym} (2026 preliminary)`,
  },
  {
    file: "data/build/eia_ma_total_monthly.csv",
    what: "All-sector totals for context",
    source: "U.S. EIA, Form EIA-861M",
    coverage: "2010-01 – 2026-08",
  },
  {
    file: "data/snapshot/monthly_residential_cents_2026-07-02.csv",
    what: "Basic service monthly (variable) residential rates by utility, ¢/kWh",
    source: "Mass.gov DPU “Basic Service Rates”, retrieved 2 Jul 2026",
    coverage: "2005-01 – 2027-01",
  },
  {
    file: "data/snapshot/fixed_residential_cents_2026-07-02.csv",
    what: "Basic service fixed-option rates, on each term's last month",
    source: "Mass.gov DPU “Basic Service Rates”, retrieved 2 Jul 2026",
    coverage: `current term ${savingsModel.basicServiceRatesCents.term.replace("..", " – ")}`,
  },
  {
    file: "data/build/recs_ma.csv",
    what: `${recs.length} Massachusetts homes: annual kWh, size, heating fuel, home type, household size, survey weight`,
    source: "U.S. EIA, Residential Energy Consumption Survey 2020",
    coverage: "2020 (one survey year)",
  },
  {
    file: "data/build/isone_ma_daily.csv",
    what: "Daily real-time load and temperature for NEMA, SEMA, WCMA (input to the grid regimes and forecast)",
    source: "ISO New England",
    coverage: "2017-01-01 – 2023-12-31",
  },
  {
    file: "data/build/ma_towns.csv",
    what: `${towns.length} towns: county, ISO-NE zone (approximate), population 2020 and 2024`,
    source: "U.S. Census Bureau; zone mapping from the backend",
    coverage: "2020, 2024",
  },
  {
    file: "Frontend/src/geo/ma-towns.topo.json",
    what: "Town boundaries, simplified to 6% for the web",
    source: "MassGIS via the Leventhal Map & Education Center's cleaned municipal boundaries",
    coverage: "351 municipalities",
  },
];

const ARTIFACTS = [
  { file: "consumption_stats.json", used: "Typical account, RECS bands, seasonal shares (Overview, Usage, calculator)" },
  { file: "hmm_regimes.json", used: `Monthly Low/Mid/High use regimes, ${hmm.timeline.length} months (Overview, Usage)` },
  { file: "savings_model.json", used: "Current basic-service term and worked examples (Prices)" },
  { file: "map_consumption.json", used: "Traffic-light cut points and the modeled per-town level (Usage, Towns)" },
  { file: "regimes.json", used: "Homes (monthly) and grid zones (daily) vs their usual range, outlooks (Overview, Regimes & forecast)" },
  { file: "mc_forecast.json", used: "Six-month load forecast and its walk-forward test (Overview, Regimes & forecast)" },
];

export default function Sources() {
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Data and methods</h1>
          <p className="page-lede">
            Every number on this site comes from a public source committed to this repository, through the Python backend in{" "}
            <code className="code">Backend/</code>. The dashboard reads the same files; nothing is fetched from a third-party API at
            runtime.
          </p>
        </div>
      </div>
      <div className="grid">
        <Card className="span-12" title="Sources">
          <DataTable
            caption="Data sources"
            maxHeight="none"
            columns={[
              { key: "w", label: "What", render: (s) => <span style={{ whiteSpace: "normal" }}>{s.what}</span> },
              { key: "s", label: "Source", render: (s) => <span style={{ whiteSpace: "normal" }}>{s.source}</span> },
              { key: "c", label: "Coverage", render: (s) => s.coverage },
              { key: "f", label: "File", render: (s) => <code className="code">{s.file}</code> },
            ]}
            rows={SOURCES}
          />
        </Card>

        <Card className="span-6" title="How the numbers are made">
          <div className="prose">
            <h3>Prices</h3>
            <p>
              Average price is revenue ÷ sales over the period (EIA's own definition), never an average of monthly prices. It covers
              delivery and supply for every residential customer, including those on competitive supply.
            </p>
            <h3>Use per home</h3>
            <p>
              Monthly charts use EIA's kWh per account. The “typical home” figure ({fmtNum(consumptionStats.typicalAccount.annualKwh)}{" "}
              kWh in 2025) divides sales by a 12-month trailing average of accounts, because monthly account counts jump 3–10%.
            </p>
            <h3>Use regimes</h3>
            <p>
              A 3-state Gaussian hidden Markov model over monthly kWh per account (seed {hmm.seed}). States are sorted by mean so Low &lt;
              Mid &lt; High.
            </p>
            <h3>A home like yours</h3>
            <p>
              Weighted percentiles of RECS 2020 annual kWh (NWEIGHT): the first value whose cumulative weight reaches the percentile.
              Combinations with fewer than 20 surveyed homes fall back to broader groups, and the page says which answers were dropped.
              Low / Mid / High are the state's weighted thirds: ≤ 4,815 kWh, ≤ 7,967 kWh, above.
            </p>
            <h3>Savings calculator</h3>
            <p>
              Supply portion only: (basic-service rate − your rate) × kWh ÷ 100 per month, against the fixed basic-service term that
              covers the month. Positive means you saved. Totals use the same compensated summation and half-up cent rounding as the
              backend, so the two always agree to the cent.
            </p>
            <h3>Usual-range regimes</h3>
            <p>
              Each month (homes) or day (grid zones) is compared with the same period in the previous five years; the usual range is
              that average ± 1 standard deviation. A 3-state HMM with states anchored below, within and above the range smooths the
              call. Only earlier years are used, so history is never re-coloured by later data.
            </p>
            <h3>Six-month forecast</h3>
            <p>
              10,000 simulated paths: a past Nov–Apr weather season, the zone's weather model and regime switching, scaled to today's
              level with EIA sales because the ISO-NE files end in 2023. Before being shown, it was fit on data to Oct 2021 and scored
              on two later winters.
            </p>
          </div>
        </Card>

        <Card className="span-6" title="Limits worth knowing">
          <div className="prose">
            <ul>
              <li>RECS 2020 is one COVID-year survey of 552 homes; its bands are wide on purpose.</li>
              <li>EIA revises preliminary months (all of 2026 so far), so recent values can change.</li>
              <li>There is no verified per-town usage data, so towns are never coloured by consumption.</li>
              <li>ISO-NE load includes businesses as well as homes, and the files in the repo end on 31 Dec 2023.</li>
              <li>Usual-range regimes don't remove weather: a heat wave above the range counts as Above.</li>
              <li>The forecast simulates zones independently, so the statewide band is probably too narrow.</li>
              <li>Town-to-zone assignment is approximate (the backend's <code className="code">zone_approx</code> column).</li>
              <li>Dollar figures cover electricity supply only; delivery charges are not modeled.</li>
            </ul>
          </div>
        </Card>

        <Card className="span-6" title="Backend artifacts this site reads">
          <DataTable
            caption="Backend artifacts"
            maxHeight="none"
            columns={[
              { key: "f", label: "Backend/data/build/…", render: (a) => <code className="code">{a.file}</code> },
              { key: "u", label: "Used for", render: (a) => <span style={{ whiteSpace: "normal" }}>{a.used}</span> },
            ]}
            rows={ARTIFACTS}
          />
        </Card>

        <Card className="span-6" title="Rebuild">
          <div className="prose">
            <p>Regenerate the backend artifacts, then rebuild the site — it picks up the new files automatically.</p>
            <pre className="code">{`cd Backend
python3 src/backend/build_stats.py
python3 src/backend/build_savings.py
python3 src/backend/build_map.py
python3 -m src.hmm.hmm_build
python3 -m backend.regimes.build
python3 -m backend.forecast.mc
python3 -m pytest tests -q

cd ../Frontend
npm install
npm test          # parity checks against the artifacts
npm run build     # static site in Frontend/dist`}</pre>
          </div>
        </Card>
      </div>
    </>
  );
}
