// The Low / Mid / High use-level model (hmm_regimes.json): how high monthly use per account is. It follows the
// seasons; the usual-range nowcast above it on the Regime tab says whether a month was unusual.

import { LEVEL_LABELS, REGIMES, RegimeBadge, RegimeIcon, fromHmm } from "../components/regime.tsx";
import { Card } from "../components/ui.tsx";
import { fmtNum, fmtPct } from "../data/format.ts";
import { hmm } from "../data/load.ts";

export default function Levels() {
  return (
    <>
      <div className="page-head">
        <div>
          <h2 className="page-title">Low / Mid / High use levels</h2>
          <p className="page-lede">A second, simpler model: how high monthly use per account is.</p>
        </div>
      </div>
      <div className="grid">
        <Card
          className="span-12"
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
              These levels follow the seasons (summer and mid-winter run High). Whether a month was unusual for its time of year is the
              nowcast above.
            </p>
            <TransitionTable />
          </div>
        </Card>
      </div>

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
                  {LEVEL_LABELS[r]}
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
                  {LEVEL_LABELS[REGIMES[i]]}
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

