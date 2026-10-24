#!/usr/bin/env python3
"""G-DATA-3: verify the Massachusetts usage snapshot (RECS 2020 + EIA-861M) against reference checksums.

Usage:  python3 reference/verify_usage.py data/snapshot/recs_ma_2020.csv data/snapshot/eia_ma_monthly_2026-08.csv \
                                         [data/snapshot/eia_ma_total_monthly_2026-08.csv]
        (or the data/build/ copies: recs_ma.csv, eia_ma_monthly.csv, eia_ma_total_monthly.csv)
Exit 0 = pass, 1 = fail. Stdlib only.

Checksums were computed Oct 23 2026 from reference/ingest_usage.py run on
  recs2020_public_v7.csv  sha256 8d5f6d3120d2cbc2535151c7d455e7a536ca9768f773e15edd45932ec38b3592
  sales_revenue.xlsx      sha256 c7963ad7c9bd2020cc7472f100a9c5330a4dff97a62be95407137a14b9c4044e
The DERIVED checks recompute the numbers quoted in .kiro/steering/ground-truth.md, so a typo there fails here.
EIA revises Preliminary months; a newer sales_revenue.xlsx will change the EIA checksums (docs/apis/08 §4).
"""
import csv
import statistics as st
import sys
from collections import Counter, defaultdict

RECS = {"rows": 552, "kwh_x100": 434306996, "sqft": 1149900, "nweight_x1000": 2713778002,
        "fuelheat": {"-2": 2, "1": 288, "2": 17, "3": 149, "5": 84, "7": 12},
        "anchors": {"100026": 12737.88, "100028": 10247.86}}
RECS_DERIVED = {"wmed_sqft": {"<1000": 4074, "1000-1999": 5974, "2000-2999": 7270, "3000+": 10597},
                "wmed_fuel": {"1": 5616, "3": 8148, "5": 6092}, "median_kwh": 6649}
EIA = {"rows": 200, "first": (2010, 1), "last": (2026, 8), "status": {"Final": 192, "Preliminary": 8},
       "sales_x100": 33759755410, "customers": 559471389,
       "anchors": {(2010, 1): (2010717.0, 2669895, 15.05), (2026, 8): (2260204.6, 2921850, 30.48)}}
EIA_DERIVED = {"calmonth_kwh_per_customer": [694, 635, 588, 514, 489, 568, 746, 740, 621, 507, 513, 623],
               "shares_2019_2025": [0.0940, 0.0867, 0.0802, 0.0716, 0.0685, 0.0783,
                                    0.1044, 0.1044, 0.0851, 0.0708, 0.0701, 0.0857]}


TOTAL = {"rows": 200, "sales_x100": 88164137460, "customers": 644446243,
         "sales_2023": 50011963.9, "sales_l12_2026_08": 52186559.3, "growth_l12_vs_2023": 1.0435}


def report(label, got, want):
    ok = got == want
    print(f"{label:34s} {'ok' if ok else 'FAIL'}  got={got} want={want}")
    return ok


def bucket(sqft):
    return "<1000" if sqft < 1000 else "1000-1999" if sqft < 2000 else "2000-2999" if sqft < 3000 else "3000+"


def wmed(pairs):
    pairs = sorted(pairs)
    half, acc = sum(w for _, w in pairs) / 2, 0.0
    for v, w in pairs:
        acc += w
        if acc >= half:
            return v


def check_recs(path):
    rows = list(csv.DictReader(open(path, newline="")))
    ok = report("[recs] rows", len(rows), RECS["rows"])
    ok &= report("[recs] sum KWH x100", sum(round(float(r["KWH"]) * 100) for r in rows), RECS["kwh_x100"])
    ok &= report("[recs] sum TOTSQFT_EN", sum(int(r["TOTSQFT_EN"]) for r in rows), RECS["sqft"])
    ok &= report("[recs] sum NWEIGHT x1000", sum(round(float(r["NWEIGHT"]) * 1000) for r in rows),
                 RECS["nweight_x1000"])
    ok &= report("[recs] FUELHEAT counts", dict(sorted(Counter(r["FUELHEAT"] for r in rows).items())),
                 RECS["fuelheat"])
    by_id = {r["DOEID"]: float(r["KWH"]) for r in rows}
    for doeid, want in RECS["anchors"].items():
        ok &= report(f"[recs] anchor DOEID {doeid} KWH", by_id.get(doeid), want)
    sq, fu = defaultdict(list), defaultdict(list)
    for r in rows:
        pair = (float(r["KWH"]), float(r["NWEIGHT"]))
        sq[bucket(float(r["TOTSQFT_EN"]))].append(pair)
        fu[r["FUELHEAT"]].append(pair)
    ok &= report("[recs] DERIVED wmed by sq ft", {k: round(wmed(sq[k])) for k in RECS_DERIVED["wmed_sqft"]},
                 RECS_DERIVED["wmed_sqft"])
    ok &= report("[recs] DERIVED wmed by fuel", {k: round(wmed(fu[k])) for k in RECS_DERIVED["wmed_fuel"]},
                 RECS_DERIVED["wmed_fuel"])
    ok &= report("[recs] DERIVED median KWH", round(st.median(by_id.values())), RECS_DERIVED["median_kwh"])
    return ok


def check_eia(path):
    rows = list(csv.DictReader(open(path, newline="")))
    ym = [(int(r["year"]), int(r["month"])) for r in rows]
    ok = report("[eia] rows", len(rows), EIA["rows"])
    ok &= report("[eia] first month", ym[0], EIA["first"])
    ok &= report("[eia] last month", ym[-1], EIA["last"])
    ok &= report("[eia] ascending, no gaps", all((b[0] * 12 + b[1]) - (a[0] * 12 + a[1]) == 1
                                                 for a, b in zip(ym, ym[1:])), True)
    ok &= report("[eia] status counts", dict(Counter(r["status"] for r in rows)), EIA["status"])
    ok &= report("[eia] sum sales_mwh x100", sum(round(float(r["sales_mwh"]) * 100) for r in rows),
                 EIA["sales_x100"])
    ok &= report("[eia] sum customers", sum(int(r["customers"]) for r in rows), EIA["customers"])
    idx = dict(zip(ym, rows))
    for key, (sales, cust, price) in EIA["anchors"].items():
        r = idx.get(key)
        got = (float(r["sales_mwh"]), int(r["customers"]), float(r["price_cents"])) if r else None
        ok &= report(f"[eia] anchor {key[0]}-{key[1]:02d}", got, (sales, cust, price))
    cal = defaultdict(list)
    for (y, m), r in zip(ym, rows):
        cal[m].append(float(r["kwh_per_customer"]))
    ok &= report("[eia] DERIVED cal-month kWh/cust", [round(st.mean(cal[m])) for m in range(1, 13)],
                 EIA_DERIVED["calmonth_kwh_per_customer"])
    yearly = defaultdict(dict)
    for (y, m), r in zip(ym, rows):
        yearly[y][m] = float(r["sales_mwh"])
    shares = [round(st.mean(yearly[y][m] / sum(yearly[y].values()) for y in range(2019, 2026)), 4)
              for m in range(1, 13)]
    ok &= report("[eia] DERIVED sales shares 2019-25", shares, EIA_DERIVED["shares_2019_2025"])
    return ok


def check_total(path):
    """All-sector MA sales: the level reference that carries ISO-NE's 2023 load forward (docs/specs/mc-forecast.md)."""
    rows = list(csv.DictReader(open(path, newline="")))
    ok = report("[eia-total] rows", len(rows), TOTAL["rows"])
    ok &= report("[eia-total] sum total_sales x100", sum(round(float(r["total_sales_mwh"]) * 100) for r in rows),
                 TOTAL["sales_x100"])
    ok &= report("[eia-total] sum total_customers", sum(int(float(r["total_customers"])) for r in rows), TOTAL["customers"])
    pick = lambda f: round(sum(float(r["total_sales_mwh"]) for r in rows if f(int(r["year"]), int(r["month"]))), 1)
    a, b = pick(lambda y, m: y == 2023), pick(lambda y, m: (y == 2025 and m >= 9) or (y == 2026 and m <= 8))
    ok &= report("[eia-total] 2023 / last-12 MWh", (a, b), (TOTAL["sales_2023"], TOTAL["sales_l12_2026_08"]))
    ok &= report("[eia-total] DERIVED growth ratio", round(b / a, 4), TOTAL["growth_l12_vs_2023"])
    return ok


if __name__ == "__main__":
    if len(sys.argv) not in (3, 4):
        sys.exit(__doc__)
    good = check_recs(sys.argv[1]) & check_eia(sys.argv[2]) & (check_total(sys.argv[3]) if len(sys.argv) == 4 else True)
    print("G-DATA-3:", "PASS" if good else "FAIL")
    sys.exit(0 if good else 1)
