// "The grid, hour by hour" on the Regime tab: the 3D hourly load surface (components/HourlySurface.tsx) with its
// temperature legend and a table view of each day's low and peak hour. Data: grid_hourly.json, loaded lazily.

import { useEffect, useMemo, useState } from "react";

import { HourlySurface, TEMP_GRADIENT, TEMP_STOPS, dayIso } from "../components/HourlySurface.tsx";
import { ChartCard } from "../components/ui.tsx";
import { dateLabel, fmtNum } from "../data/format.ts";
import type { GridHourly } from "../data/model.ts";

const hourName = (h: number) => (h === 0 ? "12 am" : h === 12 ? "noon" : h < 12 ? `${h} am` : `${h - 12} pm`);

export default function Hourly() {
  const [data, setData] = useState<GridHourly | null>(null);
  useEffect(() => {
    let live = true;
    import("@backend/build/grid_hourly.json").then((m) => live && setData(m.default as unknown as GridHourly));
    return () => {
      live = false;
    };
  }, []);

  const days = useMemo(
    () =>
      (data?.mw ?? []).map((day, d) => {
        const peak = day.indexOf(Math.max(...day));
        const low = day.indexOf(Math.min(...day));
        return { iso: dayIso(data!.from, d), t: data!.tempF[d], peak, low, peakMw: day[peak], lowMw: day[low] };
      }),
    [data],
  );
  const top = days.reduce((m, r) => (m && m.peakMw >= r.peakMw ? m : r), days[0]);

  return (
    <>
      <div className="page-head">
        <div>
          <h2 className="page-title">The grid, hour by hour</h2>
          <p className="page-lede">Every hour of Massachusetts electricity use since 2024. Drag to turn it.</p>
        </div>
      </div>
      {!data || !top ? (
        <div className="loading">Loading hourly load…</div>
      ) : (
        <div className="grid">
          <ChartCard
            className="span-12"
            title="Hourly load surface"
            subtitle={`Height = megawatts each hour (7-day average); colour = temperature. Highest hour: ${fmtNum(top.peakMw)} MW on ${dateLabel(top.iso)} at ${hourName(top.peak)}.`}
            source={`EIA-930, three ISO-NE zones, all customer classes · ${dateLabel(data.from)} – ${dateLabel(data.to)} · refreshed daily`}
            table={{
              columns: [
                { key: "d", label: "Date", render: (r) => r.iso, sort: (r) => r.iso },
                { key: "t", label: "Temp", align: "r", render: (r) => `${fmtNum(r.t, 0)}°F`, sort: (r) => r.t },
                { key: "l", label: "Lowest hour", align: "r", render: (r) => `${fmtNum(r.lowMw)} MW · ${hourName(r.low)}`, sort: (r) => r.lowMw },
                { key: "p", label: "Peak hour", align: "r", render: (r) => `${fmtNum(r.peakMw)} MW · ${hourName(r.peak)}`, sort: (r) => r.peakMw },
              ],
              rows: [...days].reverse(),
            }}
          >
            <div className="surface-legend">
              <span>{TEMP_STOPS.cold}°F or colder</span>
              <span className="surface-ramp" style={{ background: TEMP_GRADIENT }} />
              <span>{TEMP_STOPS.hot}°F or hotter</span>
            </div>
            <HourlySurface data={data} />
          </ChartCard>
        </div>
      )}
    </>
  );
}
