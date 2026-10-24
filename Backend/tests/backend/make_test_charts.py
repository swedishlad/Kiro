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


def chart_timeline(doc):
    days, gwh, temp = B.load_all()
    fig, axes = plt.subplots(4, 1, figsize=(11, 9.5), sharex=True)
    for ax, a in zip(axes, doc["areas"]):
        r = B.area_series(a["area"], days, gwh, temp)
        keep = days >= B.OUTPUT_FROM
        dd, rr = days[keep], r[keep]
        colors = [e["color"] for e in a["timeline"]]
        for c, (hexc, mk, lab) in STATE.items():
            sel = np.array([x == c for x in colors])
            ax.scatter(dd[sel], rr[sel], s=7, marker=mk, color=hexc, linewidths=0, alpha=0.85, label=f"{c} = {lab}")
        for s in a["states"]:
            ax.axhline(s["meanResidualPct"], color=STATE[s["color"]][0], lw=1.2)
            ax.text(dd[-1] + dt.timedelta(days=12), s["meanResidualPct"], f"{s['label']} {s['meanResidualPct']:+.1f}%",
                    va="center", fontsize=8, color=INK2)
        ax.set_ylabel("% vs expected")
        ax.set_title(f"{a['area']} ({a['states'][2]['shareOfDays']:.0%} of days red, {a['states'][0]['shareOfDays']:.0%} green)",
                     loc="left", fontsize=9)
        ax.set_ylim(-22, 22)
    axes[0].legend(loc="upper left", ncol=3, frameon=False, fontsize=8, markerscale=2)
    axes[-1].xaxis.set_major_locator(mdates.YearLocator())
    axes[-1].xaxis.set_major_formatter(mdates.DateFormatter("%Y"))
    fig.suptitle("HMM regimes on weather-adjusted daily load, forward-filtered (no look-ahead), 2019-2023\n"
                 "each dot is one day: actual load vs a 2-year weather model; colour, marker and height all show the state",
                 x=0.01, ha="left", fontsize=10.5, fontweight="bold")
    save(fig, "hmm_states_timeline.png")


def chart_seasonality(doc):
    fig, ax = plt.subplots(figsize=(8.5, 4.2))
    months = np.arange(1, 13)
    ours = defaultdict(Counter)
    for e in doc["areas"][3]["timeline"]:
        ours[int(e["date"][5:7])][e["color"]] += 1
    y_ours = [ours[m]["red"] / sum(ours[m].values()) for m in months]
    ax.plot(months, y_ours, color=ZONEC["NEMA"], lw=2, marker="o", ms=6, label="this model: weather-adjusted daily (MA)")
    ax.text(12.25, y_ours[-1], "weather-adjusted", color=INK2, va="center", fontsize=8)
    other = build_path("hmm_regimes.json")
    if os.path.exists(other):
        theirs = defaultdict(Counter)
        for e in json.load(open(other))["timeline"]:
            theirs[int(e["period"][5:7])][e["regime"]] += 1
        y_th = [theirs[m]["RED"] / sum(theirs[m].values()) for m in months]
        ax.plot(months, y_th, color=ZONEC["SEMA"], lw=2, marker="s", ms=6, label="raw monthly kWh per customer (src/hmm)")
        ax.text(12.25, y_th[-1], "raw monthly", color=INK2, va="center", fontsize=8)
    ax.axhspan(0.7, 1.0, color="#f0efec", zorder=0)
    ax.text(1.1, 0.95, "fails: a month that is mostly red means the model detects the season", fontsize=8, color=INK2, va="top")
    ax.set_xticks(months, ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"])
    ax.set_ylim(0, 1.0)
    ax.set_xlim(0.6, 13.6)
    ax.set_ylabel("share of days (or months) in the red state")
    ax.yaxis.set_major_formatter(matplotlib.ticker.PercentFormatter(1.0))
    ax.legend(loc="center left", frameon=False, fontsize=8)
    ax.set_title("Test: is 'red' a behaviour or just the season?", loc="left")
    save(fig, "hmm_not_seasonal.png")


def chart_leakage():
    z = np.load(os.path.join(OUT, "_hmm_leakage.npz"))
    days = np.array([dt.date.fromisoformat(d) for d in z["days"]])
    cut = dt.date.fromisoformat(str(z["cut"]))
    keep = days >= B.OUTPUT_FROM
    fig, ax = plt.subplots(figsize=(9, 3.6))
    ax.plot(days[keep], z["p1"][keep, 2], color=ZONEC["NEMA"], lw=1.6, label="original data")
    ax.plot(days[keep], z["p2"][keep, 2], color=ZONEC["SEMA"], lw=1.0, label="load scrambled after the cut (+/-5%)")
    ax.axvline(cut, color=INK, lw=1)
    ax.text(cut, 1.04, f"  cut {cut}: lines identical before (532 days, bit-for-bit)", fontsize=8, color=INK2)
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


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    reg = json.load(open(build_path("regimes.json")))
    mcd = json.load(open(build_path("mc_forecast.json")))
    chart_timeline(reg)
    chart_seasonality(reg)
    chart_leakage()
    chart_calibration(mcd)
    chart_fan(mcd)
