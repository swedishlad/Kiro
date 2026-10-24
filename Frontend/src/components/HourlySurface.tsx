// The grid, hour by hour: Massachusetts load for every hour since 2024 as a 3D surface (hour of day × date × MW),
// coloured by temperature; the surface is a trailing 7-day average per hour (one day is too jagged to read), the
// tooltip gives the actual hour too. Hand-drawn on a canvas, no 3D library: an orthographic camera, painter's order
// and simple lighting. Drag (or arrow keys) to turn it; hover reads any hour. Data: grid_hourly.json (daily refresh).

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

import { useTheme, useWidth } from "./hooks.ts";
import { MONTHS, dateLabel, fmtNum } from "../data/format.ts";
import type { GridHourly } from "../data/model.ts";

/** Temperature colour: blue (cold) → neutral (mild) → orange (hot); validated pair, no regime red/green. */
const T_COLD = 15;
const T_MID = 60;
const T_HOT = 85;
const COLD = [47, 109, 181];
const MID = [214, 211, 204];
const HOT = [213, 106, 31];
export const TEMP_GRADIENT = `linear-gradient(90deg, rgb(${COLD}) 0%, rgb(${MID}) ${((T_MID - T_COLD) / (T_HOT - T_COLD)) * 100}%, rgb(${HOT}) 100%)`;
export const TEMP_STOPS = { cold: T_COLD, mid: T_MID, hot: T_HOT };

const L = 1.25; // half-depth of the date axis; hours span -1..1
const SMOOTH = 7; // days in the trailing average drawn as the surface
const HZ = 0.9; // height of the tallest hour
const HOUR_LABEL = (h: number) => (h === 0 ? "12 am" : h === 12 ? "noon" : h < 12 ? `${h} am` : `${h - 12} pm`);

function tempRgb(t: number): number[] {
  const mix = (a: number[], b: number[], f: number) => a.map((v, i) => v + (b[i] - v) * f);
  return t <= T_MID ? mix(COLD, MID, Math.max(0, (t - T_COLD) / (T_MID - T_COLD))) : mix(MID, HOT, Math.min(1, (t - T_MID) / (T_HOT - T_MID)));
}

export function dayIso(from: string, d: number): string {
  const [y, m, dd] = from.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, dd) + d * 86400000).toISOString().slice(0, 10);
}

const START = { yaw: -0.62, pitch: 0.62 };

/** Trailing SMOOTH-day mean of each hour (and of the temperature), so the surface reads as shape, not noise. */
export function smoothed(data: GridHourly): { mw: number[][]; tempF: number[] } {
  const mw = data.mw.map((_, d) => {
    const lo = Math.max(0, d - SMOOTH + 1);
    const rows = data.mw.slice(lo, d + 1);
    return Array.from({ length: 24 }, (_, h) => rows.reduce((t, r) => t + r[h], 0) / rows.length);
  });
  const tempF = data.tempF.map((_, d) => {
    const w = data.tempF.slice(Math.max(0, d - SMOOTH + 1), d + 1);
    return w.reduce((t, v) => t + v, 0) / w.length;
  });
  return { mw, tempF };
}

export function HourlySurface({ data, height = 480 }: { data: GridHourly; height?: number }) {
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const canvas = useRef<HTMLCanvasElement>(null);
  const { dark } = useTheme();
  const [view, setView] = useState(START);
  const [hover, setHover] = useState<{ d: number; h: number; x: number; y: number } | null>(null);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  // the last drawing, for hit tests: projected vertices and the quads in draw order
  const drawn = useRef<{ px: Float32Array; py: Float32Array; order: Uint32Array } | null>(null);

  const D = data.mw.length;
  const sm = useMemo(() => smoothed(data), [data]);
  const geo = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const day of sm.mw) for (const v of day) (lo = Math.min(lo, v)), (hi = Math.max(hi, v));
    const zmin = Math.floor(lo / 1000) * 1000;
    const zmax = hi;
    const X = Array.from({ length: 24 }, (_, h) => (h / 23) * 2 - 1);
    const Y = Array.from({ length: D }, (_, d) => -L + (D <= 1 ? 0 : (d / (D - 1)) * 2 * L));
    const Z = new Float32Array(D * 24);
    sm.mw.forEach((day, d) => day.forEach((v, h) => (Z[d * 24 + h] = ((v - zmin) / (zmax - zmin)) * HZ)));
    const light = [-0.45, -0.55, 0.7];
    const ln = Math.hypot(...light);
    const colors: string[] = [];
    for (let d = 0; d < D - 1; d++) {
      const base = tempRgb(sm.tempF[d]);
      for (let h = 0; h < 23; h++) {
        const ax = X[h + 1] - X[h];
        const az = Z[d * 24 + h + 1] - Z[d * 24 + h];
        const by = Y[d + 1] - Y[d];
        const bz = Z[(d + 1) * 24 + h] - Z[d * 24 + h];
        // n = a × b with a = (ax, 0, az), b = (0, by, bz)
        const n = [-az * by, -ax * bz, ax * by];
        const nn = Math.hypot(...n) || 1;
        const lambert = Math.max(0, (n[0] * light[0] + n[1] * light[1] + n[2] * light[2]) / (nn * ln));
        const shade = 0.6 + 0.4 * lambert;
        colors.push(`rgb(${base.map((c) => Math.round(c * shade)).join(",")})`);
      }
    }
    return { zmin, zmax, X, Y, Z, colors };
  }, [sm, D]);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv || width < 50) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(width * dpr);
    cv.height = Math.round(height * dpr);
    const ctx = cv.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const css = getComputedStyle(cv);
    const ink = css.getPropertyValue("--ink-2").trim() || "#666";
    const grid = css.getPropertyValue("--grid").trim() || "#ddd";
    const halo = css.getPropertyValue("--surface").trim() || "#fff";

    const { X, Y, Z, zmin, zmax, colors } = geo;
    const cy = Math.cos(view.yaw);
    const sy = Math.sin(view.yaw);
    const cp = Math.cos(view.pitch);
    const sp = Math.sin(view.pitch);
    const rot = (x: number, y: number, z: number) => {
      const xr = x * cy - y * sy;
      const yr = x * sy + y * cy;
      return { sx: xr, su: z * cp + yr * sp, depth: yr * cp - z * sp };
    };
    // fit the bounding box into the canvas
    let minX = Infinity;
    let maxX = -Infinity;
    let minU = Infinity;
    let maxU = -Infinity;
    for (const x of [-1, 1]) for (const y of [-L, L]) for (const z of [0, HZ]) {
      const r = rot(x, y, z);
      minX = Math.min(minX, r.sx), maxX = Math.max(maxX, r.sx), minU = Math.min(minU, r.su), maxU = Math.max(maxU, r.su);
    }
    const padX = 70;
    const padTop = 24;
    const padBot = 40;
    const s = Math.min((width - 2 * padX) / (maxX - minX), (height - padTop - padBot) / (maxU - minU));
    const ox = width / 2 - (s * (minX + maxX)) / 2;
    const oy = padTop + (height - padTop - padBot) / 2 + (s * (minU + maxU)) / 2;
    const P = (x: number, y: number, z: number) => {
      const r = rot(x, y, z);
      return [ox + s * r.sx, oy - s * r.su, r.depth];
    };

    const n = D * 24;
    const px = new Float32Array(n);
    const py = new Float32Array(n);
    const dz = new Float32Array(n);
    for (let d = 0; d < D; d++)
      for (let h = 0; h < 24; h++) {
        const [a, b, c] = P(X[h], Y[d], Z[d * 24 + h]);
        px[d * 24 + h] = a;
        py[d * 24 + h] = b;
        dz[d * 24 + h] = c;
      }
    const q = (D - 1) * 23;
    const qd = new Float32Array(q);
    for (let d = 0; d < D - 1; d++)
      for (let h = 0; h < 23; h++) {
        const i = d * 24 + h;
        qd[d * 23 + h] = dz[i] + dz[i + 1] + dz[i + 24] + dz[i + 25];
      }
    const order = new Uint32Array(q).map((_, i) => i).sort((a, b) => qd[b] - qd[a]);

    // floor outline and the MW axis behind the surface
    const corners = [[-1, -L], [1, -L], [1, L], [-1, L]].map(([x, y]) => P(x, y, 0));
    ctx.strokeStyle = grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    corners.forEach(([a, b], i) => (i ? ctx.lineTo(a, b) : ctx.moveTo(a, b)));
    ctx.closePath();
    ctx.stroke();
    const back = corners.reduce((m, c, i) => (c[2] > corners[m][2] ? i : m), 0);
    const [bxw, byw] = [[-1, -L], [1, -L], [1, L], [-1, L]][back];
    const step = zmax - zmin > 6000 ? 2000 : 1000;
    const mwTicks: number[] = [];
    for (let v = Math.ceil(zmin / step) * step; v <= zmax; v += step) mwTicks.push(v);
    const [b0x, b0y] = P(bxw, byw, 0);
    const [b1x, b1y] = P(bxw, byw, HZ);
    ctx.beginPath();
    ctx.moveTo(b0x, b0y);
    ctx.lineTo(b1x, b1y);
    ctx.stroke();

    // the surface, far to near
    for (const k of order) {
      const d = Math.floor(k / 23);
      const h = k % 23;
      const i = d * 24 + h;
      ctx.fillStyle = colors[k];
      ctx.strokeStyle = colors[k];
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(px[i], py[i]);
      ctx.lineTo(px[i + 1], py[i + 1]);
      ctx.lineTo(px[i + 25], py[i + 25]);
      ctx.lineTo(px[i + 24], py[i + 24]);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // labels on top (with a halo so they read over the surface): hours along the nearer date edge, dates along
    // the nearer hour edge, MW up the back corner
    ctx.font = "11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif";
    ctx.lineJoin = "round";
    const label = (t: string, x: number, y: number) => {
      ctx.strokeStyle = halo;
      ctx.lineWidth = 3;
      ctx.strokeText(t, x, y);
      ctx.fillStyle = ink;
      ctx.fillText(t, x, y);
    };
    const cxs = width / 2;
    const yEdge = P(0, -L, 0)[2] < P(0, L, 0)[2] ? -L : L;
    for (const h of [0, 6, 12, 18]) {
      const [a, b] = P(X[h], yEdge, 0);
      ctx.textAlign = "center";
      label(HOUR_LABEL(h), a, b + 16);
    }
    const xEdge = P(-1, 0, 0)[2] < P(1, 0, 0)[2] ? -1 : 1;
    for (let d = 0; d < D; d++) {
      const iso = dayIso(data.from, d);
      if ((!iso.endsWith("-01-01") && !iso.endsWith("-07-01")) || d < 25 || d > D - 25) continue;
      const [a, b] = P(xEdge, Y[d], 0);
      ctx.textAlign = a < cxs ? "right" : "left";
      label(`${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`, a + (a < cxs ? -8 : 8), b + 4);
    }
    for (const v of mwTicks) {
      const [a, b] = P(bxw, byw, ((v - zmin) / (zmax - zmin)) * HZ);
      ctx.textAlign = a < cxs ? "right" : "left";
      label(`${fmtNum(v)} MW`, a + (a < cxs ? -6 : 6), b + 4);
    }
    drawn.current = { px, py, order };
  }, [geo, view, width, height, dark, D, data]);

  const hit = (x: number, y: number) => {
    const g = drawn.current;
    if (!g) return null;
    const { px, py, order } = g;
    for (let o = order.length - 1; o >= 0; o--) {
      const k = order[o];
      const i = Math.floor(k / 23) * 24 + (k % 23);
      const vs = [i, i + 1, i + 25, i + 24];
      let sign = 0;
      let inside = true;
      for (let e = 0; e < 4; e++) {
        const a = vs[e];
        const b = vs[(e + 1) % 4];
        const cr = (px[b] - px[a]) * (y - py[a]) - (py[b] - py[a]) * (x - px[a]);
        if (cr !== 0) {
          if (sign === 0) sign = Math.sign(cr);
          else if (Math.sign(cr) !== sign) {
            inside = false;
            break;
          }
        }
      }
      if (inside) {
        const d = Math.floor(k / 23);
        const h = k % 23;
        return { d, h, x: px[i], y: py[i] };
      }
    }
    return null;
  };

  const onDown = (e: PointerEvent<HTMLCanvasElement>) => {
    drag.current = { x: e.clientX, y: e.clientY, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (drag.current) {
      const dx = e.clientX - drag.current.x;
      const dy = e.clientY - drag.current.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) drag.current.moved = true;
      drag.current.x = e.clientX;
      drag.current.y = e.clientY;
      setHover(null);
      setView((v) => ({ yaw: v.yaw + dx * 0.008, pitch: Math.max(0.12, Math.min(1.35, v.pitch + dy * 0.006)) }));
      return;
    }
    setHover(hit(e.clientX - r.left, e.clientY - r.top));
  };
  const onUp = () => {
    drag.current = null;
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const k = e.key;
    if (k === "ArrowLeft" || k === "ArrowRight" || k === "ArrowUp" || k === "ArrowDown" || k === "Home") e.preventDefault();
    setView((v) =>
      k === "ArrowLeft" ? { ...v, yaw: v.yaw - 0.12 }
      : k === "ArrowRight" ? { ...v, yaw: v.yaw + 0.12 }
      : k === "ArrowUp" ? { ...v, pitch: Math.max(0.12, v.pitch - 0.08) }
      : k === "ArrowDown" ? { ...v, pitch: Math.min(1.35, v.pitch + 0.08) }
      : k === "Home" ? START
      : v,
    );
  };

  const tip = hover ? { iso: dayIso(data.from, hover.d), mw: data.mw[hover.d][hover.h], avg: sm.mw[hover.d][hover.h], t: data.tempF[hover.d] } : null;

  return (
    <div
      ref={wrapRef}
      className="chart surface-3d"
      tabIndex={0}
      role="img"
      aria-label={`3D surface of Massachusetts grid load for every hour from ${dateLabel(data.from)} to ${dateLabel(data.to)}, coloured by temperature. Arrow keys turn it; the table view lists each day.`}
      onKeyDown={onKey}
    >
      <canvas
        ref={canvas}
        style={{ width, height, display: "block", cursor: drag.current ? "grabbing" : "grab", touchAction: "pan-y" }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onPointerLeave={() => !drag.current && setHover(null)}
      />
      <button type="button" className="surface-reset" onClick={() => setView(START)}>
        Reset view
      </button>
      {hover && tip ? (
        <>
          <span className="surface-dot" style={{ left: hover.x, top: hover.y }} />
          <div className="tooltip" style={{ left: hover.x + 230 > width ? hover.x - 234 : hover.x + 14, top: Math.max(0, hover.y - 70), width: 220 }} role="status">
            <div className="tooltip-title">
              {dateLabel(tip.iso)} · {HOUR_LABEL(hover.h)}
            </div>
            <div className="tooltip-row">
              <span />
              <span className="v">{fmtNum(tip.mw)} MW</span>
              <span className="l">grid load that hour</span>
            </div>
            <div className="tooltip-row">
              <span />
              <span className="v">{fmtNum(tip.avg)} MW</span>
              <span className="l">7-day average (the surface)</span>
            </div>
            <div className="tooltip-row">
              <span className="key-rect" style={{ background: `rgb(${tempRgb(tip.t).map(Math.round).join(",")})` }} />
              <span className="v">{fmtNum(tip.t, 0)}°F</span>
              <span className="l">that day's temperature</span>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
