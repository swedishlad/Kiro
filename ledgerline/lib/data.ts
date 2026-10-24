// Simulated data source. Replace `getMetrics` with a real database or API call;
// the shape it returns is what the dashboard UI consumes.

export type Range = "7d" | "30d" | "90d";
export type OrderStatus = "paid" | "pending" | "refunded";

export type Order = {
  id: string;
  customer: string;
  channel: string;
  amount: number;
  status: OrderStatus;
  placedAt: string;
};

export type Metrics = {
  range: Range;
  generatedAt: string;
  kpis: {
    revenue: number;
    revenuePrev: number;
    orders: number;
    ordersPrev: number;
    aov: number;
    aovPrev: number;
    conversion: number;
    conversionPrev: number;
  };
  series: { label: string; revenue: number; prior: number }[];
  channels: { name: string; revenue: number }[];
  orders: Order[];
};

const DAYS: Record<Range, number> = { "7d": 7, "30d": 30, "90d": 90 };
const CHANNELS = ["Organic search", "Email", "Paid social", "Direct", "Referral"];
const CUSTOMERS = [
  "Maya Okafor", "Liam Brandt", "Sofia Reyes", "Noah Kim", "Ava Lindqvist",
  "Ethan Moyo", "Zara Haddad", "Lucas Ferreira", "Isla Nakamura", "Owen Petrov",
  "Priya Raman", "Mateo Silva", "Hana Berg", "Jonas Weiss", "Leila Aziz",
];

// Small seeded PRNG so the history is stable between requests and only the
// most recent point moves; that is what makes the page feel "live".
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dayRevenue(dayIndex: number, rand: () => number) {
  const weekday = dayIndex % 7;
  const weekly = [0.9, 1.0, 1.05, 1.1, 1.25, 1.4, 1.1][weekday];
  const trend = 1 + dayIndex * 0.0035;
  return Math.round(4200 * weekly * trend * (0.85 + rand() * 0.3));
}

export function getMetrics(range: Range, now = new Date()): Metrics {
  const n = DAYS[range];
  const rand = mulberry32(range.length * 7919 + n);
  const priorRand = mulberry32(range.length * 104729 + n);

  // Full history (current window + prior window), oldest first.
  const current: number[] = [];
  const prior: number[] = [];
  for (let i = 0; i < n; i++) {
    prior.push(Math.round(dayRevenue(i, priorRand) * 0.93));
    current.push(dayRevenue(i + n, rand));
  }

  // "Today" keeps growing through the day and jitters on every request.
  const minutesIntoDay = now.getHours() * 60 + now.getMinutes();
  const dayProgress = Math.min(1, (minutesIntoDay + 30) / 1440);
  const jitter = 1 + Math.sin(now.getTime() / 9000) * 0.015;
  current[n - 1] = Math.round(current[n - 1] * (0.35 + dayProgress * 0.65) * jitter);

  const series = current.map((revenue, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (n - 1 - i));
    return {
      label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      revenue,
      prior: prior[i],
    };
  });

  const revenue = current.reduce((a, b) => a + b, 0);
  const revenuePrev = prior.reduce((a, b) => a + b, 0);
  const aov = 86 + (n % 7);
  const aovPrev = aov * 0.97;
  const orders = Math.round(revenue / aov);
  const ordersPrev = Math.round(revenuePrev / aovPrev);
  const conversion = 3.1 + (n % 5) * 0.12;
  const conversionPrev = conversion - 0.18;

  const shares = [0.34, 0.22, 0.17, 0.16, 0.11];
  const channels = CHANNELS.map((name, i) => ({
    name,
    revenue: Math.round(revenue * shares[i]),
  })).sort((a, b) => b.revenue - a.revenue);

  // Recent orders: stable ids, newest first, with a fresh order appearing
  // every ~20 seconds so the table visibly changes.
  const bucket = Math.floor(now.getTime() / 20000);
  const orderList: Order[] = [];
  for (let i = 0; i < 40; i++) {
    const b = bucket - i;
    const r = mulberry32(b * 31 + 17);
    const roll = r();
    orderList.push({
      id: `LL-${(10000 + (b % 90000)).toString()}`,
      customer: CUSTOMERS[Math.floor(r() * CUSTOMERS.length)],
      channel: CHANNELS[Math.floor(r() * CHANNELS.length)],
      amount: Math.round((24 + r() * 260) * 100) / 100,
      status: roll > 0.92 ? "refunded" : roll > 0.72 ? "pending" : "paid",
      placedAt: new Date(b * 20000).toISOString(),
    });
  }

  return {
    range,
    generatedAt: now.toISOString(),
    kpis: { revenue, revenuePrev, orders, ordersPrev, aov, aovPrev, conversion, conversionPrev },
    series,
    channels,
    orders: orderList,
  };
}
