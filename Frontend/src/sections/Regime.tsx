// The Regime tab: the usual-range model (regimes.json): the nowcast, the outlook, how the three regimes
// behave and the six-month forecast. #/grid opens this tab and scrolls there.

import Grid from "./Grid.tsx";

export default function Regime() {
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Energy use regimes</h1>
          <p className="page-lede">Is Massachusetts using more than usual, how long that tends to last, and the next six months.</p>
        </div>
      </div>
      <section id="sec-grid" className="page-section" aria-label="Regimes & forecast">
        <Grid />
      </section>
    </>
  );
}
