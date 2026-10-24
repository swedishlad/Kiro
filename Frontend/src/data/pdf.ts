// PDF bills, read in the browser with PDF.js. Utility e-bills carry a text layer, which is read
// directly (instant and exact); a scanned PDF has none, so its pages are drawn on a canvas for the
// OCR reader instead. PDF.js and its worker, fonts and decoders are served from this site
// (public/pdf/, copied by scripts/copy-reader-assets.mjs): the file never leaves the browser.

export interface PdfTextRun {
  str: string;
  /** Baseline origin in PDF units (y grows upward) */
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Rebuilds a page's text as lines in reading order from PDF.js's positioned runs: runs whose
 * baselines are within half a line of each other share a line, left to right, so a label and the
 * amount printed beside it ("Amount Due ....... $233.67") end up on one line, as OCR would read them.
 */
export function textLines(runs: PdfTextRun[]): string {
  const sorted = runs.filter((r) => r.str.trim() !== "").sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: { y: number; h: number; runs: PdfTextRun[] }[] = [];
  for (const r of sorted) {
    const h = r.height > 0 ? r.height : 10;
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - r.y) <= Math.max(1, Math.min(last.h, h) * 0.5)) last.runs.push(r);
    else lines.push({ y: r.y, h, runs: [r] });
  }
  return lines
    .map((line) => {
      const ordered = line.runs.sort((a, b) => a.x - b.x);
      let out = "";
      let end = -Infinity;
      for (const r of ordered) {
        // Runs that touch continue a word; a visible gap is a space.
        if (out && r.x - end > line.h * 0.15 && !out.endsWith(" ") && !r.str.startsWith(" ")) out += " ";
        out += r.str;
        end = r.x + r.width;
      }
      return out.replace(/\s+/g, " ").trim();
    })
    .join("\n");
}

export interface PdfDoc {
  pageCount: number;
  /** Page n's text (1-based), in reading order; empty or nearly so for a scanned page. */
  text(n: number): Promise<string>;
  /** Page n drawn on a white canvas whose long side is about `side` pixels. */
  render(n: number, side: number): Promise<HTMLCanvasElement>;
  close(): Promise<void>;
}

export class PdfPasswordError extends Error {}

export async function openPdf(file: File): Promise<PdfDoc> {
  const pdfjs = await import("pdfjs-dist");
  const base = new URL("pdf/", document.baseURI).href;
  pdfjs.GlobalWorkerOptions.workerSrc = `${base}pdf.worker.min.mjs`;
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    cMapUrl: `${base}cmaps/`,
    standardFontDataUrl: `${base}standard_fonts/`,
    wasmUrl: `${base}wasm/`,
    iccUrl: `${base}iccs/`,
  });
  let doc: Awaited<typeof task.promise>;
  try {
    doc = await task.promise;
  } catch (e) {
    await task.destroy();
    if ((e as Error).name === "PasswordException") throw new PdfPasswordError("This PDF is password-protected.");
    throw e;
  }
  return {
    pageCount: doc.numPages,
    async text(n) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const runs: PdfTextRun[] = [];
      for (const item of content.items) {
        if (!("str" in item)) continue;
        runs.push({ str: item.str, x: item.transform[4], y: item.transform[5], width: item.width, height: item.height });
      }
      return textLines(runs);
    },
    async render(n, side) {
      const page = await doc.getPage(n);
      const unit = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: side / Math.max(unit.width, unit.height) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, viewport, background: "#fff" }).promise;
      return canvas;
    },
    close: () => task.destroy(),
  };
}
