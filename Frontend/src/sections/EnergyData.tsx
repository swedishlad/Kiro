// The Energy data tab: what used to be the Usage, Prices & savings and Regimes & forecast tabs, one
// after another. Each keeps its own heading and filters; #/usage, #/prices and #/grid scroll to them.

import Grid from "./Grid.tsx";
import Prices from "./Prices.tsx";
import Usage from "./Usage.tsx";

const PARTS = [
  { id: "usage", label: "Usage", Section: Usage },
  { id: "prices", label: "Prices & savings", Section: Prices },
  { id: "grid", label: "Regimes & forecast", Section: Grid },
];

export default function EnergyData() {
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Massachusetts energy data</h1>
          <p className="page-lede">
            How much electricity Massachusetts homes use, what it costs and what basic service charges, and whether use is running above
            its usual range, from public EIA, Mass.gov and ISO New England data.
          </p>
          <nav className="jump" aria-label="Sections on this page">
            {PARTS.map((p) => (
              <a key={p.id} href={`#/${p.id}`}>
                {p.label}
              </a>
            ))}
          </nav>
        </div>
      </div>
      {PARTS.map(({ id, label, Section }) => (
        <section key={id} id={`sec-${id}`} className="page-section" aria-label={label}>
          <Section />
        </section>
      ))}
    </>
  );
}
