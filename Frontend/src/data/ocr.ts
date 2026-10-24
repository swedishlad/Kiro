// Image-to-text for bill photos, entirely in the browser. Tesseract.js and its files are served from
// this site (public/ocr/, copied by scripts/copy-reader-assets.mjs), so the photo is never uploaded
// anywhere and no third-party server is contacted. Loaded only when someone reads a bill.

import { textLines, type TextRun } from "./textLayout.ts";

export interface OcrProgress {
  /** 0..1 within the current step (loading the engine, or reading one image) */
  fraction: number;
  label: string;
}

/**
 * Long side the image is drawn at for reading: about 300 dpi for a letter page that fills the frame,
 * which is what Tesseract reads best. Phone photos are scaled down to it; screenshots of a PDF
 * (about 100 dpi) are scaled up, at most 3×, which makes small print readable.
 */
const TARGET_SIDE = 3300;
const MAX_UPSCALE = 3;
/** Background cell: larger than a text stroke, smaller than a shadow's edge. */
const CELL = 24;

/**
 * Evens out the light. A phone photo has a bright middle, dark corners and often a hand's shadow
 * across it, and Tesseract binarizes with one threshold for the whole page, so text in the shade
 * turns black and text in the light fades. Each pixel is divided by the paper's brightness around
 * it (the brightest value in its cell, smoothed), which leaves dark text on an even white page.
 */
function flatten(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;
  const { width: w, height: h } = canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const px = img.data;
  const gw = Math.ceil(w / CELL);
  const gh = Math.ceil(h / CELL);
  const grid = new Uint8ClampedArray(gw * gh * 4);
  for (let y = 0; y < h; y++) {
    const row = (y / CELL) | 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const g = (px[i] * 77 + px[i + 1] * 150 + px[i + 2] * 29) >> 8;
      px[i] = g;
      const c = (row * gw + ((x / CELL) | 0)) * 4;
      if (g > grid[c]) grid[c] = g;
    }
  }
  for (let c = 0; c < grid.length; c += 4) grid[c + 1] = grid[c + 2] = grid[c], grid[c + 3] = 255;
  // Smooth the cell maxima and stretch them back over the page (the browser's bilinear scaling).
  const small = document.createElement("canvas");
  small.width = gw;
  small.height = gh;
  small.getContext("2d")!.putImageData(new ImageData(grid, gw, gh), 0, 0);
  const bg = document.createElement("canvas");
  bg.width = w;
  bg.height = h;
  const bctx = bg.getContext("2d", { willReadFrequently: true })!;
  bctx.filter = "blur(2px)";
  bctx.drawImage(small, 0, 0, gw, gh, 0, 0, w, h);
  const light = bctx.getImageData(0, 0, w, h).data;
  for (let i = 0; i < px.length; i += 4) {
    const v = Math.min(255, (px[i] * 255) / Math.max(light[i], 32));
    px[i] = px[i + 1] = px[i + 2] = v;
  }
  eraseRules(px, w, h);
  ctx.putImageData(img, 0, 0);
}

/**
 * Erases ruling lines: box borders and table rules. Tesseract treats text inside a ruled box as part
 * of a graphic and often skips it, and bills box exactly what matters (the service period, the amount
 * due). A rule is a dark run across a few percent of the page that stays thin along its whole length;
 * a line of blurred text can run as long, but it is as tall as its letters and broken by spaces. A
 * photographed rule is slightly tilted, so a row counts as dark where any of the rows next to it is.
 */
function eraseRules(px: Uint8ClampedArray, w: number, h: number): void {
  // Blur leaves a photographed rule mid-grey, lighter than text but dark enough for Tesseract.
  const dark = new Uint8Array(w * h);
  for (let i = 0; i < dark.length; i++) dark[i] = px[i * 4] < 200 ? 1 : 0;
  const band = Math.max(2, Math.round(h / 1600));
  const maxThick = Math.max(6, Math.round(h / 400));
  const white = (i: number) => (px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = 255);
  /** Whether a run is thin at nearly every one of 15 points along it (thickness measured across it). */
  const thinAlong = (from: number, to: number, across: (at: number) => number) => {
    let thin = 0;
    for (let k = 1; k < 16; k++) if (across(from + Math.round(((to - from) * k) / 16)) <= maxThick) thin++;
    return thin >= 12;
  };
  const minRow = Math.round(w * 0.06);
  for (let y = band; y < h - band; y++) {
    const near = (x: number) => {
      for (let d = -band; d <= band; d++) if (dark[(y + d) * w + x]) return true;
      return false;
    };
    const tall = (x: number) => {
      let top = -1;
      let bottom = -1;
      for (let d = -band; d <= band; d++) if (dark[(y + d) * w + x]) (top < 0 && (top = y + d), (bottom = y + d));
      if (top < 0) return Infinity;
      while (top > 0 && dark[(top - 1) * w + x]) top--;
      while (bottom < h - 1 && dark[(bottom + 1) * w + x]) bottom++;
      return bottom - top + 1;
    };
    for (let x = 0; x < w; ) {
      if (!near(x)) {
        x++;
        continue;
      }
      let end = x;
      while (end < w && near(end)) end++;
      if (end - x >= minRow && thinAlong(x, end, tall)) {
        for (let d = -band; d <= band; d++) for (let xx = x; xx < end; xx++) if (dark[(y + d) * w + xx]) white((y + d) * w + xx);
      }
      x = end;
    }
  }
  const minCol = Math.round(h * 0.03);
  for (let x = 0; x < w; x++) {
    const wide = (y: number) => {
      let left = x;
      let right = x;
      while (left > 0 && dark[y * w + left - 1]) left--;
      while (right < w - 1 && dark[y * w + right + 1]) right++;
      return dark[y * w + x] ? right - left + 1 : Infinity;
    };
    for (let y = 0; y < h; ) {
      if (!dark[y * w + x]) {
        y++;
        continue;
      }
      let end = y;
      while (end < h && dark[end * w + x]) end++;
      if (end - y >= minCol && thinAlong(y, end, wide)) for (let yy = y; yy < end; yy++) white(yy * w + x);
      y = end;
    }
  }
}

/** Draws the image at reading size and evens out its light; returns something Tesseract can read. */
async function prepare(image: OcrImage): Promise<HTMLCanvasElement | File> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(image);
  } catch {
    return image; // let Tesseract try the original (and report a clear error if it cannot)
  }
  const scale = Math.min(MAX_UPSCALE, TARGET_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return image;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  flatten(canvas);
  return canvas;
}

/** The words of a sparse reading, with their line's baseline (Tesseract's block output). */
interface OcrLine {
  baseline: { x0: number; y0: number; x1: number; y1: number; has_baseline: boolean };
  rowAttributes?: { row_height: number };
  words: { text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }[];
}

/**
 * Rows of text from words found anywhere on the page. The page's tilt is the median slope of the
 * longer baselines; each word is placed on its line's baseline with the tilt taken out, and words
 * on the same corrected baseline form a row, so a label and its amount meet again across a gap.
 */
export function ocrRows(lines: OcrLine[]): string {
  const slopes = lines
    .filter((l) => l.baseline.has_baseline && l.baseline.x1 - l.baseline.x0 > 150)
    .map((l) => (l.baseline.y1 - l.baseline.y0) / (l.baseline.x1 - l.baseline.x0))
    .sort((a, b) => a - b);
  const tilt = slopes.length ? slopes[slopes.length >> 1] : 0;
  const runs: TextRun[] = [];
  for (const l of lines) {
    const b = l.baseline;
    const slope = b.has_baseline && b.x1 > b.x0 ? (b.y1 - b.y0) / (b.x1 - b.x0) : tilt;
    for (const w of l.words) {
      const mid = (w.bbox.x0 + w.bbox.x1) / 2;
      const base = b.has_baseline ? b.y0 + slope * (mid - b.x0) : w.bbox.y1;
      runs.push({ str: w.text, x: w.bbox.x0, y: base - tilt * mid, width: w.bbox.x1 - w.bbox.x0, height: l.rowAttributes?.row_height || w.bbox.y1 - w.bbox.y0 });
    }
  }
  return textLines(runs);
}

type OcrImage = File | HTMLCanvasElement;

export interface OcrReader {
  /** Reads one photo, screenshot or rendered PDF page, following the page's layout. */
  read(image: OcrImage, onProgress: (p: OcrProgress) => void): Promise<string>;
  /**
   * A second, slower reading of the same image for what the first missed: every scrap of text
   * wherever it is (Tesseract's sparse mode), put back into rows by position.
   */
  readScattered(image: OcrImage, onProgress: (p: OcrProgress) => void): Promise<string>;
  close(): Promise<void>;
}

/** Starts one Tesseract worker that reads every page of a bill in turn. */
export async function openOcr(onProgress: (p: OcrProgress) => void): Promise<OcrReader> {
  let report = onProgress;
  const { createWorker, OEM, PSM } = await import("tesseract.js");
  const base = new URL("ocr/", document.baseURI).href;
  const worker = await createWorker("eng", OEM.LSTM_ONLY, {
    workerPath: `${base}worker.min.js`,
    corePath: base,
    langPath: base,
    gzip: true,
    // Keep the language data out of IndexedDB: the browser's HTTP cache already holds it.
    cacheMethod: "none",
    logger: (m: { status: string; progress: number }) =>
      report(m.status === "recognizing text" ? { fraction: m.progress, label: "Reading the text" } : { fraction: m.progress, label: "Loading the text reader" }),
  });
  // Each image is prepared once, for both readings.
  const prepared = new WeakMap<OcrImage, Promise<HTMLCanvasElement | File>>();
  const ready = (image: OcrImage) => {
    let p = prepared.get(image);
    if (!p) prepared.set(image, (p = prepare(image)));
    return p;
  };
  return {
    async read(image, onPageProgress) {
      report = onPageProgress;
      onPageProgress({ fraction: 0, label: "Preparing the image" });
      // One column of rows: boxed fields (service period, statement date) are kept, which the
      // single-block default drops, and a label stays on the same line as its amount.
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_COLUMN });
      const { data } = await worker.recognize(await ready(image));
      onPageProgress({ fraction: 1, label: "Done" });
      return data.text;
    },
    async readScattered(image, onPageProgress) {
      report = onPageProgress;
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
      const { data } = await worker.recognize(await ready(image), {}, { text: false, blocks: true });
      onPageProgress({ fraction: 1, label: "Done" });
      return ocrRows((data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines)));
    },
    close: () => worker.terminate().then(() => undefined),
  };
}
