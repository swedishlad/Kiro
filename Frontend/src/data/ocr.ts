// Image-to-text for bill photos, entirely in the browser. Tesseract.js and its files are served from
// this site (public/ocr/, copied by scripts/copy-reader-assets.mjs), so the photo is never uploaded
// anywhere and no third-party server is contacted. Loaded only when someone reads a bill.

export interface OcrProgress {
  /** 0..1 within the current step (loading the engine, or reading one image) */
  fraction: number;
  label: string;
}

/** Long side in pixels: phone photos are 4000px+, which is slow and no more accurate. */
const MAX_SIDE = 2400;

/** Scale the photo down if it is huge and drop colour; returns something Tesseract can read. */
async function prepare(image: File | HTMLCanvasElement): Promise<HTMLCanvasElement | File> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(image);
  } catch {
    return image; // let Tesseract try the original (and report a clear error if it cannot)
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return image;
  ctx.filter = "grayscale(1) contrast(1.15)";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

export interface OcrReader {
  /** Reads one photo, screenshot or rendered PDF page. */
  read(image: File | HTMLCanvasElement, onProgress: (p: OcrProgress) => void): Promise<string>;
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
  // Read the page as one column of rows: boxed fields (service period, statement date) are kept, which
  // the single-block default drops, and a label stays on the same line as its amount.
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_COLUMN });
  return {
    async read(image, onPageProgress) {
      report = onPageProgress;
      onPageProgress({ fraction: 0, label: "Preparing the image" });
      const { data } = await worker.recognize(await prepare(image));
      onPageProgress({ fraction: 1, label: "Done" });
      return data.text;
    },
    close: () => worker.terminate().then(() => undefined),
  };
}
