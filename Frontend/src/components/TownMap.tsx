import { geoConicConformal, geoPath } from "d3-geo";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";

import { loadGeo } from "../data/load.ts";
import { useWidth } from "./hooks.ts";
import { Tooltip, type TooltipRow } from "./ui.tsx";

type TownProps = { id: number; name: string; geoid: string };
type TownFeature = Feature<Geometry, TownProps>;

/**
 * Massachusetts' 351 cities and towns. Projection is the MA State Plane (Mainland) Lambert
 * conformal conic, so the shapes match what MassGIS users expect. Borders are hairlines in the
 * surface colour — the map's version of the 2px surface gap.
 */
export function TownMap({
  fillFor,
  selected,
  onSelect,
  titleFor,
  rowsFor,
  ariaLabel,
}: {
  fillFor: (id: number) => string;
  selected: number | null;
  onSelect: (id: number) => void;
  titleFor: (id: number) => ReactNode;
  rowsFor: (id: number) => TooltipRow[];
  ariaLabel: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [features, setFeatures] = useState<TownFeature[] | null>(null);
  const [hover, setHover] = useState<{ id: number; x: number; y: number } | null>(null);

  useEffect(() => {
    let live = true;
    loadGeo().then((topo) => {
      const t = topo as unknown as Topology<{ [k: string]: GeometryCollection<TownProps> }>;
      const key = Object.keys(t.objects)[0];
      const fc = feature(t, t.objects[key]) as FeatureCollection<Geometry, TownProps>;
      if (live) setFeatures(fc.features);
    });
    return () => {
      live = false;
    };
  }, []);

  const height = Math.round(Math.min(560, Math.max(260, width * 0.56)));

  const paths = useMemo(() => {
    if (!features) return [];
    const fc: FeatureCollection<Geometry, TownProps> = { type: "FeatureCollection", features };
    const projection = geoConicConformal()
      .parallels([41 + 43 / 60, 42 + 41 / 60])
      .rotate([71.5, 0])
      .fitExtent(
        [
          [4, 4],
          [width - 4, height - 4],
        ],
        fc,
      );
    const gen = geoPath(projection);
    return features.map((f) => ({ id: f.properties.id, d: gen(f) ?? "" }));
  }, [features, width, height]);

  const selectedPath = selected !== null ? paths.find((p) => p.id === selected) : undefined;

  return (
    <div className="chart" ref={ref} role="group" aria-roledescription="map" aria-label={`${ariaLabel}. The town table below lists every value.`}>
      {features ? (
        <svg width={width} height={height}>
          {paths.map((p) => (
            <path
              key={p.id}
              d={p.d}
              style={{ fill: fillFor(p.id), stroke: "var(--surface)", cursor: "pointer" }}
              strokeWidth={0.6}
              strokeLinejoin="round"
              opacity={hover && hover.id !== p.id ? 0.82 : 1}
              onPointerMove={(e) => {
                const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                setHover({ id: p.id, x: e.clientX - r.left, y: e.clientY - r.top });
              }}
              onPointerLeave={() => setHover(null)}
              onClick={() => onSelect(p.id)}
            />
          ))}
          {hover ? (
            <path d={paths.find((p) => p.id === hover.id)?.d} fill="none" style={{ stroke: "var(--ink-2)" }} strokeWidth={1.2} pointerEvents="none" />
          ) : null}
          {selectedPath ? <path d={selectedPath.d} fill="none" style={{ stroke: "var(--ink)" }} strokeWidth={2} pointerEvents="none" /> : null}
        </svg>
      ) : (
        <div className="loading" style={{ height }}>
          Loading town boundaries…
        </div>
      )}
      {hover ? <Tooltip x={hover.x} y={hover.y} containerWidth={width} title={titleFor(hover.id)} rows={rowsFor(hover.id)} note="Click to pin this town" /> : null}
    </div>
  );
}
