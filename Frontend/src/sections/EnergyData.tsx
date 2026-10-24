// The Energy data tab: the 3D hourly load surface first, then what used to be the Usage and Prices & savings tabs,
// then Climate. Each keeps its own heading and filters; #/hourly, #/usage, #/prices and #/climate scroll to them. The regime models
// have their own tab (Regime.tsx).

import Climate from "./Climate.tsx";
import Hourly from "./Hourly.tsx";
import Prices from "./Prices.tsx";
import Usage from "./Usage.tsx";

const PARTS = [
  { id: "hourly", label: "Hour by hour", Section: Hourly },
  { id: "usage", label: "Usage", Section: Usage },
  { id: "prices", label: "Prices & savings", Section: Prices },
  { id: "climate", label: "Climate", Section: Climate },
];

export default function EnergyData() {
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Massachusetts energy data</h1>
          <p className="page-lede">
            How much electricity Massachusetts homes use, what it costs and what basic service charges, from public EIA, Mass.gov and
            ISO New England data; then the CO₂ a home's electricity causes, modeled by the
            backend's climate engine.
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
