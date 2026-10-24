#!/usr/bin/env python3
"""Charts of the HMM and Monte Carlo test results -> docs/img/tests/*.png. Run from the kit root after the gates.

Palette (validated with the dataviz validator, light surface #fcfcfb): zones = categorical slots 1-3
(#2a78d6 / #eb6834 / #1baf7a, all-pairs PASS); regime states use status good #0ca30c / neutral #9a9992 / status
critical #d03b3b, which FAIL colour-blind separation (green-red dE 4.1), so every regime chart also encodes the
state by position (% level) and marker shape, with text labels.
"""
import datetime as dt
import json
import os
import sys
from collections import Counter, defaultdict

import matplotlib
matplotlib.use("Agg")
import matplotlib.dates as mdates  # noqa: E402
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

sys.path.insert(0, os.getcwd())
from backend.common import build_path  # noqa: E402
from backend.regimes import build as B  # noqa: E402

OUT = os.path.join("docs", "img", "tests")
SURF, INK, INK2, GRID = "#fcfcfb", "#0b0b0b", "#52514e", "#e6e5e0"
STATE = {"green": ("#0ca30c", "v", "good"), "grey": ("#9a9992", "o", "mid"), "red": ("#d03b3b", "^", "too much")}
ZONEC = {"NEMA": "#2a78d6", "SEMA": "#eb6834", "WCMA": "#1baf7a", "MA": INK}
BLUE = ["#cde2fb", "#9ec5f4", "#6da7ec", "#1c5cab"]
plt.rcParams.update({"figure.facecolor": SURF, "axes.facecolor": SURF, "axes.edgecolor": GRID, "axes.labelcolor": INK2,
                     "xtick.color": INK2, "ytick.color": INK2, "text.color": INK, "axes.grid": True, "grid.color": GRID,
                     "grid.linewidth": 0.6, "grid.linestyle": "-", "axes.spines.top": False, "axes.spines.right": False,
                     "font.size": 9, "axes.titlesize": 10, "axes.titleweight": "bold"})


def save(fig, name):
    path = os.path.join(OUT, name)
    fig.savefig(path, dpi=160, bbox_inches="tight")
    plt.close(fig)
    print("wrote", path)


ZLIM = 4.0


def regime_panel(ax, a, big=False):
    """3-state HMM format: each point = z (sd from the historical average), colour + marker = filtered state,
    three horizontal state-mean lines (anchored -1.5 / 0 / +1.5 sd) labelled with the typical % for this area."""
    tl = a["timeline"]
    dd = np.array([dt.date.fromisoformat(e["date"]) for e in tl])
    z = np.clip(np.array([e["pctVsAverage"] / e["bandPct"] for e in tl]), -ZLIM, ZLIM)
    typical_band = float(np.median([e["bandPct"] for e in tl]))
    for edge in (-1, 1):
        ax.axhline(edge, color=GRID, lw=1.0)
    size = (30 if big else 22) if a["unit"] == "month" else (12 if big else 7)
    for st in a["states"]:
        c = st["color"]
        hexc, mk, lab = STATE[c]
        sel = np.array([e["color"] == c for e in tl])
        ax.scatter(dd[sel], z[sel], s=size, marker=mk, color=hexc, linewidths=0, alpha=0.9, zorder=3)
        m = st["meanSdFromAverage"]
        ax.axhline(m, color=hexc, lw=1.4, zorder=2)
        ax.text(1.005, m, f"{lab} {m:+.1f} sd (≈{m * typical_band:+.0f}%) · {st['shareOfDays']:.0%}",
                transform=ax.get_yaxis_transform(), va="center", fontsize=8, color=INK2)
    if big:
        ax.text(1.005, 1, "range edge", transform=ax.get_yaxis_transform(), va="bottom", fontsize=7, color=INK2)
    ax.set_ylim(-ZLIM, ZLIM)
    ax.set_ylabel("sd from historical avg")
    ax.xaxis.set_major_locator(mdates.YearLocator())
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%Y"))
    return dd, z


def chart_timeline(doc):
    fig, axes = plt.subplots(5, 1, figsize=(12, 12))
    for ax, a in zip(axes, doc["areas"]):
        regime_panel(ax, a)
        unit = "daily, all customers" if a["unit"] == "day" else "monthly, homes (kWh per account)"
        ax.set_title(f"{a['area']} ({unit}) · current {a['current']['date']}: {a['current']['color']} · agrees with the "
                     f"plain range rule {a['agreementWithBandRule']:.0%}", loc="left", fontsize=9)
    handles = [plt.Line2D([], [], marker=STATE[c][1], color=STATE[c][0], lw=1.4, label=f"{c} = {STATE[c][2]}") for c in STATE]
    fig.legend(handles=handles, loc="lower center", ncol=3, frameon=False, fontsize=8.5, bbox_to_anchor=(0.43, 0.0))
    fig.suptitle("3-state HMM regimes vs the historical average range (same period, previous 5 years), forward-filtered\n"
                 "points = each day (zones) or month (MA_RES) in sd from the historical average · coloured lines = the three "
                 "state means · thin grey lines = range edges (±1 sd)", x=0.01, ha="left", fontsize=10, fontweight="bold")
    fig.tight_layout(rect=(0, 0.025, 0.86, 0.96))
    save(fig, "hmm_states_timeline.png")


def red_share_by_month(timeline, key="date", colkey="color", red="red"):
    cm = defaultdict(Counter)
    for e in timeline:
        cm[int(e[key][5:7])][e[colkey]] += 1
    return [cm[m][red] / sum(cm[m].values()) for m in range(1, 13)]


def chart_seasonality(doc):
    fig, ax = plt.subplots(figsize=(8.5, 4.2))
    months = np.arange(1, 13)
    series = [("MA daily vs historical range (this model)", red_share_by_month(doc["areas"][3]["timeline"]), ZONEC["NEMA"], "o"),
              ("MA homes monthly vs historical range (this model)", red_share_by_month(doc["areas"][4]["timeline"]), ZONEC["WCMA"], "D")]
    other = build_path("hmm_regimes.json")
    if os.path.exists(other):
        series.append(("raw monthly kWh level (src/hmm)", red_share_by_month(json.load(open(other))["timeline"], "period", "regime", "RED"),
                       ZONEC["SEMA"], "s"))
    for label, y, c, mk in series:
        ax.plot(months, y, color=c, lw=2, marker=mk, ms=6, label=label)
    ax.axhspan(0.7, 1.0, color="#f0efec", zorder=0)
    ax.text(1.1, 0.95, "fails: a month that is mostly red means the model detects the season", fontsize=8, color=INK2, va="top")
    ax.set_xticks(months, ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"])
    ax.set_ylim(0, 1.0)
    ax.set_ylabel("share in the red state")
    ax.yaxis.set_major_formatter(matplotlib.ticker.PercentFormatter(1.0))
    ax.legend(loc="center left", frameon=False, fontsize=8)
    ax.set_title("Test: is 'red' about consumption or just the season?", loc="left")
    save(fig, "hmm_not_seasonal.png")


def chart_leakage():
    z = np.load(os.path.join(OUT, "_hmm_leakage.npz"))
    days = np.array([dt.date.fromisoformat(d) for d in z["days"]])
    cut = dt.date.fromisoformat(str(z["cut"]))
    keep = days >= B.DAILY_FROM
    fig, ax = plt.subplots(figsize=(9, 3.6))
    ax.plot(days[keep], z["p1"][keep, 2], color=ZONEC["NEMA"], lw=1.6, label="original data")
    ax.plot(days[keep], z["p2"][keep, 2], color=ZONEC["SEMA"], lw=1.0, label="load scrambled after the cut (+/-5%)")
    ax.axvline(cut, color=INK, lw=1)
    n_same = int(((days >= B.DAILY_FROM) & (days <= cut)).sum())
    ax.text(cut, 1.04, f"  cut {cut}: lines identical before ({n_same} days, bit-for-bit)", fontsize=8, color=INK2)
    ax.set_ylim(0, 1.1)
    ax.set_ylabel("P(red) for that day")
    ax.legend(loc="upper left", frameon=False, fontsize=8, bbox_to_anchor=(0, 0.92))
    ax.set_title("Look-ahead test (NEMA): changing the future must not change the past", loc="left")
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%b %Y"))
    save(fig, "hmm_leakage_test.png")


def chart_calibration(mcdoc):
    rows = json.load(open(build_path("mc_calibration_rows.json")))
    fig, axes = plt.subplots(1, 3, figsize=(12, 4), sharey=False)
    for ax, zname in zip(axes, ["NEMA", "SEMA", "WCMA"]):
        rz = [r for r in rows if r["zone"] == zname]
        x = np.arange(len(rz))
        for i, r in enumerate(rz):
            ax.plot([i, i], [r["p10"], r["p90"]], color=BLUE[2], lw=5, solid_capstyle="round")
            ax.plot([i - 0.25, i + 0.25], [r["p50"], r["p50"]], color=BLUE[3], lw=1.5)
            ax.scatter([i], [r["actual"]], s=28, marker="o" if r["in80"] else "X",
                       color=INK if r["in80"] else STATE["red"][0], zorder=3)
            ax.scatter([i], [r["naive"]], s=14, marker="D", color="#9a9992", zorder=2)
        hit = sum(r["in80"] for r in rz)
        ax.set_title(f"{zname}: actual inside 80% range {hit}/{len(rz)}", loc="left", fontsize=9)
        ax.set_xticks(x, [r["ym"][2:] for r in rz], rotation=90, fontsize=7)
        ax.set_ylabel("GWh per month")
        ax.axvline(5.5, color=GRID, lw=1)
    handles = [plt.Line2D([], [], color=BLUE[2], lw=5, label="forecast p10-p90"),
               plt.Line2D([], [], color=BLUE[3], lw=1.5, label="forecast median"),
               plt.Line2D([], [], marker="o", color=INK, lw=0, label="actual, inside the 80% range"),
               plt.Line2D([], [], marker="X", color=STATE["red"][0], lw=0, label="actual, outside"),
               plt.Line2D([], [], marker="D", color="#9a9992", lw=0, label="naive: same month last year")]
    fig.legend(handles=handles, loc="lower center", ncol=5, frameon=False, fontsize=8, bbox_to_anchor=(0.5, -0.06))
    c = mcdoc["calibration"]
    fig.suptitle(f"Monte Carlo walk-forward test: fit on data to {c['trainEnd']}, scored on two unseen winters  |  "
                 f"80% coverage {c['cov80']:.0%}  ·  90% coverage {c['cov90']:.0%}  ·  median error vs naive {c['maeVsNaive']:.2f}x",
                 x=0.01, ha="left", fontsize=10, fontweight="bold")
    fig.tight_layout()
    save(fig, "mc_calibration.png")


def chart_fan(mcdoc):
    fig, axes = plt.subplots(2, 2, figsize=(11, 7))
    for ax, a in zip(axes.flat, mcdoc["areas"]):
        x = np.arange(6)
        m = a["months"]
        q = {k: np.array([mm[k] for mm in m]) for k in ["p5", "p10", "p25", "p50", "p75", "p90", "p95"]}
        for path in a["samplePaths"]:
            ax.plot(x, path, color="#9a9992", lw=0.5, alpha=0.35)
        ax.fill_between(x, q["p5"], q["p95"], color=BLUE[0], lw=0, label="p5-p95")
        ax.fill_between(x, q["p10"], q["p90"], color=BLUE[1], lw=0, label="p10-p90")
        ax.fill_between(x, q["p25"], q["p75"], color=BLUE[2], lw=0, label="p25-p75")
        ax.plot(x, q["p50"], color=BLUE[3], lw=2, label="median")
        ax.scatter(x, a["sameMonthsLastObservedGWh"], color=INK, s=18, zorder=3, label="Nov 2022-Apr 2023 x 1.0435")
        ax.axvline(2.5, color=INK2, lw=1)
        ax.text(2.55, ax.get_ylim()[1], " Feb 1 rate reset", va="top", fontsize=7.5, color=INK2)
        ax.set_xticks(x, [mm["ym"] for mm in m], fontsize=8)
        t = a["total"]
        ax.set_title(f"{a['area']}: 6-month total {t['p50']:,.0f} GWh (80% range {t['p10']:,.0f}-{t['p90']:,.0f})", loc="left", fontsize=9)
        ax.set_ylabel("GWh per month")
    h, l = axes.flat[0].get_legend_handles_labels()
    fig.legend(h, l, loc="lower center", ncol=5, frameon=False, fontsize=8, bbox_to_anchor=(0.5, -0.04))
    fig.suptitle(f"Monte Carlo forecast, Nov 2026 - Apr 2027 ({mcdoc['nPaths']:,} paths; grey lines = 20 sample paths)",
                 x=0.01, ha="left", fontsize=10.5, fontweight="bold")
    fig.tight_layout()
    save(fig, "mc_forecast_fan.png")


EX = os.path.join("docs", "img", "examples")


def example_lights(doc):
    fig, axes = plt.subplots(1, 5, figsize=(12, 2.9))
    order = ["MA_RES", "MA", "NEMA", "SEMA", "WCMA"]
    names = {"MA_RES": "Massachusetts homes", "MA": "Massachusetts grid", "NEMA": "Northeast MA & Boston",
             "SEMA": "Southeast MA", "WCMA": "West & Central MA"}
    by = {a["area"]: a for a in doc["areas"]}
    for ax, k in zip(axes, order):
        a = by[k]
        c = a["current"]
        hexc, mk, lab = STATE[c["color"]]
        ax.set_axis_off()
        ax.scatter([0.5], [0.70], s=1500, color=hexc, marker="o")
        ax.scatter([0.5], [0.70], s=260, color=SURF, marker=mk)
        ax.text(0.5, 0.40, f"{c['color'].upper()}: {lab}", ha="center", fontsize=10, fontweight="bold")
        ax.text(0.5, 0.25, f"{c['pctVsAverage']:+.1f}% vs historical avg", ha="center", fontsize=9)
        ax.text(0.5, 0.13, f"normal range ±{c['bandPct']:.1f}%", ha="center", fontsize=8.5, color=INK2)
        ax.text(0.5, 1.02, names[k], ha="center", fontsize=9.5, fontweight="bold")
        ax.text(0.5, 0.0, ("month of " if a["unit"] == "month" else "day ") + c["date"][:7 if a["unit"] == "month" else 10],
                ha="center", fontsize=8, color=INK2)
        ax.set_xlim(0, 1)
        ax.set_ylim(-0.05, 1.08)
    fig.suptitle("Example output: current regime lights (regimes.json → areas[].current)", x=0.01, ha="left",
                 fontsize=10.5, fontweight="bold")
    save_to(fig, EX, "example_regime_lights.png")


def example_history(doc):
    a = next(x for x in doc["areas"] if x["area"] == "MA_RES")
    fig, ax = plt.subplots(figsize=(12, 4.4))
    dd, z = regime_panel(ax, a, big=True)
    ax.plot(dd, z, color=GRID, lw=0.8, zorder=1)
    last = a["timeline"][-1]
    ax.annotate(f"{last['date'][:7]}: {last['color']} ({last['pctVsAverage']:+.1f}% vs historical avg, range ±{last['bandPct']:.1f}%)",
                (dd[-1], z[-1]), xytext=(-330, 22), textcoords="offset points", fontsize=8.5,
                arrowprops={"arrowstyle": "-", "color": INK2})
    handles = [plt.Line2D([], [], marker=STATE[c][1], color=STATE[c][0], lw=1.4, label=f"{c} = {STATE[c][2]}") for c in STATE]
    ax.legend(handles=handles, loc="upper left", ncol=3, frameon=False, fontsize=8)
    ax.set_title("Example output: Massachusetts homes, 3-state HMM regime history (regimes.json → MA_RES.timeline)",
                 loc="left")
    fig.tight_layout(rect=(0, 0, 0.84, 1))
    save_to(fig, EX, "example_regime_history.png")


def example_fan(mcdoc):
    a = next(x for x in mcdoc["areas"] if x["area"] == "MA")
    m = a["months"]
    x = np.arange(6)
    q = {k: np.array([mm[k] for mm in m]) for k in ["p5", "p10", "p25", "p50", "p75", "p90", "p95"]}
    fig, ax = plt.subplots(figsize=(8, 4))
    ax.fill_between(x, q["p5"], q["p95"], color=BLUE[0], lw=0, label="90% range")
    ax.fill_between(x, q["p10"], q["p90"], color=BLUE[1], lw=0, label="80% range")
    ax.plot(x, q["p50"], color=BLUE[3], lw=2.2, marker="o", ms=5, label="median")
    ax.scatter(x, a["sameMonthsLastObservedGWh"], color=INK, s=16, zorder=3, label="same months last observed (scaled)")
    ax.axvline(2.5, color=INK2, lw=1)
    ax.text(2.55, q["p95"].max(), " Feb 1 rate reset", fontsize=8, color=INK2, va="top")
    ax.set_xticks(x, [mm["ym"] for mm in m])
    ax.set_ylabel("GWh per month")
    c = mcdoc["calibration"]
    ax.set_title(f"Example output: Massachusetts 6-month forecast (mc_forecast.json)\n"
                 f"tested on {c['nMonths']} unseen months: 80% range held {c['cov80']:.0%} of the time", loc="left", fontsize=9.5)
    ax.legend(loc="upper right", frameon=False, fontsize=7.5)
    save_to(fig, EX, "example_mc_fan.png")


def example_map(doc):
    """Hue = the town's zone regime (vs the historical average range); shade strength = the town's modeled annual
    consumption (zone 2023 load x EIA level ratio x population share), log scale: darker = more energy."""
    geo_path = os.path.join("data", "raw", "mass-municipalities.geojson")
    towns_path = build_path("ma_towns.csv")
    if not (os.path.exists(geo_path) and os.path.exists(towns_path)):
        print("skip example map: needs data/raw/mass-municipalities.geojson and data/build/ma_towns.csv")
        return
    import csv
    from matplotlib.collections import PolyCollection
    from backend.forecast.mc import level_ratio
    towns = {r["geoid"]: r for r in csv.DictReader(open(towns_path))}
    zpop = defaultdict(int)
    for r in towns.values():
        zpop[r["zone_approx"]] += int(r["pop2024"])
    daily = list(csv.DictReader(open(build_path("isone_ma_daily.csv"))))
    zload = {z: sum(float(r["rt_mwh"]) for r in daily if r["zone"] == z and r["date"].startswith("2023")) * level_ratio()
             for z in ("NEMA", "SEMA", "WCMA")}
    mwh = {g: zload[r["zone_approx"]] * int(r["pop2024"]) / zpop[r["zone_approx"]] for g, r in towns.items()}
    lo, hi = np.log10(min(mwh.values())), np.log10(max(mwh.values()))
    surf = np.array(matplotlib.colors.to_rgb(SURF))

    def shade(hexc, value):
        t = 0.15 + 0.85 * (np.log10(value) - lo) / (hi - lo)      # 0.15 = lightest town still visible
        return tuple(surf + t * (np.array(matplotlib.colors.to_rgb(hexc)) - surf))

    cur = {a["area"]: a["current"] for a in doc["areas"]}
    polys, cols = [], []
    for f in json.load(open(geo_path))["features"]:
        r = towns.get(f["properties"]["GEOID"])
        g = f["geometry"]
        rings = [g["coordinates"][0]] if g["type"] == "Polygon" else [q[0] for q in g["coordinates"]]
        for ring in rings:
            polys.append(np.array(ring)[:, :2])
            cols.append(shade(STATE[cur[r["zone_approx"]]["color"]][0], mwh[r["geoid"]]) if r else "#cccccc")
    fig = plt.figure(figsize=(12, 6.6))
    ax = fig.add_axes([0.0, 0.0, 0.78, 0.92])
    ax.add_collection(PolyCollection(polys, facecolors=cols, edgecolors=SURF, linewidths=0.3))
    ax.autoscale()
    ax.set_aspect(1 / np.cos(np.radians(42.2)))
    ax.set_axis_off()
    for z, (lon, lat) in {"WCMA": (-72.4, 42.55), "NEMA": (-71.2, 42.66), "SEMA": (-70.9, 41.85)}.items():
        c = cur[z]
        ax.text(lon, lat, f"{z}: {c['color']} ({c['pctVsAverage']:+.1f}% vs avg)", fontsize=9, fontweight="bold",
                ha="center", bbox={"boxstyle": "round,pad=0.25", "fc": SURF, "ec": GRID})
    boston = next(r for r in towns.values() if r["name"] == "Boston")
    ax.annotate(f"Boston ≈ {mwh[boston['geoid']] / 1e6:.1f} TWh/yr (modeled)", (-71.06, 42.33), xytext=(-70.55, 42.55),
                fontsize=8, arrowprops={"arrowstyle": "-", "color": INK2})
    # legend: rows = regime hue, columns = consumption strength
    lg = fig.add_axes([0.80, 0.30, 0.18, 0.40])
    lg.set_axis_off()
    marks = [1e3, 1e4, 1e5, 1e6, 5e6]
    for i, c in enumerate(["red", "grey", "green"]):
        for j, v in enumerate(marks):
            lg.add_patch(plt.Rectangle((j, i), 0.92, 0.85, color=shade(STATE[c][0], v)))
        lg.text(-0.15, i + 0.42, f"{c} = {STATE[c][2]}", ha="right", va="center", fontsize=8)
    for j, v in enumerate(marks):
        lg.text(j + 0.46, -0.25, f"{v / 1e3:,.0f}k" if v < 1e6 else f"{v / 1e6:,.0f}M", ha="center", va="top", fontsize=7.5)
    lg.text(2.5, -0.85, "modeled annual MWh (log scale)", ha="center", va="top", fontsize=8, color=INK2)
    lg.text(2.5, 3.25, "hue = zone regime\nshade = how much energy", ha="center", va="bottom", fontsize=8.5, fontweight="bold")
    lg.set_xlim(-2.2, 5.1)
    lg.set_ylim(-1.2, 4.0)
    fig.suptitle(f"Example output: 351 towns, regime on {cur['MA']['date']} · darker = more energy used "
                 "(modeled from population share of zone load; zones approximate by county)", x=0.01, ha="left",
                 fontsize=10, fontweight="bold")
    save_to(fig, EX, "example_town_map.png")


def save_to(fig, folder, name):
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, name)
    fig.savefig(path, dpi=160, bbox_inches="tight")
    plt.close(fig)
    print("wrote", path)


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    reg = json.load(open(build_path("regimes.json")))
    mcd = json.load(open(build_path("mc_forecast.json")))
    chart_timeline(reg)
    chart_seasonality(reg)
    chart_leakage()
    chart_calibration(mcd)
    chart_fan(mcd)
    example_lights(reg)
    example_history(reg)
    example_map(reg)
