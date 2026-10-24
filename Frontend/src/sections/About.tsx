import johanPhoto from "../assets/team/johan.jpg";
import { Card } from "../components/ui.tsx";
import { TEAM } from "../data/team.ts";
import Sources from "./Sources.tsx";

// Avatars take the categorical slots in order, so each person keeps the same colour in both themes.
const AVATAR_COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)"];

/** Team photos (480px wide, in src/assets/team/); members without one keep their initial. */
const PHOTOS: Partial<Record<string, string>> = { Johan: johanPhoto };

export default function About() {
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">About Watt-If?</h1>
          <p className="page-lede">
            Watt If is a free, public dashboard about Massachusetts residential electricity: what homes use, what they pay, what basic
            service costs, and whether use is running above or below its usual range.
          </p>
        </div>
      </div>
      <div className="grid">
        <Card className="span-12" title="Our team">
          <ul className="team">
            {TEAM.map((name, i) => (
              <li className="member" key={name}>
                {PHOTOS[name] ? (
                  <img className="member-avatar member-photo" src={PHOTOS[name]} alt="" width={72} height={72} />
                ) : (
                  <span className="member-avatar" style={{ background: AVATAR_COLORS[i % AVATAR_COLORS.length] }} aria-hidden="true">
                    {name[0]}
                  </span>
                )}
                <span className="member-name">{name}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="span-12" title="What it is">
          <div className="prose">
            <p>
              Every number comes from public data — U.S. EIA, Mass.gov DPU, ISO New England, U.S. Census and MassGIS — processed by the
              project's Python backend and refreshed daily.
            </p>
            <p>
              The site has no user accounts and cannot see anyone's bill, meter or utility account. It does not sell electricity or sign
              anyone up.
            </p>
          </div>
        </Card>
      </div>
      <section id="sec-sources" className="page-section page-section-break" aria-label="Data and methods">
        <Sources />
      </section>
    </>
  );
}
