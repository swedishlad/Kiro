import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { PromptBox } from "../chat/Chat.tsx";
import { ColumnChart } from "../components/BarChart.tsx";
import { Callout, Card, ChartCard, Legend } from "../components/ui.tsx";
import { billMonth, daysBetween, inferBillMonth, parseBillText, type BillEvidence, type BillFields } from "../data/bill.ts";
import { buildReport, roughDollars, solarKw, type BillInput, type BillReport, type Suggestion, type SuggestionKind } from "../data/billCompare.ts";
import { MONTHS, dateLabel, fmtCents, fmtNum, fmtPct, moneyDisplay, ymIndex, ymLabel } from "../data/format.ts";
import { consumptionStats, eia, recs, spans } from "../data/load.ts";
import { UTILITIES, type UtilityId } from "../data/model.ts";
import { BILL_FILE_TYPES, isBillFile, readBillFiles, type BillPreview, type ReadProgress } from "../data/readBill.ts";

const REFERENCE = {
  typicalMonthlyKwh: consumptionStats.typicalAccount.monthlyKwh,
  typicalYear: 2025,
  seasonalShares: consumptionStats.seasonalShares,
  eia,
  recs,
  spans,
};

/** A town-run light plant, or any utility without basic service: usage and cost only. */
const OTHER = "OTHER";

interface Form {
  utility: UtilityId | typeof OTHER | "";
  kwh: string;
  total: string;
  supply: string;
  month: string; // YYYY-MM
  days: string;
}

const EMPTY: Form = { utility: "", kwh: "", total: "", supply: "", month: "", days: "" };

/** What was read beyond the editable fields: section totals, and how the month was dated. */
interface Extras {
  supplyDollars: number | null;
  deliveryDollars: number | null;
  monthFrom: "period" | "statement" | null;
  period: { start: string; end: string } | null;
}

const NO_EXTRAS: Extras = { supplyDollars: null, deliveryDollars: null, monthFrom: null, period: null };

function toForm(f: BillFields): Form {
  return {
    utility: f.utility ?? "",
    kwh: f.kwh !== null ? String(f.kwh) : "",
    total: f.totalDollars !== null ? f.totalDollars.toFixed(2) : "",
    supply: f.supplyCents !== null ? String(f.supplyCents) : "",
    month: inferBillMonth(f)?.ym ?? "",
    days: f.days !== null ? String(f.days) : f.periodStart && f.periodEnd ? String(daysBetween(f.periodStart, f.periodEnd)) : "",
  };
}

const num = (s: string): number => Number(s.replace(/[,$¢\s]/g, ""));

/** The form as a comparison input, or what is still missing. kWh and the month are enough. */
function toInput(f: Form, extras: Extras): { input: BillInput } | { missing: string[] } {
  const missing: string[] = [];
  const kwh = num(f.kwh);
  if (!(kwh > 0 && kwh < 20000)) missing.push("kWh used");
  if (!/^\d{4}-\d{2}$/.test(f.month)) missing.push("the bill month");
  if (missing.length) return { missing };
  const total = f.total.trim() ? num(f.total) : NaN;
  const supply = f.supply.trim() ? num(f.supply) : NaN;
  const days = f.days.trim() ? num(f.days) : NaN;
  return {
    input: {
      utility: f.utility && f.utility !== OTHER ? f.utility : null,
      kwh,
      totalDollars: total > 0 && total < 10000 ? total : null,
      // Accept $/kWh (0.1893) as well as ¢/kWh (18.93).
      supplyCents: supply > 0 && supply < 1 ? supply * 100 : supply >= 1 && supply <= 80 ? supply : null,
      billYm: f.month,
      days: days >= 20 && days <= 40 ? days : null,
      supplyDollars: extras.supplyDollars,
      deliveryDollars: extras.deliveryDollars,
    },
  };
}

const listJoin = (items: string[]): string => (items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}` : items[0]);

interface Source {
  how: "file" | "text" | "typed";
  names: string[];
  previews: BillPreview[];
  pages: number;
  usedOcr: boolean;
  /** Of the five details a bill should give: utility, kWh, total, supply rate, month */
  found: number;
}

type Phase = { kind: "idle" } | { kind: "reading"; progress: ReadProgress; names: string[] } | { kind: "ready"; source: Source } | { kind: "error"; message: string };

const editable = (t: EventTarget | null): boolean => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

export default function Bill() {
  const [form, setForm] = useState<Form>(EMPTY);
  const [extras, setExtras] = useState<Extras>(NO_EXTRAS);
  const [evidence, setEvidence] = useState<BillEvidence>({});
  const [rawText, setRawText] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [dragging, setDragging] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [scrollTick, setScrollTick] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const busy = phase.kind === "reading";

  const previews = phase.kind === "ready" ? phase.source.previews : null;
  useEffect(() => () => previews?.forEach((p) => p.url.startsWith("blob:") && URL.revokeObjectURL(p.url)), [previews]);

  // Bring the finished report into view (under the sticky bar) once a bill has been read.
  useEffect(() => {
    if (scrollTick) document.getElementById("bill-report")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [scrollTick]);

  function apply(text: string, source: Omit<Source, "found">) {
    const parsed = parseBillText(text);
    const f = parsed.fields;
    const inferred = inferBillMonth(f);
    setRawText(text);
    setEvidence(parsed.evidence);
    setForm(toForm(f));
    setExtras({
      supplyDollars: f.supplyDollars,
      deliveryDollars: f.deliveryDollars,
      monthFrom: inferred?.from ?? null,
      period: f.periodStart && f.periodEnd ? { start: f.periodStart, end: f.periodEnd } : null,
    });
    const found = [f.utility, f.kwh, f.totalDollars, f.supplyCents, inferred].filter((v) => v !== null).length;
    setPhase({ kind: "ready", source: { ...source, found } });
    setScrollTick((t) => t + 1);
  }

  async function readFiles(files: File[]) {
    if (busy || !files.length) return;
    const names = files.map((f) => f.name || "Pasted image");
    setPasting(false);
    setPhase({ kind: "reading", names, progress: { fraction: 0, label: "Opening your bill" } });
    try {
      const read = await readBillFiles(files, (progress) => setPhase({ kind: "reading", names, progress }));
      apply(read.text, { how: "file", names, previews: read.previews, pages: read.pages, usedOcr: read.usedOcr });
    } catch (e) {
      const message = (e as Error).message;
      setPhase({
        kind: "error",
        message: /password/i.test(message)
          ? "That PDF is password-protected. Open it, take a screenshot of the page with your usage and charges, and add that instead."
          : /photo or a PDF/.test(message)
            ? message
            : `Couldn't read that bill (${message}). Try a sharper, well-lit photo, the bill's PDF, or type the numbers in.`,
      });
    }
  }

  function clear(next: Phase) {
    setRawText("");
    setEvidence({});
    setForm(EMPTY);
    setExtras(NO_EXTRAS);
    setPhase(next);
  }

  function typeNumbers() {
    clear({ kind: "ready", source: { how: "typed", names: [], previews: [], pages: 0, usedOcr: false, found: 0 } });
    setScrollTick((t) => t + 1);
  }

  function startOver() {
    clear({ kind: "idle" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Drop a bill anywhere on the page, or paste a screenshot (or a PDF's copied text) with ⌘V / Ctrl+V.
  const handlers = useRef({ readFiles, apply });
  handlers.current = { readFiles, apply };
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth += 1;
      setDragging(true);
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      void handlers.current.readFiles(Array.from(e.dataTransfer?.files ?? []));
    };
    const paste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []).filter(isBillFile);
      if (files.length) {
        e.preventDefault();
        void handlers.current.readFiles(files);
        return;
      }
      const text = e.clipboardData?.getData("text") ?? "";
      if (!editable(e.target) && text.trim().length > 40 && /k\s?wh/i.test(text)) {
        e.preventDefault();
        handlers.current.apply(text, { how: "text", names: [], previews: [], pages: 0, usedOcr: false });
      }
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    window.addEventListener("paste", paste);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
      window.removeEventListener("paste", paste);
    };
  }, []);

  const result = useMemo(() => {
    const parsed = toInput(form, extras);
    if ("missing" in parsed) return parsed;
    try {
      return { input: parsed.input, report: buildReport(parsed.input, REFERENCE) };
    } catch (e) {
      return { missing: [(e as Error).message] };
    }
  }, [form, extras]);

  const set = (key: keyof Form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <>
      <header className="mission no-print">
        <h1 className="mission-title">Watt-if you paid a fair price for every watt?</h1>
        <p className="mission-lede">
          Add your electric bill (a photo, a screenshot or the PDF) and get a full report: how your use and costs compare with homes across
          the state, what the year looks like, and what would lower your bill. It's read on your device and never uploaded.
        </p>
        <p className="mission-scope">
          <strong>Massachusetts bills only.</strong> Works for National Grid, Eversource and Unitil customers.
        </p>
        <PromptBox />
      </header>

      <input
        ref={fileInput}
        id="bill-file"
        className="sr-only"
        type="file"
        accept={BILL_FILE_TYPES}
        multiple
        disabled={busy}
        tabIndex={phase.kind === "ready" ? -1 : undefined}
        onChange={(e) => {
          void readFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
      {dragging ? (
        <div className="drop-overlay" aria-hidden="true">
          <span>Drop your bill to check it</span>
        </div>
      ) : null}
      <p className="sr-only" aria-live="polite">
        {phase.kind === "ready" && "report" in result ? "Your bill report is ready." : ""}
      </p>

      <div className="grid">
        {phase.kind !== "ready" ? (
          <section className="card span-12 upload no-print" aria-label="Add your bill">
            {phase.kind === "reading" ? (
              <div className="reading" aria-live="polite">
                <BillGlyph />
                <p className="reading-title">{phase.progress.label}</p>
                <div
                  className="progress"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(phase.progress.fraction * 100)}
                  aria-label="Reading your bill"
                >
                  <span style={{ width: `${phase.progress.fraction * 100}%` }} />
                </div>
                <p className="field-hint">
                  {phase.names.join(", ")}
                  {/first time/.test(phase.progress.label) ? " · The text reader (about 7 MB) downloads once; after that it's quick." : ""}
                </p>
              </div>
            ) : (
              <label htmlFor="bill-file" className={`dropzone dropzone-lg${dragging ? " is-dragging" : ""}`}>
                <BillGlyph />
                <span className="dropzone-title">Choose your bill</span>
                <span className="dropzone-hint">or drop it here · a photo, screenshot or PDF · add every page at once</span>
                <span className="dropzone-hint">You can also paste a screenshot with ⌘V / Ctrl+V</span>
              </label>
            )}

            {phase.kind === "error" ? (
              <p className="error" role="alert" style={{ marginTop: 14 }}>
                {phase.message}
              </p>
            ) : null}

            <ol className="upload-steps">
              <li>
                <span className="upload-step">1</span>Add your bill
              </li>
              <li>
                <span className="upload-step">2</span>It's read on this device
              </li>
              <li>
                <span className="upload-step">3</span>Your report appears here
              </li>
            </ol>

            {phase.kind !== "reading" ? (
              <div className="upload-alt">
                <button type="button" className="link-button" aria-expanded={pasting} onClick={() => setPasting((p) => !p)}>
                  Paste the bill's text
                </button>
                <span aria-hidden="true">·</span>
                <button type="button" className="link-button" onClick={typeNumbers}>
                  Type the numbers instead
                </button>
              </div>
            ) : null}
            {pasting && phase.kind !== "reading" ? <PasteText onText={(text) => apply(text, { how: "text", names: [], previews: [], pages: 0, usedOcr: false })} /> : null}
          </section>
        ) : null}

        {phase.kind === "ready" ? (
          "report" in result ? (
            <>
              <Summary
                input={result.input}
                r={result.report}
                source={phase.source}
                extras={extras}
                utilityChosen={form.utility !== ""}
                onAnother={() => fileInput.current?.click()}
                onStartOver={startOver}
              />
              <Year input={result.input} r={result.report} />
              <YearNumbers input={result.input} r={result.report} />
              <Suggestions items={result.report.suggestions} />
            </>
          ) : (
            <Card
              id="bill-report"
              className="span-12 report-anchor"
              title={phase.source.how === "typed" ? "Enter your bill's numbers" : `Almost there: add ${listJoin(result.missing)}`}
              subtitle={
                phase.source.how === "typed"
                  ? "kWh used and the bill month are enough for a report; the total and supply rate add the cost comparison."
                  : `We read your bill but couldn't find ${listJoin(result.missing)}. Enter ${result.missing.length > 1 ? "them" : "it"} below from your bill and the report appears.`
              }
            >
              <SourceBar source={phase.source} onAnother={() => fileInput.current?.click()} onStartOver={startOver} />
            </Card>
          )
        ) : null}

        {phase.kind === "ready" ? (
          <Details form={form} set={set} evidence={evidence} extras={extras} source={phase.source} rawText={rawText} complete={"report" in result} />
        ) : null}
      </div>
    </>
  );
}

function PasteText({ onText }: { onText: (text: string) => void }) {
  const [text, setText] = useState("");
  const ready = text.trim().length > 20;
  return (
    <div className="stack" style={{ marginTop: 12 }}>
      <textarea
        className="input textarea"
        rows={6}
        autoFocus
        placeholder="Open the PDF, select all the text, copy it, and paste it here."
        value={text}
        onChange={(e) => setText(e.target.value)}
        onPaste={(e) => {
          const pasted = e.clipboardData.getData("text");
          if (pasted.trim().length > 20) {
            e.preventDefault();
            onText(pasted);
          }
        }}
      />
      <div>
        <button type="button" className="btn btn-primary" disabled={!ready} onClick={() => onText(text)}>
          Make my report
        </button>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------- report

function SourceBar({ source, onAnother, onStartOver }: { source: Source; onAnother: () => void; onStartOver: () => void }) {
  const what =
    source.how === "file"
      ? `Read on this device from ${source.names[0]}${source.names.length > 1 ? ` and ${source.names.length - 1} more` : ""}${source.pages > 1 ? ` (${source.pages} pages)` : ""}`
      : source.how === "text"
        ? "Read from the text you pasted"
        : "From the numbers you entered";
  return (
    <div className="bill-source">
      {source.previews.length ? (
        <span className="bill-thumbs">
          {source.previews.map((p) => (
            <img key={p.url} className="bill-thumb" src={p.url} alt={`Your bill: ${p.name}`} />
          ))}
        </span>
      ) : null}
      <span className="bill-source-text">
        {what}
        {source.how !== "typed" ? (
          <>
            {" "}
            · found <strong>{source.found} of 5</strong> details
            {source.usedOcr ? " · photos can be misread, so check the details below" : ""}
          </>
        ) : null}
      </span>
      <span className="bill-source-actions no-print">
        <button type="button" className="btn" onClick={onAnother}>
          Check another bill
        </button>
        <button type="button" className="link-button" onClick={onStartOver}>
          Start over
        </button>
      </span>
    </div>
  );
}

function Summary({
  input,
  r,
  source,
  extras,
  utilityChosen,
  onAnother,
  onStartOver,
}: {
  input: BillInput;
  r: BillReport;
  source: Source;
  extras: Extras;
  utilityChosen: boolean;
  onAnother: () => void;
  onStartOver: () => void;
}) {
  const c = r.comparison;
  const utility = input.utility ? UTILITIES.find((u) => u.id === input.utility)!.name : null;
  const usageWord = c.usageRatio > 1.05 ? "more than" : c.usageRatio < 0.95 ? "less than" : "about the same as";
  const costDiff = c.yourMonthDollars !== null ? c.yourMonthDollars - c.typicalMonthDollars : null;
  const month = ymLabel(c.billYm);
  const priceMonth = c.avgPriceIsSameMonth ? month : `the 12 months to ${ymLabel(c.avgPriceYm)}`;
  const facts = [
    utility ?? (utilityChosen ? "Town-run or other utility" : null),
    `${fmtNum(input.kwh)} kWh`,
    extras.period && billMonth(extras.period.start, extras.period.end) === c.billYm ? `${dateLabel(extras.period.start)} – ${dateLabel(extras.period.end)}` : month,
    input.totalDollars !== null ? `${moneyDisplay(input.totalDollars)} total` : null,
    input.supplyCents !== null ? `supply ${fmtCents(input.supplyCents, 2)}/kWh` : null,
  ].filter((f): f is string => f !== null);
  const needs: { field: string; gives: string }[] = [];
  if (c.yourMonthDollars === null) needs.push({ field: "the total amount", gives: "your cost" });
  if (!utilityChosen) needs.push({ field: "your utility", gives: "your supply rate with basic service" });
  else if (input.utility && input.supplyCents === null) needs.push({ field: "the supply rate", gives: "your supply deal with basic service" });

  return (
    <section className="card span-12 report-anchor" id="bill-report" aria-labelledby="bill-report-title">
      <p className="print-only report-print-head">Watt-If? · Massachusetts electric bill check · {dateLabel(new Date().toISOString().slice(0, 10))}</p>
      <div className="card-head">
        <div>
          <h2 className="report-title" id="bill-report-title">
            Your bill report
          </h2>
          <p className="card-sub">
            {month}
            {utility ? ` · ${utility}` : ""}
            {input.days ? ` · ${input.days}-day bill, scaled to an average month` : ""}
          </p>
        </div>
        <div className="card-actions no-print">
          <button type="button" className="btn btn-primary" onClick={() => window.print()}>
            Save as PDF
          </button>
        </div>
      </div>

      <SourceBar source={source} onAnother={onAnother} onStartOver={onStartOver} />
      <ul className="bill-facts" aria-label="Read from your bill">
        {facts.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>

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
        {c.supplyGapYearDollars !== null && Math.abs(c.supplyGapYearDollars) >= 10 ? (
          <>
            {" "}
            Your supply rate {c.supplyGapYearDollars > 0 ? "costs" : "saves"} you about{" "}
            <strong style={{ color: c.supplyGapYearDollars > 0 ? "var(--bad-text)" : "var(--good-text)" }}>{roughDollars(c.supplyGapYearDollars)} a year</strong>{" "}
            against basic service.
          </>
        ) : null}
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
      {needs.length ? (
        <p className="field-hint no-print" style={{ marginTop: 12 }}>
          Add {listJoin(needs.map((n) => n.field))} in{" "}
          <button type="button" className="link-button" onClick={() => document.getElementById("bill-details")?.scrollIntoView({ behavior: "smooth" })}>
            the details
          </button>{" "}
          to compare {listJoin(needs.map((n) => n.gives))} too.
        </p>
      ) : null}
      <p className="card-foot">
        Average account: EIA-861M statewide residential sales per account, {MONTHS[ymIndex(c.billYm) % 12]} {REFERENCE.typicalYear}. Average price: EIA
        all-in residential revenue ÷ sales, {priceMonth}. Share of homes: RECS 2020, Massachusetts, weighted.
        {utility ? ` Basic service: Mass.gov fixed residential rate for ${utility}.` : ""} Usage is published statewide, not by town, so the area
        comparison is Massachusetts{utility ? " plus your utility's own rate" : ""}.
      </p>
    </section>
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

/** Each month of the year at this home: the bill's own month, the rest carried by the statewide seasonal pattern. */
function Year({ input, r }: { input: BillInput; r: BillReport }) {
  const c = r.comparison;
  const billIdx = ymIndex(c.billYm) % 12;
  const priceCents = c.yourPriceCents ?? c.avgPriceCents;
  const values = r.year.map((m) => m.yourKwh);
  const color = (i: number) => (i === billIdx ? "var(--series-1)" : "var(--muted-series)");
  const peak = values.indexOf(Math.max(...values));
  return (
    <ChartCard
      className="span-8"
      title="Your year, estimated from this bill"
      subtitle={`${MONTHS[billIdx]} is your bill; the other months follow how Massachusetts homes' use rises and falls through the year. Expect your biggest bill around ${MONTHS[peak]}, about ${roughDollars((values[peak] * priceCents) / 100)}.`}
      source={`Seasonal pattern: EIA-861M statewide residential sales by month. Dollars at ${input.totalDollars !== null ? "this bill's" : "the state's average"} all-in price of ${fmtCents(priceCents, 1)}/kWh; rate changes are not included.`}
      table={{
        columns: [
          { key: "m", label: "Month", render: (m) => `${MONTHS[m.month - 1]}${m.month - 1 === billIdx ? " (your bill)" : ""}` },
          { key: "y", label: "Your home, kWh", align: "r", render: (m) => fmtNum(m.yourKwh) },
          { key: "d", label: "Your home, $", align: "r", render: (m) => roughDollars((m.yourKwh * priceCents) / 100) },
          { key: "t", label: "Typical home, kWh", align: "r", render: (m) => fmtNum(m.typicalKwh) },
        ],
        rows: r.year,
      }}
    >
      <Legend
        items={[
          { label: "Your bill", color: "var(--series-1)", key: "rect" },
          { label: "Estimated", color: "var(--muted-series)", key: "rect" },
        ]}
      />
      <ColumnChart
        categories={MONTHS}
        values={values}
        colorFor={color}
        yFormat={(v) => fmtNum(v)}
        valueFormat={(v) => `${fmtNum(v)} kWh`}
        labelled={[billIdx]}
        titleFor={(i) => `${MONTHS[i]}${i === billIdx ? " · your bill" : " · estimated"}`}
        rowsFor={(i) => [
          { key: "rect", color: color(i), value: `${fmtNum(values[i])} kWh`, label: "Your home" },
          { key: "rect", color: "var(--ink-2)", value: `${fmtNum(r.year[i].typicalKwh)} kWh`, label: "Typical home" },
          { value: `≈ ${roughDollars((values[i] * priceCents) / 100)}`, label: "your cost" },
        ]}
        height={240}
        ariaLabel="Your estimated electricity use for each month of the year"
      />
    </ChartCard>
  );
}

const SECTION_COLORS = { supply: "var(--series-1)", delivery: "var(--series-3)", other: "var(--muted-series)" };

function YearNumbers({ input, r }: { input: BillInput; r: BillReport }) {
  const c = r.comparison;
  const kw = solarKw(c.annualKwh);
  const b = r.breakdown;
  const sum = b ? b.supply + b.delivery + b.other : 0;
  const parts = b
    ? ([
        ["supply", "Supply", b.supply],
        ["delivery", "Delivery", b.delivery],
        ["other", "Other items", b.other],
      ] as const).filter(([, , v]) => v > 0)
    : [];
  return (
    <Card className="span-4" title="A year at this rate" subtitle="This bill carried across twelve months.">
      <dl className="kv">
        <dt>Electricity</dt>
        <dd>≈ {fmtNum(c.annualKwh)} kWh</dd>
        <dt>Cost</dt>
        <dd>
          ≈ {roughDollars(r.annualDollars)}
          <span className="kv-note">{r.annualPriceIsYours ? "at this bill's price" : "at the state's average price"}</span>
        </dd>
        <dt>Homes that use less</dt>
        <dd>{fmtPct(c.shareOfHomesBelow)}</dd>
        {c.supplyGapYearDollars !== null ? (
          <>
            <dt>Supply vs basic service</dt>
            <dd style={{ color: c.supplyGapYearDollars > 5 ? "var(--bad-text)" : c.supplyGapYearDollars < -5 ? "var(--good-text)" : undefined }}>
              {Math.abs(c.supplyGapYearDollars) < 5 ? "About the same" : `${c.supplyGapYearDollars > 0 ? "+" : "−"}${roughDollars(c.supplyGapYearDollars)} a year`}
            </dd>
          </>
        ) : null}
        <dt>Solar to cover it</dt>
        <dd>≈ {fmtNum(kw, 1)} kW of panels</dd>
      </dl>
      {b ? (
        <div className="bill-split">
          <p className="bill-split-title">Where this bill's money goes</p>
          <div
            className="bill-split-bar"
            role="img"
            aria-label={parts.map(([, label, v]) => `${label} ${moneyDisplay(v)}`).join(", ")}
          >
            {parts.map(([key, , v]) => (
              <span key={key} style={{ width: `${(v / sum) * 100}%`, background: SECTION_COLORS[key] }} />
            ))}
          </div>
          <ul className="bill-split-legend">
            {parts.map(([key, label, v]) => (
              <li key={key}>
                <span className="key-rect" style={{ background: SECTION_COLORS[key] }} />
                {label} <strong className="num">{moneyDisplay(v)}</strong> <span className="num">{fmtPct(v / sum)}</span>
              </li>
            ))}
          </ul>
          <p className="field-hint">
            Supply is the electricity itself{input.utility ? ", the part you can shop for" : ""}; delivery is{" "}
            {input.utility ? UTILITIES.find((u) => u.id === input.utility)!.name : "your utility"}'s wires and meter, the same whoever supplies you.
          </p>
        </div>
      ) : null}
    </Card>
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
                    <p className="suggestion-title">
                      {s.title}
                      {s.estimate ? <span className="suggestion-estimate">{s.estimate}</span> : null}
                    </p>
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
          Watt If doesn't sell energy or get paid for referrals. Rebates, credits and program rules change; check the linked sites for what
          applies to you now.
        </Callout>
      </div>
    </Card>
  );
}

// ----------------------------------------------------------------------------- details

function Details({
  form,
  set,
  evidence,
  extras,
  source,
  rawText,
  complete,
}: {
  form: Form;
  set: (key: keyof Form) => (e: { target: { value: string } }) => void;
  evidence: BillEvidence;
  extras: Extras;
  source: Source;
  rawText: string;
  complete: boolean;
}) {
  const read = source.how !== "typed";
  const monthNote = extras.monthFrom === "statement" && evidence.statementDate ? `Estimated from the statement date (“${evidence.statementDate}”)` : undefined;
  return (
    <Card
      id="bill-details"
      className="span-12 report-anchor no-print"
      title={complete ? "What we read from your bill" : "Your bill's details"}
      subtitle={complete ? "Change anything that's off and the report updates." : "Utility, total and supply rate are optional but add the cost comparison."}
    >
      <div className="form-grid">
        <Field label="Utility" evidence={evidence.utility} note={read && !form.utility ? "Not named on your bill; pick it to compare your supply rate." : undefined} optional>
          <select className="select" value={form.utility} onChange={set("utility")}>
            <option value="">Choose…</option>
            {UTILITIES.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
            <option value={OTHER}>Town-run light plant / other</option>
          </select>
        </Field>
        <Field label="kWh used" evidence={evidence.kwh} missing={read && !form.kwh ? "Not found on your bill; enter it from your bill." : undefined}>
          <input className="input" inputMode="numeric" value={form.kwh} onChange={set("kwh")} placeholder="e.g. 610" />
        </Field>
        <Field label="Bill month" evidence={monthNote ? undefined : (evidence.periodEnd ?? evidence.days)} note={monthNote} missing={read && !form.month ? "Not found on your bill; enter it from your bill." : undefined}>
          <input className="input" type="month" value={form.month} onChange={set("month")} />
        </Field>
        <Field label="Total amount ($)" evidence={evidence.totalDollars} optional>
          <input className="input" inputMode="decimal" value={form.total} onChange={set("total")} placeholder="e.g. 233.67" />
        </Field>
        <Field label="Supply rate (¢/kWh)" evidence={evidence.supplyCents} note="The “supply” or “generation” line" optional>
          <input className="input" inputMode="decimal" value={form.supply} onChange={set("supply")} placeholder="e.g. 18.93" />
        </Field>
        <Field label="Days in billing period" evidence={evidence.days} optional>
          <input className="input" inputMode="numeric" value={form.days} onChange={set("days")} placeholder="e.g. 30" />
        </Field>
      </div>
      {rawText ? (
        <details className="disclosure" style={{ marginTop: 16 }}>
          <summary>Show the text we read</summary>
          <pre className="code raw-text">{rawText.trim()}</pre>
        </details>
      ) : null}
      <div style={{ marginTop: 16 }}>
        <Callout>
          Your use is compared with the typical Massachusetts home in the same month, and your supply rate with your utility's basic-service
          rate. Town-run electric companies (municipal light plants, such as Braintree or Concord) have no basic service, so only their usage and
          cost comparison applies. The bill and the numbers stay in this browser.
        </Callout>
      </div>
    </Card>
  );
}

/** A form field with where its value was read from (evidence), a plain note, or what is missing. */
function Field({
  label,
  evidence,
  note,
  optional,
  missing,
  children,
}: {
  label: string;
  evidence?: string;
  note?: string;
  optional?: boolean;
  missing?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>
        {label}
        {optional ? <span className="field-optional"> · optional</span> : null}
      </span>
      {children}
      {missing ? (
        <span className="field-hint field-missing">{missing}</span>
      ) : evidence ? (
        <span className="field-hint evidence" title={evidence}>
          Read from “{evidence}”
        </span>
      ) : note ? (
        <span className="field-hint">{note}</span>
      ) : null}
    </label>
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
