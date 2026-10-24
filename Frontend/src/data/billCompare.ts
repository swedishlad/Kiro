// Compares one bill with the dashboard's reference data and picks suggestions that fit it.
//
// What "average" means here, honestly: usage and price are published for Massachusetts as a whole
// (EIA-861M, RECS 2020), not per town, so usage is compared with the statewide typical account for
// the same calendar month; the supply rate is compared with the bill's own utility's basic-service
// rate for that month, which is the one figure that really is local.

import { fmtCents, fmtNum, fmtPct, ymIndex, ymLabel } from "./format.ts";
import type { EiaMonth, RecsHome, UtilityId } from "./model.ts";
import { utilityById } from "./model.ts";
import { basicServiceCents, type TermSpan } from "./savings.ts";
import { weightedShareAtOrBelow } from "./stats.ts";

/** Days in an average month; bills are scaled to this so a 33-day bill compares fairly. */
export const MONTH_DAYS = 30.44;
/** Rule of thumb for Massachusetts rooftop solar: about 1,200 kWh a year per kW of panels. */
export const SOLAR_KWH_PER_KW_YEAR = 1200;

export interface BillInput {
  utility: UtilityId;
  kwh: number;
  totalDollars: number | null;
  supplyCents: number | null;
  /** YYYY-MM the billing period mostly falls in */
  billYm: string;
  days: number | null;
}

export interface Reference {
  /** Typical MA account, kWh per calendar month Jan..Dec (EIA-861M, calendar 2025) */
  typicalMonthlyKwh: number[];
  typicalYear: number;
  /** Share of a year's use in each calendar month, Jan..Dec */
  seasonalShares: number[];
  eia: EiaMonth[];
  recs: RecsHome[];
  spans: Record<UtilityId, TermSpan[]>;
}

export interface Comparison {
  billYm: string;
  /** Usage scaled to an average-length month */
  monthKwh: number;
  typicalKwh: number;
  /** monthKwh / typicalKwh */
  usageRatio: number;
  /** This month's use carried to a year with the statewide seasonal pattern */
  annualKwh: number;
  /** Share of Massachusetts homes (RECS 2020, weighted) using no more than annualKwh a year */
  shareOfHomesBelow: number;
  avgPriceCents: number;
  avgPriceYm: string;
  avgPriceIsSameMonth: boolean;
  /** All-in cents per kWh on this bill (total ÷ kWh), when the total is known */
  yourPriceCents: number | null;
  /** The bill scaled to an average-length month, and the typical home's bill for the same month */
  yourMonthDollars: number | null;
  typicalMonthDollars: number;
  basicCents: number | null;
  /** supplyCents − basicCents */
  supplyGapCents: number | null;
  /** What the supply gap costs (+) or saves (−) over a year at this home's use */
  supplyGapYearDollars: number | null;
}

export function compareBill(bill: BillInput, ref: Reference): Comparison {
  if (!(bill.kwh > 0)) throw new Error("kWh must be a positive number");
  const month = (ymIndex(bill.billYm) % 12) + 1;
  const monthKwh = bill.days && bill.days > 0 ? (bill.kwh / bill.days) * MONTH_DAYS : bill.kwh;
  const typicalKwh = ref.typicalMonthlyKwh[month - 1];
  const annualKwh = monthKwh / ref.seasonalShares[month - 1];
  const shareOfHomesBelow = weightedShareAtOrBelow(
    ref.recs.map((h) => ({ value: h.kwh, weight: h.weight })),
    annualKwh,
  );

  // The bill's own month when EIA has it, else the newest twelve months (revenue ÷ sales).
  const same = ref.eia.find((m) => m.ym === bill.billYm);
  let avgPriceCents: number;
  let avgPriceYm: string;
  if (same) {
    avgPriceCents = same.priceCents;
    avgPriceYm = same.ym;
  } else {
    const last12 = ref.eia.slice(-12);
    avgPriceCents = (last12.reduce((s, m) => s + m.revenueKusd, 0) / last12.reduce((s, m) => s + m.salesMwh, 0)) * 100;
    avgPriceYm = last12[last12.length - 1].ym;
  }

  const yourPriceCents = bill.totalDollars !== null && bill.totalDollars > 0 ? (bill.totalDollars / bill.kwh) * 100 : null;
  const yourMonthDollars =
    bill.totalDollars !== null && bill.totalDollars > 0 ? (bill.days && bill.days > 0 ? (bill.totalDollars / bill.days) * MONTH_DAYS : bill.totalDollars) : null;
  const typicalMonthDollars = (typicalKwh * avgPriceCents) / 100;

  const basicCents = basicServiceCents(ref.spans, bill.utility, bill.billYm);
  const supplyGapCents = bill.supplyCents !== null && basicCents !== null ? bill.supplyCents - basicCents : null;
  const supplyGapYearDollars = supplyGapCents !== null ? (supplyGapCents * annualKwh) / 100 : null;

  return {
    billYm: bill.billYm,
    monthKwh,
    typicalKwh,
    usageRatio: monthKwh / typicalKwh,
    annualKwh,
    shareOfHomesBelow,
    avgPriceCents,
    avgPriceYm,
    avgPriceIsSameMonth: Boolean(same),
    yourPriceCents,
    yourMonthDollars,
    typicalMonthDollars,
    basicCents,
    supplyGapCents,
    supplyGapYearDollars,
  };
}

// ----------------------------------------------------------------------------- suggestions

export type SuggestionKind = "save" | "use-less" | "alternative" | "good";

export interface Suggestion {
  id: string;
  kind: SuggestionKind;
  title: string;
  /** Why this applies to this bill, with its numbers */
  why: string;
  /** What to do */
  how: string;
  link?: { href: string; label: string };
}

/** Yearly estimates rest on one bill, so they are rounded to $10 rather than shown to the cent. */
const roughDollars = (v: number): string => `$${fmtNum(Math.round(Math.abs(v) / 10) * 10)}`;

const SUMMER = [6, 7, 8, 9];
const WINTER = [12, 1, 2, 3];

/** Ordered: money you can save by changing nothing at home first, then using less, then alternatives. */
export function suggestionsFor(bill: BillInput, c: Comparison): Suggestion[] {
  const out: Suggestion[] = [];
  const u = utilityById(bill.utility).name;
  const month = (ymIndex(c.billYm) % 12) + 1;
  const monthName = ymLabel(c.billYm).split(" ")[0];
  const high = c.usageRatio >= 1.2 || c.shareOfHomesBelow >= 0.67;
  const low = c.usageRatio <= 0.8 && c.shareOfHomesBelow <= 0.4;

  // 1. Supply rate against the utility's basic service
  if (c.supplyGapCents !== null && c.basicCents !== null && bill.supplyCents !== null) {
    if (c.supplyGapCents > 0.25) {
      out.push({
        id: "switch-supply",
        kind: "save",
        title: "Switch your supply back to basic service",
        why: `Your supply rate is ${fmtCents(bill.supplyCents, 2)} per kWh; ${u}'s basic service was ${fmtCents(c.basicCents, 2)} for ${ymLabel(c.billYm)}. At your use that is about ${roughDollars(c.supplyGapYearDollars ?? 0)} a year extra.`,
        how: `Call ${u} or your supplier to return to basic service; only the supply line changes, your delivery service stays the same. Check your supplier contract for an early-termination fee first, and compare offers on the state's Energy Switch site.`,
        link: { href: "https://www.energyswitchma.gov/", label: "Energy Switch Massachusetts" },
      });
    } else if (c.supplyGapCents < -0.25) {
      out.push({
        id: "supplier-ok",
        kind: "good",
        title: "Your supplier is beating basic service",
        why: `You pay ${fmtCents(bill.supplyCents, 2)} per kWh for supply against ${u}'s ${fmtCents(c.basicCents, 2)}, worth about ${roughDollars(c.supplyGapYearDollars ?? 0)} a year at your use.`,
        how: "Note when your contract ends: many competitive rates renew automatically at a higher price, so check the renewal rate against basic service then.",
      });
    }
  }

  // 2. Using less, aimed at the season the bill covers
  if (high) {
    const season = SUMMER.includes(month) ? "summer" : WINTER.includes(month) ? "winter" : "other";
    out.push({
      id: "assessment",
      kind: "use-less",
      title: "Book a no-cost Mass Save home energy assessment",
      why: `You used ${fmtNum(c.monthKwh)} kWh in a typical-length ${monthName}, ${fmtNum(c.usageRatio, 1)}× the ${fmtNum(c.typicalKwh)} kWh of an average Massachusetts account, and more than ${fmtPct(c.shareOfHomesBelow)} of homes over a year.`,
      how: "An energy specialist visits for free, installs some efficiency items at no cost, and tells you which rebates (insulation, air sealing, heat pumps, appliances) you qualify for.",
      link: { href: "https://www.masssave.com/", label: "Mass Save" },
    });
    out.push(
      season === "summer"
        ? {
            id: "cooling",
            kind: "use-less",
            title: "Cut what cooling costs you",
            why: `${monthName} is a cooling month, and air conditioning is the usual reason summer bills run high.`,
            how: "Set the thermostat a few degrees warmer when you're out, clean or replace AC filters, close blinds on sunny windows, and when an old unit needs replacing, choose a heat pump: it cools more efficiently and heats in winter too.",
          }
        : season === "winter"
          ? {
              id: "heating",
              kind: "use-less",
              title: "Find what is heating with electricity",
              why: `${monthName} is a heating month; electric space heaters and electric resistance heat use a lot of kWh.`,
              how: "Seal drafts around windows and doors, turn space heaters off in empty rooms, and ask about weatherization in the Mass Save assessment: insulation lowers every heating bill after it.",
            }
          : {
              id: "baseload",
              kind: "use-less",
              title: "Look for things that run all the time",
              why: `${monthName} needs little heating or cooling, so high use usually comes from equipment that is always on.`,
              how: "An old second fridge or freezer, a dehumidifier, a pool pump or electric water heater can each add hundreds of kWh a month. Mass Save will pick up and recycle an old working fridge or freezer.",
            },
    );
  } else if (low) {
    out.push({
      id: "low-use",
      kind: "good",
      title: "Your use is already low",
      why: `${fmtNum(c.monthKwh)} kWh in a typical-length ${monthName} is ${fmtNum(c.usageRatio, 1)}× an average account; fewer than ${fmtPct(c.shareOfHomesBelow)} of Massachusetts homes use less over a year.`,
      how: "At low use the fixed monthly customer charge is a bigger share of the bill, so the supply rate is the main thing left to check.",
    });
  }

  // 3. Alternatives: no roof needed first, then rooftop solar sized to this home
  out.push({
    id: "community-solar",
    kind: "alternative",
    title: "Join a community solar farm",
    why: "No panels, no roof and no upfront cost, so it also works for renters and condos.",
    how: "You subscribe to part of a local solar farm; its output appears as credits on your utility bill, usually sold to you below their face value, so each month's bill goes down.",
    link: { href: "https://www.masscec.com/", label: "Massachusetts Clean Energy Center" },
  });
  const kw = Math.max(1, Math.round((c.annualKwh / SOLAR_KWH_PER_KW_YEAR) * 2) / 2);
  out.push({
    id: "rooftop-solar",
    kind: "alternative",
    title: `Rooftop solar: about ${fmtNum(kw, 1)} kW would cover your use`,
    why: `At ${fmtNum(c.annualKwh)} kWh a year and roughly ${fmtNum(SOLAR_KWH_PER_KW_YEAR)} kWh per kW of panels in Massachusetts, a ${fmtNum(kw, 1)} kW system would make about as much as you use, worth around ${roughDollars((c.annualKwh * c.avgPriceCents) / 100)} a year at today's average price.`,
    how: "Get two or three quotes for your roof's real orientation and shade. Net metering credits what you send to the grid, and the state's SMART program and a state income tax credit help pay for it.",
    link: { href: "https://www.masscec.com/", label: "Massachusetts Clean Energy Center" },
  });
  if (!SUMMER.includes(month) || high) {
    out.push({
      id: "heat-pump",
      kind: "alternative",
      title: "Replace oil, propane or electric baseboard heat with a heat pump",
      why: "Heat pumps move heat instead of making it, using a fraction of the energy of resistance heat, and they replace your air conditioner too.",
      how: "Mass Save offers large rebates for whole-home heat pumps, and some utilities have a lower winter electric rate for heat-pump homes. Weatherize first so a smaller system does the job.",
      link: { href: "https://www.masssave.com/", label: "Mass Save" },
    });
  }
  return out;
}
