import { useEffect, useMemo, useState, type ReactNode } from "react";

import { Callout, Card } from "../components/ui.tsx";
import { billMonth, daysBetween, parseBillText, type BillEvidence, type BillFields } from "../data/bill.ts";
import { compareBill, suggestionsFor, type BillInput, type Comparison, type Suggestion, type SuggestionKind } from "../data/billCompare.ts";
import { fmtCents, fmtNum, fmtPct, moneyDisplay, ymLabel } from "../data/format.ts";
import { consumptionStats, eia, recs, spans } from "../data/load.ts";
import { UTILITIES, type UtilityId } from "../data/model.ts";
import type { OcrProgress } from "../data/ocr.ts";

const REFERENCE = {
  typicalMonthlyKwh: consumptionStats.typicalAccount.monthlyKwh,
  typicalYear: 2025,
  seasonalShares: consumptionStats.seasonalShares,
  eia,
  recs,
  spans,
};

interface Form {
  utility: UtilityId | "";
  kwh: string;
  total: string;
  supply: string;
  month: string; // YYYY-MM
  days: string;
}

const EMPTY: Form = { utility: "", kwh: "", total: "", supply: "", month: "", days: "" };

function toForm(f: BillFields): Form {
  return {
    utility: f.utility ?? "",
    kwh: f.kwh !== null ? String(f.kwh) : "",
    total: f.totalDollars !== null ? f.totalDollars.toFixed(2) : "",
    supply: f.supplyCents !== null ? String(f.supplyCents) : "",
    month: billMonth(f.periodStart, f.periodEnd) ?? "",
    days: f.days !== null ? String(f.days) : f.periodStart && f.periodEnd ? String(daysBetween(f.periodStart, f.periodEnd)) : "",
  };
}

const num = (s: string): number => Number(s.replace(/[,$¢\s]/g, ""));

/** The form as a comparison input, or what is still missing. */
function toInput(f: Form): { input: BillInput } | { missing: string[] } {
  const missing: string[] = [];
  const kwh = num(f.kwh);
  if (!f.utility) missing.push("your utility");
  if (!(kwh > 0 && kwh < 20000)) missing.push("kWh used");
  if (!/^\d{4}-\d{2}$/.test(f.month)) missing.push("the bill month");
  if (missing.length) return { missing };
  const total = f.total.trim() ? num(f.total) : NaN;
  const supply = f.supply.trim() ? num(f.supply) : NaN;
  const days = f.days.trim() ? num(f.days) : NaN;
  return {
    input: {
      utility: f.utility as UtilityId,
      kwh,
      totalDollars: total > 0 && total < 10000 ? total : null,
      // Accept $/kWh (0.1893) as well as ¢/kWh (18.93).
      supplyCents: supply > 0 && supply < 1 ? supply * 100 : supply >= 1 && supply <= 80 ? supply : null,
      billYm: f.month,
      days: days >= 20 && days <= 40 ? days : null,
    },
  };
}

type Status = { kind: "idle" } | { kind: "reading"; progress: OcrProgress } | { kind: "read"; found: number; utility: boolean } | { kind: "error"; message: string };

export default function Bill() {
  const [form, setForm] = useState<Form>(EMPTY);
  const [evidence, setEvidence] = useState<BillEvidence>({});
  const [rawText, setRawText] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [dragging, setDragging] = useState(false);

  useEffect(() => () => (preview ? URL.revokeObjectURL(preview) : undefined), [preview]);

  function applyText(text: string) {
    setRawText(text);
    const parsed = parseBillText(text);
    setEvidence(parsed.evidence);
    setForm(toForm(parsed.fields));
    const found = [parsed.fields.utility, parsed.fields.kwh, parsed.fields.totalDollars, parsed.fields.supplyCents, parsed.fields.periodEnd ?? parsed.fields.days].filter(
      (v) => v !== null,
    ).length;
    setStatus({ kind: "read", found, utility: parsed.fields.utility !== null });
  }

  async function readFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setStatus({ kind: "error", message: "That file isn't a picture. For a PDF bill, copy its text and paste it below instead." });
      return;
    }
    setPreview(URL.createObjectURL(file));
    setStatus({ kind: "reading", progress: { fraction: 0, label: "Preparing the photo" } });
    try {
      const { readImageText } = await import("../data/ocr.ts");
      const text = await readImageText(file, (progress) => setStatus({ kind: "reading", progress }));
      applyText(text);
    } catch (e) {
      setStatus({ kind: "error", message: `Couldn't read the photo (${(e as Error).message}). Try a sharper, well-lit photo, or type the numbers in.` });
    }
  }

  const result = useMemo(() => {
    const parsed = toInput(form);
    if ("missing" in parsed) return parsed;
    try {
      const comparison = compareBill(parsed.input, REFERENCE);
      return { input: parsed.input, comparison, suggestions: suggestionsFor(parsed.input, comparison) };
    } catch (e) {
      return { missing: [(e as Error).message] };
    }
  }, [form]);

  const set = (key: keyof Form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const reading = status.kind === "reading";

  return (
    <>
      <header className="mission">
        <h1 className="mission-title">FairWatt helps Massachusetts households pay a fair price for electricity.</h1>
        <p className="mission-lede">
          Check your electric bill: add a photo to see how your use and costs compare with homes across the state, and what would lower
          them. The photo is read on your device and never uploaded.
        </p>
        <p className="mission-scope">
          <strong>Massachusetts bills only.</strong> Works for National Grid, Eversource and Unitil customers.
        </p>
      </header>

      <div className="grid">
        <Card className="span-5 align-start" title="Your bill" subtitle="A clear photo or screenshot of a Massachusetts electric bill, on the page with your usage and charges.">
          <label
            className={`dropzone${dragging ? " is-dragging" : ""}${reading ? " is-busy" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void readFile(e.dataTransfer.files[0]);
            }}
          >
            <input
              className="sr-only"
              type="file"
              accept="image/*"
              disabled={reading}
              onChange={(e) => {
                void readFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            {preview ? <img className="dropzone-preview" src={preview} alt="Your bill" /> : <BillGlyph />}
            <span className="dropzone-title">{preview ? "Choose a different photo" : "Choose a photo of your bill"}</span>
            <span className="dropzone-hint">or drag it here · JPG, PNG or a phone photo</span>
          </label>

          <div className="stack" style={{ marginTop: 14 }} aria-live="polite">
            {status.kind === "reading" ? (
              <div>
                <div className="progress-label">
                  <span>{status.progress.label}</span>
                  <span className="num">{fmtPct(status.progress.fraction)}</span>
                </div>
                <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(status.progress.fraction * 100)} aria-label="Reading your bill">
                  <span style={{ width: `${status.progress.fraction * 100}%` }} />
                </div>
                <p className="field-hint" style={{ marginTop: 6 }}>
                  The first read downloads the text reader (about 7 MB); after that it's quick.
                </p>
              </div>
            ) : status.kind === "read" ? (
              <p className="note">
                {status.found === 0 ? (
                  <>Couldn't find the numbers in that photo. Try one closer to the usage and charges section, or fill them in on the right.</>
                ) : (
                  <>
                    Found <strong>{status.found} of 5</strong> details. Check them on the right and fix anything that's off.
                    {!status.utility ? (
                      <>
                        {" "}
                        No Massachusetts utility was named on it: Bill check only works for National Grid, Eversource and Unitil bills.
                      </>
                    ) : null}
                  </>
                )}
              </p>
            ) : status.kind === "error" ? (
              <p className="error" role="alert">
                {status.message}
              </p>
            ) : null}

            <details className="disclosure">
              <summary>Have a PDF bill? Paste its text instead</summary>
              <textarea
                className="input textarea"
                rows={6}
                placeholder="Open the PDF, select all the text, copy it, and paste it here."
                defaultValue=""
                onChange={(e) => (e.target.value.trim().length > 20 ? applyText(e.target.value) : undefined)}
              />
            </details>
            {rawText && status.kind !== "reading" ? (
              <details className="disclosure">
                <summary>Show the text we read</summary>
                <pre className="code raw-text">{rawText.trim()}</pre>
              </details>
            ) : null}
          </div>
        </Card>

        <Card className="span-7 align-start" title="What we read" subtitle="Everything below can be edited. Utility, kWh and the bill month are enough to compare.">
          <div className="form-grid">
            <Field label="Utility" hint={evidence.utility} missing={status.kind === "read" && !form.utility}>
              <select className="select" value={form.utility} onChange={set("utility")}>
                <option value="">Choose…</option>
                {UTILITIES.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="kWh used" hint={evidence.kwh} missing={status.kind === "read" && !form.kwh}>
              <input className="input" inputMode="numeric" value={form.kwh} onChange={set("kwh")} placeholder="e.g. 610" />
            </Field>
            <Field label="Bill month" hint={evidence.periodEnd ?? evidence.days} missing={status.kind === "read" && !form.month}>
              <input className="input" type="month" value={form.month} onChange={set("month")} />
            </Field>
            <Field label="Total amount ($)" hint={evidence.totalDollars} optional>
              <input className="input" inputMode="decimal" value={form.total} onChange={set("total")} placeholder="e.g. 233.67" />
            </Field>
            <Field label="Supply rate (¢/kWh)" hint={evidence.supplyCents ?? "The “supply” or “generation” line"} optional>
              <input className="input" inputMode="decimal" value={form.supply} onChange={set("supply")} placeholder="e.g. 18.93" />
            </Field>
            <Field label="Days in billing period" hint={evidence.days} optional>
              <input className="input" inputMode="numeric" value={form.days} onChange={set("days")} placeholder="e.g. 30" />
            </Field>
          </div>
          {"missing" in result ? (
            <p className="field-hint" style={{ marginTop: 14 }}>
              Add {result.missing.length > 1 ? `${result.missing.slice(0, -1).join(", ")} and ${result.missing[result.missing.length - 1]}` : result.missing[0]} to
              see the comparison.
            </p>
          ) : null}
          <div style={{ marginTop: 16 }}>
            <Callout>
              Your use is compared with the typical Massachusetts home in the same month, and your supply rate with your utility's
              basic-service rate. Town-run electric companies (municipal light plants, such as Braintree or Concord) have no basic
              service, so only their usage comparison applies. The photo and the numbers stay in this browser.
            </Callout>
          </div>
        </Card>

        {"comparison" in result ? (
          <>
            <Results input={result.input} c={result.comparison} />
            <Suggestions items={result.suggestions} />
          </>
        ) : null}
      </div>
    </>
  );
}

function Field({ label, hint, optional, missing, children }: { label: string; hint?: string; optional?: boolean; missing?: boolean; children: ReactNode }) {
  return (
    <label className="field">
      <span>
        {label}
        {optional ? <span className="field-optional"> · optional</span> : null}
      </span>
      {children}
      {missing ? (
        <span className="field-hint field-missing">Not found on the photo; enter it from your bill.</span>
      ) : hint ? (
        <span className="field-hint evidence" title={hint}>
          {hint.startsWith("The ") ? hint : <>Read from “{hint}”</>}
        </span>
      ) : null}
    </label>
  );
}

// ----------------------------------------------------------------------------- comparison

function Results({ input, c }: { input: BillInput; c: Comparison }) {
  const utility = UTILITIES.find((u) => u.id === input.utility)!.name;
  const usageWord = c.usageRatio > 1.05 ? "more than" : c.usageRatio < 0.95 ? "less than" : "about the same as";
  const costDiff = c.yourMonthDollars !== null ? c.yourMonthDollars - c.typicalMonthDollars : null;
  const month = ymLabel(c.billYm);
  const priceMonth = c.avgPriceIsSameMonth ? month : `the 12 months to ${ymLabel(c.avgPriceYm)}`;

  return (
    <Card
      className="span-12"
      title="Your bill vs. Massachusetts homes"
      subtitle={`${month} · ${utility}${input.days ? ` · ${input.days}-day bill, scaled to an average month` : ""}`}
      source={
        <>
          Average account: EIA-861M statewide residential sales per account, {month.split(" ")[0]} {REFERENCE.typicalYear}. Average price: EIA all-in
          residential revenue ÷ sales, {priceMonth}. Share of homes: RECS 2020, Massachusetts, weighted. Basic service: Mass.gov fixed residential
          rate for {utility}. Usage is published statewide, not by town, so the area comparison is Massachusetts plus your utility's own rate.
        </>
      }
    >
      <p className="verdict">
        You used <strong>{usageWord}</strong> a typical Massachusetts home
        {costDiff !== null ? (
          <>
            {" "}
            and paid{" "}
            <strong style={{ color: costDiff > 1 ? "var(--bad-text)" : costDiff < -1 ? "var(--good-text)" : undefined }}>
              {Math.abs(costDiff) < 1 ? "about the same" : `${moneyDisplay(Math.abs(costDiff))} ${costDiff > 0 ? "more" : "less"}`}
            </strong>
          </>
        ) : null}
        . Over a year, you'd use more than {fmtPct(c.shareOfHomesBelow)} of homes in the state.
      </p>

      <div className="compare">
        <CompareRow label="Electricity used" you={c.monthKwh} avg={c.typicalKwh} format={(v) => `${fmtNum(v)} kWh`} avgLabel="Typical home" />
        {c.yourMonthDollars !== null ? (
          <CompareRow label="Cost for the month" you={c.yourMonthDollars} avg={c.typicalMonthDollars} format={(v) => moneyDisplay(v)} avgLabel="Typical home" />
        ) : null}
        {c.yourPriceCents !== null ? (
          <CompareRow label="All-in price per kWh" you={c.yourPriceCents} avg={c.avgPriceCents} format={(v) => fmtCents(v, 1)} avgLabel="State average" />
        ) : null}
        {input.supplyCents !== null && c.basicCents !== null ? (
          <CompareRow label="Supply rate per kWh" you={input.supplyCents} avg={c.basicCents} format={(v) => fmtCents(v, 2)} avgLabel="Basic service" />
        ) : null}
      </div>
      {c.yourMonthDollars === null || input.supplyCents === null ? (
        <p className="field-hint" style={{ marginTop: 12 }}>
          Add the {c.yourMonthDollars === null ? "total amount" : ""}
          {c.yourMonthDollars === null && input.supplyCents === null ? " and the " : ""}
          {input.supplyCents === null ? "supply rate" : ""} to compare cost{input.supplyCents === null ? " and your supply deal" : ""} too.
        </p>
      ) : null}
    </Card>
  );
}

function CompareRow({ label, you, avg, format, avgLabel }: { label: string; you: number; avg: number; format: (v: number) => string; avgLabel: string }) {
  const max = Math.max(you, avg) * 1.05 || 1;
  const diff = avg > 0 ? you / avg - 1 : 0;
  const tone = diff > 0.05 ? "delta-bad" : diff < -0.05 ? "delta-good" : "delta-flat";
  return (
    <div className="compare-row">
      <div className="compare-head">
        <span className="compare-label">{label}</span>
        <span className={`delta ${tone}`}>
          {Math.abs(diff) < 0.005 ? "Same as average" : `${fmtPct(Math.abs(diff))} ${diff > 0 ? "above" : "below"}`}
        </span>
      </div>
      <div className="compare-bar">
        <span className="compare-name">You</span>
        <span className="compare-track">
          <span className="compare-fill is-you" style={{ width: `${(you / max) * 100}%` }} />
        </span>
        <span className="compare-value num">{format(you)}</span>
      </div>
      <div className="compare-bar">
        <span className="compare-name">{avgLabel}</span>
        <span className="compare-track">
          <span className="compare-fill" style={{ width: `${(avg / max) * 100}%` }} />
        </span>
        <span className="compare-value num">{format(avg)}</span>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------- suggestions

const GROUPS: { kinds: SuggestionKind[]; title: string }[] = [
  { kinds: ["save", "good"], title: "Save without changing anything at home" },
  { kinds: ["use-less"], title: "Use less" },
  { kinds: ["alternative"], title: "Cleaner energy options" },
];

function Suggestions({ items }: { items: Suggestion[] }) {
  return (
    <Card
      className="span-12"
      title="What would lower your bill"
      subtitle="Picked for this bill, most money first. Figures are estimates from your bill and statewide averages."
    >
      <div className="suggestion-groups">
        {GROUPS.map((g) => {
          const list = items.filter((s) => g.kinds.includes(s.kind));
          if (!list.length) return null;
          return (
            <section key={g.title} className="suggestion-group" aria-label={g.title}>
              <h4 className="suggestion-group-title">{g.title}</h4>
              <ul className="suggestions">
                {list.map((s) => (
                  <li key={s.id} className={`suggestion is-${s.kind}`}>
                    <p className="suggestion-title">{s.title}</p>
                    <p className="suggestion-why">{s.why}</p>
                    <p className="suggestion-how">{s.how}</p>
                    {s.link ? (
                      <a className="suggestion-link" href={s.link.href} target="_blank" rel="noreferrer">
                        {s.link.label} ↗
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      <div style={{ marginTop: 16 }}>
        <Callout>
          FairWatt doesn't sell energy or get paid for referrals. Rebates, credits and program rules change; check the linked sites for what
          applies to you now.
        </Callout>
      </div>
    </Card>
  );
}

/** A simple drawing of a bill page for the empty upload area. */
function BillGlyph() {
  return (
    <svg className="dropzone-glyph" width="44" height="52" viewBox="0 0 44 52" aria-hidden="true">
      <rect x="1" y="1" width="42" height="50" rx="6" style={{ fill: "var(--surface)", stroke: "var(--baseline)" }} strokeWidth="2" />
      <rect x="9" y="11" width="16" height="4" rx="2" style={{ fill: "var(--accent)" }} />
      <rect x="9" y="21" width="26" height="3" rx="1.5" style={{ fill: "var(--baseline)" }} />
      <rect x="9" y="28" width="22" height="3" rx="1.5" style={{ fill: "var(--baseline)" }} />
      <rect x="9" y="35" width="26" height="3" rx="1.5" style={{ fill: "var(--baseline)" }} />
      <rect x="23" y="42" width="12" height="4" rx="2" style={{ fill: "var(--ink-2)" }} />
    </svg>
  );
}

