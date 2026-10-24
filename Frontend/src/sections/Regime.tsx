// The Regime tab: every regime model on one page. First the usual-range model (regimes.json): the nowcast, the
// outlook, how the three regimes behave and the six-month forecast; then the Low / Mid / High use-level model
// (hmm_regimes.json). #/grid and #/levels open this tab and scroll there.

import Grid from "./Grid.tsx";
import Levels from "./Levels.tsx";

const PARTS = [
  { id: "grid", label: "Regimes & forecast", Section: Grid },
  { id: "levels", label: "Use levels", Section: Levels },
];

export default function Regime() {
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Energy use regimes</h1>
          <p className="page-lede">Is Massachusetts using more than usual, how long that tends to last, and the next six months.</p>
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
