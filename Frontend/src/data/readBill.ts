// Reads a bill from whatever the visitor adds (photos, screenshots, a PDF, several pages at once)
// into one text for the parser. A PDF's text layer is read directly; photos and scanned PDF pages
// go through the OCR reader, which is loaded only when one of them needs it. Nothing is uploaded.

import type { OcrProgress, OcrReader } from "./ocr.ts";
import type { PdfDoc } from "./pdf.ts";

export interface ReadProgress {
  /** 0..1 across every page */
  fraction: number;
  label: string;
}

export interface BillPreview {
  name: string;
  /** An object URL for a photo (revoke it when done) or a data URL of a PDF's first page */
  url: string;
  pages: number;
}

export interface ReadResult {
  text: string;
  /** Pages read: one per photo, plus each PDF page */
  pages: number;
  /** Whether any page had to be read from an image */
  usedOcr: boolean;
  previews: BillPreview[];
}

/** For the file picker */
export const BILL_FILE_TYPES = "image/*,application/pdf,.pdf";

export const isPdf = (f: File): boolean => f.type === "application/pdf" || /\.pdf$/i.test(f.name);
export const isBillFile = (f: File): boolean => isPdf(f) || f.type.startsWith("image/");

/** A PDF page with less text than this is a scan (or a cover with no numbers) and is read as an image. */
const MIN_PAGE_TEXT = 40;
/** Bills run a few pages; inserts and newsletters after these are skipped. */
const MAX_PDF_PAGES = 8;
/** Long side of a scanned page drawn for OCR, in pixels */
const SCAN_SIDE = 2400;

type Job = { kind: "image"; file: File } | { kind: "pdf-page"; doc: PdfDoc; page: number };

export async function readBillFiles(files: File[], onProgress: (p: ReadProgress) => void): Promise<ReadResult> {
  const usable = files.filter(isBillFile);
  if (!usable.length) throw new Error("That isn't a photo or a PDF. Add a picture of your bill (JPG, PNG, a phone photo or a screenshot) or the bill's PDF.");

  onProgress({ fraction: 0, label: "Opening your bill" });
  const jobs: Job[] = [];
  const docs: PdfDoc[] = [];
  const previews: BillPreview[] = [];
  let ocr: OcrReader | null = null;
  try {
    for (const file of usable) {
      if (isPdf(file)) {
        const { openPdf } = await import("./pdf.ts");
        const doc = await openPdf(file);
        docs.push(doc);
        const pages = Math.min(doc.pageCount, MAX_PDF_PAGES);
        for (let page = 1; page <= pages; page++) jobs.push({ kind: "pdf-page", doc, page });
        const thumb = await doc.render(1, 360);
        previews.push({ name: file.name, url: thumb.toDataURL("image/jpeg", 0.8), pages: doc.pageCount });
      } else {
        jobs.push({ kind: "image", file });
        previews.push({ name: file.name, url: URL.createObjectURL(file), pages: 1 });
      }
    }

    const texts: string[] = [];
    let usedOcr = false;
    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      const label = `Reading ${jobs.length > 1 ? `page ${i + 1} of ${jobs.length}` : "your bill"}`;
      const at = (within: number) => (i + within) / jobs.length;
      onProgress({ fraction: at(0), label });
      if (job.kind === "pdf-page") {
        const text = await job.doc.text(job.page);
        if (text.replace(/\s/g, "").length >= MIN_PAGE_TEXT) {
          texts.push(text);
          continue;
        }
      }
      // A photo, or a PDF page without a text layer: read it as an image. The first one also loads
      // the reader, which takes the first part of its share of the bar.
      let loading = 0;
      if (!ocr) {
        loading = 0.4;
        const { openOcr } = await import("./ocr.ts");
        ocr = await openOcr((p) => onProgress({ fraction: at(loading * p.fraction), label: `${p.label} (first time only)` }));
      }
      const image = job.kind === "image" ? job.file : await job.doc.render(job.page, SCAN_SIDE);
      texts.push(await ocr.read(image, (p: OcrProgress) => onProgress({ fraction: at(loading + (1 - loading) * p.fraction), label })));
      usedOcr = true;
    }
    onProgress({ fraction: 1, label: "Building your report" });
    return { text: texts.join("\n"), pages: jobs.length, usedOcr, previews };
  } catch (e) {
    for (const p of previews) if (p.url.startsWith("blob:")) URL.revokeObjectURL(p.url);
    throw e;
  } finally {
    await ocr?.close();
    for (const doc of docs) await doc.close();
  }
}
