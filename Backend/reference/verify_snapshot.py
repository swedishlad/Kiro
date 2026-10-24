#!/usr/bin/env python3
"""G-DATA-1: verify a residential basic-service snapshot against the reference checksums.

Usage:  python3 reference/verify_snapshot.py data/snapshot/monthly_residential_cents_2026-07-02.csv \
                                             data/snapshot/fixed_residential_cents_2026-07-02.csv
Exit 0 = pass, 1 = fail. Stdlib only.

Checksum definition (must match the in-browser parse of Mass.gov "Basic Service Rates 7.2.2026",
computed Oct 22 2026):
  rows    = data rows that have >= 1 non-empty value in the 4 utility columns
  count_j = number of non-empty values in column j
  sum_j   = sum over rows of round(value_j * 1000)   (values are already rounded to 3 dp)
"""
import csv
import sys

COLS = ["NG", "NSTAR", "WMECo", "Unitil"]
EXPECTED = {
    "monthly": {"rows": 265, "counts": [265, 241, 265, 265],
                "sums": [3087786, 2836754, 2799669, 3044615]},
    "fixed": {"rows": 122, "counts": [46, 41, 45, 45],
              "sums": [529720, 489518, 481230, 527218]},
}
# Values that must be present exactly. 7 are exact matches to outside sources (S2, S3); the NSTAR 2026-07
# value 15.629 is only approximately confirmed (S3 says "15.6"). See docs/apis/01.
ANCHORS = {
    "fixed": {("2027", "1"): [17.185, 17.323, 15.934, 18.921],   # AG Energy Advocate Summer 2026
              ("2026", "7"): [15.372, 15.629, None, None]},       # Boston.com: NG exact; NSTAR approx ("15.6")
    "monthly": {("2026", "7"): [15.546, None, None, None],        # Boston.com: NG variable before Aug 1
                ("2026", "8"): [16.074, None, None, None]},       # Boston.com: NG variable from Aug 1
}


def check(kind, path):
    ok = True
    rows, counts, sums = 0, [0] * 4, [0] * 4
    index = {}
    with open(path, newline="") as fh:
        rd = csv.reader(fh)
        header = next(rd)
        if header[2:6] != COLS:
            print(f"[{kind}] FAIL header {header}")
            return False
        for r in rd:
            vals = [x.strip() for x in r[2:6]]
            if not any(vals):
                continue
            rows += 1
            index[(r[0], r[1])] = vals
            for j, v in enumerate(vals):
                if v:
                    f = float(v)
                    counts[j] += 1
                    sums[j] += round(f * 1000)
    exp = EXPECTED[kind]
    for name, got, want in (("rows", rows, exp["rows"]), ("counts", counts, exp["counts"]),
                            ("sums", sums, exp["sums"])):
        status = "ok" if got == want else "FAIL"
        ok &= got == want
        print(f"[{kind}] {name:6s} {status}  got={got} want={want}")
    for key, want in ANCHORS[kind].items():
        got = index.get(key)
        for j, w in enumerate(want):
            if w is None:
                continue
            g = float(got[j]) if got and got[j] else None
            status = "ok" if g == w else "FAIL"
            ok &= g == w
            print(f"[{kind}] anchor {key[0]}-{key[1]:>2s} {COLS[j]:6s} {status} got={g} want={w}")
    return ok


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    good = check("monthly", sys.argv[1]) & check("fixed", sys.argv[2])
    print("G-DATA-1:", "PASS" if good else "FAIL")
    sys.exit(0 if good else 1)
