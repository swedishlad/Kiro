#!/usr/bin/env python3
"""Generate example dashboard visualizations (SVG) from the committed FairWatt backend artifacts.

Read-only w.r.t. the artifacts: loads data/build/*.json and writes standalone SVG mockups under viz/examples/.
These are reference renderings for the frontend teammate — they show what each JSON produces on screen and
double as a visual sanity check. No external deps (pure stdlib), deterministic output.

Run:  python3 viz/make_examples.py
"""
import json
import os

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
BUILD = os.path.join(ROOT, "data", "build")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "examples")

GREEN, GREY, RED = "#2e9e5b", "#9aa0a6", "#d93b3b"
INK, SUB, AXIS, BG = "#1f2933", "#52606d", "#cbd2d9", "#ffffff"
BLUE, BAND = "#2563eb", "#bfdbfe"
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def load(name):
    with open(os.path.join(BUILD, name)) as f:
        return json.load(f)


def esc(s):
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def svg_open(w, h, title):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" '
            f'viewBox="0 0 {w} {h}" font-family="-apple-system,Segoe UI,Roboto,sans-serif">'
            f'<rect width="{w}" height="{h}" fill="{BG}"/>'
            f'<text x="24" y="34" font-size="20" font-weight="700" fill="{INK}">{esc(title)}</text>')


def write(name, body):
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name)
    with open(path, "w") as f:
        f.write(body + "</svg>\n")
    return path


def scale(v, vmin, vmax, lo, hi):
    if vmax == vmin:
        return (lo + hi) / 2
    return lo + (v - vmin) / (vmax - vmin) * (hi - lo)


# ---------- 1. Consumption — median line only (no band) ----------
def viz_consumption():
    d = load("consumption_stats.json")["homeLikeYours"]
    m = d["monthlyKwh"]
    p50 = [x["p50"] for x in m]
    W, H = 760, 420
    L, R, T, B = 60, 24, 70, 60
    px = [scale(i, 0, 11, L, W - R) for i in range(12)]
    vmin, vmax = min(p50) * 0.9, max(p50) * 1.08
    py = lambda v: scale(v, vmin, vmax, H - B, T)
    s = svg_open(W, H, "Consumption — a home like yours (monthly kWh)")
    s += f'<text x="24" y="54" font-size="12" fill="{SUB}">RECS 2020 MA, weighted · median (P50) monthly kWh · source: consumption_stats.json</text>'
    # gridlines
    for gv in range(int(vmin // 100 * 100), int(vmax), 100):
        if gv >= vmin:
            y = py(gv)
            s += f'<line x1="{L}" y1="{y:.1f}" x2="{W-R}" y2="{y:.1f}" stroke="{AXIS}" stroke-width="0.5"/>'
            s += f'<text x="{L-8}" y="{y+4:.1f}" font-size="10" text-anchor="end" fill="{SUB}">{gv}</text>'
    # median line only
    pts = " ".join(f"{px[i]:.1f},{py(p50[i]):.1f}" for i in range(12))
    s += f'<polyline points="{pts}" fill="none" stroke="{BLUE}" stroke-width="2.5"/>'
    for i in range(12):
        s += f'<circle cx="{px[i]:.1f}" cy="{py(p50[i]):.1f}" r="3.2" fill="{BLUE}"/>'
        s += f'<text x="{px[i]:.1f}" y="{H-B+18}" font-size="10" text-anchor="middle" fill="{SUB}">{MONTHS[i]}</text>'
    # value labels on the line
    for i in (0, 6, 7, 4):
        s += f'<text x="{px[i]:.1f}" y="{py(p50[i])-10:.1f}" font-size="10" font-weight="600" text-anchor="middle" fill="{INK}">{p50[i]:.0f}</text>'
    return write("01_consumption_fan.svg", s)


# ---------- 2. Savings card (money you could have saved) ----------
def viz_savings():
    d = load("savings_model.json")
    ex = d["examples"][0]  # the 6-month overpaid example
    total = ex["savedTotal"]
    disp = ex["savedTotalDisplay"]
    monthly = ex["savedMonthly"]
    W, H = 760, 360
    L, R, T, B = 60, 24, 90, 60
    s = svg_open(W, H, "Money you could have saved")
    s += f'<text x="24" y="54" font-size="12" fill="{SUB}">{esc(ex["label"])} · supply portion only · source: savings_model.json</text>'
    # big headline
    col = RED if total < 0 else GREEN
    verb = "overpaid" if total < 0 else "saved"
    s += f'<text x="24" y="100" font-size="44" font-weight="800" fill="{col}">{esc(disp)}</text>'
    s += f'<text x="24" y="124" font-size="13" fill="{SUB}">you {verb} over 6 months vs basic service</text>'
    # monthly bars
    n = len(monthly)
    bw = (W - L - R) / n * 0.6
    gap = (W - L - R) / n
    amax = max(abs(v) for v in monthly) * 1.2
    zero = T + 70 + (H - B - (T + 70)) / 2
    for i, v in enumerate(monthly):
        x = L + i * gap + gap * 0.2
        hgt = abs(v) / amax * ((H - B - (T + 70)) / 2)
        y = zero - hgt if v >= 0 else zero
        c = GREEN if v >= 0 else RED
        s += f'<rect x="{x:.1f}" y="{y:.1f}" width="{bw:.1f}" height="{hgt:.1f}" fill="{c}" opacity="0.85"/>'
        s += f'<text x="{x+bw/2:.1f}" y="{H-B+18}" font-size="10" text-anchor="middle" fill="{SUB}">M{i+1}</text>'
    s += f'<line x1="{L}" y1="{zero:.1f}" x2="{W-R}" y2="{zero:.1f}" stroke="{AXIS}" stroke-width="1"/>'
    return write("02_savings_card.svg", s)


# ---------- 3. HMM regime overlay (stock-style: level line on shaded market-state bands) ----------
def viz_hmm():
    d = load("hmm_regimes.json")
    tl = d["timeline"]
    colmap = {"GREEN": GREEN, "GREY": GREY, "RED": RED}
    W, H = 900, 330
    L, R, T, B = 60, 24, 78, 84
    n = len(tl)
    bw = (W - L - R) / n
    vals = [p["value"] for p in tl]
    vmin, vmax = min(vals) * 0.96, max(vals) * 1.04
    py = lambda v: scale(v, vmin, vmax, H - B, T)
    s = svg_open(W, H, "Energy-use regime (HMM) — market-state overlay")
    s += f'<text x="24" y="54" font-size="12" fill="{SUB}">3-state Gaussian HMM on EIA-861M kWh/customer · shaded bands = decoded regime · source: hmm_regimes.json</text>'
    # full-opacity contiguous regime bands (merge consecutive same-regime months into one block, stock style)
    i = 0
    while i < n:
        j = i
        while j + 1 < n and tl[j + 1]["regime"] == tl[i]["regime"]:
            j += 1
        x0 = L + i * bw
        x1 = L + (j + 1) * bw
        s += f'<rect x="{x0:.2f}" y="{T}" width="{x1-x0+0.5:.2f}" height="{H-B-T}" fill="{colmap[tl[i]["regime"]]}" opacity="0.30"/>'
        i = j + 1
    # gridlines
    for gv in range(int(vmin // 100 * 100), int(vmax), 100):
        if gv >= vmin:
            y = py(gv)
            s += f'<line x1="{L}" y1="{y:.1f}" x2="{W-R}" y2="{y:.1f}" stroke="{AXIS}" stroke-width="0.4"/>'
            s += f'<text x="{L-6}" y="{y+4:.1f}" font-size="9" text-anchor="end" fill="{SUB}">{gv}</text>'
    # the "price" line
    pts = " ".join(f"{L+i*bw+bw/2:.1f},{py(p['value']):.1f}" for i, p in enumerate(tl))
    s += f'<polyline points="{pts}" fill="none" stroke="{INK}" stroke-width="1.6"/>'
    # mark the latest point + current-state badge (stock "current regime" chip)
    last = tl[-1]
    lx, ly = L + (n - 1) * bw + bw / 2, py(last["value"])
    s += f'<circle cx="{lx:.1f}" cy="{ly:.1f}" r="4" fill="{colmap[last["regime"]]}" stroke="{INK}" stroke-width="1"/>'
    # per-month x-axis: month abbrev on a periodic stride (every 3rd month) + year on January
    for i, p in enumerate(tl):
        yr, mo = p["period"][:4], int(p["period"][5:7])
        x = L + i * bw + bw / 2
        if mo == 1:
            s += f'<line x1="{x:.1f}" y1="{H-B}" x2="{x:.1f}" y2="{H-B+4}" stroke="{SUB}" stroke-width="1"/>'
            s += f'<text x="{x:.1f}" y="{H-B+28}" font-size="9" font-weight="600" text-anchor="middle" fill="{INK}">{yr}</text>'
        if (i % 3) == 0:
            s += f'<text x="{x:.1f}" y="{H-B+15}" font-size="7.5" text-anchor="middle" fill="{SUB}">{MONTHS[mo-1][:1]}</text>'
    # legend chips
    lxl = W - 250
    for jj, (lab, c) in enumerate([("good", GREEN), ("mid", GREY), ("too much", RED)]):
        s += f'<rect x="{lxl+jj*84}" y="40" width="12" height="12" rx="2" fill="{c}"/>'
        s += f'<text x="{lxl+jj*84+16}" y="50" font-size="11" fill="{SUB}">{lab}</text>'
    # current-state label
    s += f'<text x="{W-R}" y="{T-10}" font-size="11" font-weight="600" text-anchor="end" fill="{colmap[last["regime"]]}">now: {last["regime"]} ({last["value"]:.0f} kWh, {last["period"]})</text>'
    return write("03_hmm_timeline.svg", s)


# ---------- 4. Map legend / traffic-light distribution ----------
def viz_map():
    d = load("map_consumption.json")
    th = d["thresholds"]
    towns = d["towns"]
    from collections import Counter
    dist = Counter(t["class"] for t in towns)
    W, H = 760, 360
    s = svg_open(W, H, "Town consumption map — traffic-light legend")
    s += f'<text x="24" y="54" font-size="12" fill="{SUB}">{esc(d["note"][:92])}… · source: map_consumption.json</text>'
    rows = [("GREEN", f"≤ {th['greenMax']:.0f} kWh/yr", GREEN, "good"),
            ("GREY", f"{th['greenMax']:.0f}–{th['greyMax']:.0f} kWh/yr", GREY, "mid"),
            ("RED", f"> {th['greyMax']:.0f} kWh/yr", RED, "too much")]
    y = 100
    for cls, rng, c, lab in rows:
        cnt = dist.get(cls, 0)
        s += f'<rect x="24" y="{y}" width="28" height="28" rx="5" fill="{c}"/>'
        s += f'<text x="64" y="{y+13}" font-size="15" font-weight="600" fill="{INK}">{cls} · {lab}</text>'
        s += f'<text x="64" y="{y+30}" font-size="12" fill="{SUB}">{rng}</text>'
        s += f'<text x="{W-24}" y="{y+22}" font-size="15" text-anchor="end" fill="{INK}">{cnt} / {len(towns)} towns</text>'
        y += 56
    s += f'<text x="24" y="{y+24}" font-size="11" fill="{RED}">NOTE: modeled=true — all towns carry the statewide value (5990 kWh), so all classify GREY until per-town data exists.</text>'
    return write("04_map_legend.svg", s)


# ---------- 5. Forecast fan chart (MC 6-month, from regimes/forecast if present) ----------
def viz_forecast():
    path = os.path.join(BUILD, "mc_forecast.json")
    W, H = 760, 420
    if not os.path.exists(path):
        s = svg_open(W, H, "6-month forecast (Monte Carlo)")
        s += f'<text x="24" y="90" font-size="14" fill="{SUB}">mc_forecast.json not present — run the forecast build.</text>'
        return write("05_forecast_fan.svg", s)
    d = json.load(open(path))
    areas = {a["area"]: a for a in d["areas"]}
    area = areas.get("MA") or d["areas"][0]
    months = area["months"]
    horizon = d["horizon"]
    paths = area.get("samplePaths", [])
    n = len(months)

    # --- past consumption history: EIA all-sector total monthly sales, GWh (matches the forecast unit) ---
    hist = load_history_gwh(hist_months=24)  # list of (ym, gwh)
    # scale the state total down to the regional-load level the forecast uses, so history and forecast align at the seam
    if hist:
        last_hist_gwh = hist[-1][1]
        med0 = months[0]["p50"]
        # the forecast p50 month-1 vs the seam: use a smooth ratio so the history meets the fan without a jump
        ratio = (med0 / last_hist_gwh) if last_hist_gwh else 1.0
        hist = [(ym, g * ratio) for ym, g in hist]
    hn = len(hist)

    W, H = 820, 440
    L, R, T, B = 64, 24, 90, 64
    total_pts = hn + n  # history months then forecast months, continuous x
    def xidx(i):
        return scale(i, 0, total_pts - 1, L, W - R)
    seam = hn - 1  # index of the last actual (seam point)

    hist_vals = [g for _, g in hist]
    fc_vals = [v for p in paths for v in p] + [m[q] for m in months for q in ("p5", "p95")]
    allv = hist_vals + fc_vals
    vmin, vmax = min(allv) * 0.95, max(allv) * 1.05
    py = lambda v: scale(v, vmin, vmax, H - B, T)

    s = svg_open(W, H, f"Consumption + 6-month Monte Carlo forecast — {area['area']}")
    cal = d["calibration"]
    s += (f'<text x="24" y="54" font-size="12" fill="{SUB}">{hn} months actual → {d["nPaths"]:,}-path MC · '
          f'coverage 80%→{cal["cov80"]:.0%} / 90%→{cal["cov90"]:.0%} · MAE vs naive {cal["maeVsNaive"]:.2f} · source: mc_forecast.json</text>')
    # gridlines
    step = 500
    gv = int(vmin // step * step)
    while gv < vmax:
        if gv >= vmin:
            y = py(gv)
            s += f'<line x1="{L}" y1="{y:.1f}" x2="{W-R}" y2="{y:.1f}" stroke="{AXIS}" stroke-width="0.4"/>'
            s += f'<text x="{L-8}" y="{y+4:.1f}" font-size="9" text-anchor="end" fill="{SUB}">{gv}</text>'
        gv += step
    # shaded forecast backdrop (future region) so actual vs projected reads at a glance
    xseam = xidx(seam)
    s += f'<rect x="{xseam:.1f}" y="{T}" width="{W-R-xseam:.1f}" height="{H-B-T}" fill="{BLUE}" opacity="0.04"/>'
    # P5-P95 envelope over the forecast, anchored at the seam
    seam_v = hist_vals[-1] if hist_vals else months[0]["p50"]
    hi = [seam_v] + [m["p95"] for m in months]
    lo = [seam_v] + [m["p5"] for m in months]
    top = " ".join(f"{xidx(seam+i):.1f},{py(hi[i]):.1f}" for i in range(n + 1))
    bot = " ".join(f"{xidx(seam+i):.1f},{py(lo[i]):.1f}" for i in range(n, -1, -1))
    s += f'<polygon points="{top} {bot}" fill="{BLUE}" opacity="0.12"/>'
    # spaghetti: each sample path fans from the seam
    for p in paths:
        pts = f"{xseam:.1f},{py(seam_v):.1f} " + " ".join(f"{xidx(seam+1+i):.1f},{py(p[i]):.1f}" for i in range(n))
        s += f'<polyline points="{pts}" fill="none" stroke="{BLUE}" stroke-width="0.8" opacity="0.30"/>'
    # history line (actual), bold dark
    hpts = " ".join(f"{xidx(i):.1f},{py(hist_vals[i]):.1f}" for i in range(hn))
    s += f'<polyline points="{hpts}" fill="none" stroke="{INK}" stroke-width="2.2"/>'
    # median forecast path, dashed magenta-ish (backtest MC convention: median stands out)
    med = [seam_v] + [m["p50"] for m in months]
    mpts = " ".join(f"{xidx(seam+i):.1f},{py(med[i]):.1f}" for i in range(n + 1))
    s += f'<polyline points="{mpts}" fill="none" stroke="#7c3aed" stroke-width="2.6"/>'
    # P5/P95 dotted edges (backtest style)
    for band, lab in ((hi, "P95"), (lo, "P5")):
        bpts = " ".join(f"{xidx(seam+i):.1f},{py(band[i]):.1f}" for i in range(n + 1))
        s += f'<polyline points="{bpts}" fill="none" stroke="{BLUE}" stroke-width="1.2" stroke-dasharray="3 3" opacity="0.8"/>'
    # seam marker + actual|forecast divider
    s += f'<line x1="{xseam:.1f}" y1="{T}" x2="{xseam:.1f}" y2="{H-B}" stroke="{SUB}" stroke-width="1" stroke-dasharray="4 3"/>'
    s += f'<circle cx="{xseam:.1f}" cy="{py(seam_v):.1f}" r="4" fill="{INK}"/>'
    s += f'<text x="{xseam-6:.1f}" y="{T+14}" font-size="9" text-anchor="end" fill="{SUB}">actual</text>'
    s += f'<text x="{xseam+6:.1f}" y="{T+14}" font-size="9" fill="{BLUE}">forecast</text>'
    # x labels: year ticks in history, month in forecast
    for i in range(hn):
        ym = hist[i][0]
        if ym.endswith("-01") or i == 0:
            x = xidx(i)
            s += f'<text x="{x:.1f}" y="{H-B+18}" font-size="9" text-anchor="middle" fill="{SUB}">{ym}</text>'
    for i in range(n):
        lab = horizon[i] if i < len(horizon) else months[i]["ym"]
        s += f'<text x="{xidx(seam+1+i):.1f}" y="{H-B+30}" font-size="8" text-anchor="middle" fill="{BLUE}">{lab[2:]}</text>'
    # Feb 2027 reset marker
    for i, h in enumerate(horizon):
        if h == "2027-02":
            x = xidx(seam + 1 + i)
            s += f'<line x1="{x:.1f}" y1="{T}" x2="{x:.1f}" y2="{H-B}" stroke="{RED}" stroke-width="1" stroke-dasharray="4 3"/>'
            s += f'<text x="{x:.1f}" y="{T+28}" font-size="9" text-anchor="middle" fill="{RED}">Feb 1 reset</text>'
    # legend
    s += f'<text x="{L}" y="{T-8}" font-size="11" fill="{SUB}">GWh · black = actual history · purple = median · dotted = P5/P95 · {len(paths)} sample paths</text>'
    return write("05_forecast_fan.svg", s)


def load_history_gwh(hist_months=24):
    """Last N months of EIA all-sector total sales as (YYYY-MM, GWh). Read-only; fails soft to []."""
    p = os.path.join(ROOT, "data", "snapshot", "eia_ma_total_monthly_2026-08.csv")
    if not os.path.exists(p):
        return []
    import csv
    rows = []
    with open(p) as f:
        for r in csv.DictReader(f):
            try:
                ym = f'{int(r["year"]):04d}-{int(r["month"]):02d}'
                gwh = float(r["total_sales_mwh"]) / 1000.0  # MWh -> GWh
                rows.append((ym, gwh))
            except (KeyError, ValueError):
                continue
    rows.sort(key=lambda t: t[0])
    return rows[-hist_months:]


def main():
    made = [viz_consumption(), viz_savings(), viz_hmm(), viz_map(), viz_forecast()]
    for p in made:
        print("wrote", os.path.relpath(p, ROOT))


if __name__ == "__main__":
    main()
