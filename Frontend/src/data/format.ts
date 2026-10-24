export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-08" -> months since year 0, so month arithmetic is plain integer math. */
export function ymIndex(ym: string): number {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) throw new Error(`expected YYYY-MM, got ${ym}`);
  const month = Number(m[2]);
  if (month < 1 || month > 12) throw new Error(`month out of range: ${ym}`);
  return Number(m[1]) * 12 + month - 1;
}

export function ymFromIndex(i: number): string {
  const y = Math.floor(i / 12);
  const m = (i % 12) + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

export function ym(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function addMonths(ymStr: string, k: number): string {
  return ymFromIndex(ymIndex(ymStr) + k);
}

/** "2026-08" -> "Aug 2026" */
export function ymLabel(ymStr: string): string {
  const i = ymIndex(ymStr);
  return `${MONTHS[i % 12]} ${Math.floor(i / 12)}`;
}

/** "2026-08" -> "Aug ’26" for tight axes */
export function ymShort(ymStr: string): string {
  const i = ymIndex(ymStr);
  return `${MONTHS[i % 12]} ’${String(Math.floor(i / 12)).slice(2)}`;
}

/** "2023-12-31" -> "Dec 31, 2023" */
export function dateLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

const nf = new Map<string, Intl.NumberFormat>();
function fmt(min: number, max: number): Intl.NumberFormat {
  const key = `${min}-${max}`;
  let f = nf.get(key);
  if (!f) {
    f = new Intl.NumberFormat("en-US", { minimumFractionDigits: min, maximumFractionDigits: max });
    nf.set(key, f);
  }
  return f;
}

export function fmtNum(n: number, digits = 0): string {
  return fmt(digits, digits).format(n);
}

/** 1,284 / 12.9K / 4.2M — for tick labels and stat tiles. */
export function fmtCompact(n: number, digits = 1): string {
  const a = Math.abs(n);
  if (a >= 1e9) return `${fmt(0, digits).format(n / 1e9)}B`;
  if (a >= 1e6) return `${fmt(0, digits).format(n / 1e6)}M`;
  if (a >= 1e4) return `${fmt(0, digits).format(n / 1e3)}K`;
  return fmt(0, digits).format(n);
}

export function fmtCents(c: number, digits = 1): string {
  return `${fmtNum(c, digits)}¢`;
}

export function fmtPct(fraction: number, digits = 0): string {
  return `${fmtNum(fraction * 100, digits)}%`;
}

export function fmtSignedPct(fraction: number, digits = 1): string {
  const v = fraction * 100;
  const s = fmtNum(Math.abs(v), digits);
  if (s === fmtNum(0, digits)) return `${s}%`;
  return `${v > 0 ? "+" : "−"}${s}%`;
}

/**
 * Signed dollars, half-up to cents — the backend's `_display` (Python Decimal(str(x)) quantized
 * ROUND_HALF_UP). Rounds the shortest decimal representation of the float, like Python's str(),
 * so -187.785 becomes "-$187.79" exactly as in savings_model.json.
 */
export function moneyDisplay(amount: number): string {
  if (!Number.isFinite(amount)) throw new Error("amount must be finite");
  const neg = amount < 0;
  let s = Math.abs(amount).toString();
  if (s.includes("e")) s = Math.abs(amount).toFixed(20);
  const [intPart, frac = ""] = s.split(".");
  const f = (frac + "000").slice(0, 3);
  let cents = BigInt(intPart) * 100n + BigInt(f.slice(0, 2));
  if (Number(f[2]) >= 5) cents += 1n;
  const dollars = cents / 100n;
  const rem = (cents % 100n).toString().padStart(2, "0");
  const body = `$${dollars.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${rem}`;
  return neg && cents !== 0n ? `-${body}` : body;
}
