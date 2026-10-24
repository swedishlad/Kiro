// Image-to-text for bill photos, entirely in the browser. Tesseract.js and its files are served from
// this site (public/ocr/, copied by scripts/copy-ocr-assets.mjs), so the photo is never uploaded
// anywhere and no third-party server is contacted. Loaded only when someone reads a bill.

export interface OcrProgress {
  /** 0..1 across the whole job (loading the engine, then recognising) */
  fraction: number;
  label: string;
}

/** Long side in pixels: phone photos are 4000px+, which is slow and no more accurate. */
const MAX_SIDE = 2400;

/** Scale the photo down if it is huge and drop colour; returns something Tesseract can read. */
async function prepare(file: File): Promise<HTMLCanvasElement | File> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file; // let Tesseract try the original (and report a clear error if it cannot)
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.filter = "grayscale(1) contrast(1.15)";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

export async function readImageText(file: File, onProgress: (p: OcrProgress) => void): Promise<string> {
  onProgress({ fraction: 0, label: "Preparing the photo" });
  const [{ createWorker, OEM }, image] = await Promise.all([import("tesseract.js"), prepare(file)]);
  const base = new URL("ocr/", document.baseURI).href;
  const worker = await createWorker("eng", OEM.LSTM_ONLY, {
    workerPath: `${base}worker.min.js`,
    corePath: base,
    langPath: base,
    gzip: true,
    // Keep the language data out of IndexedDB: the browser's HTTP cache already holds it.
    cacheMethod: "none",
    logger: (m: { status: string; progress: number }) => {
      if (m.status === "recognizing text") onProgress({ fraction: 0.3 + 0.7 * m.progress, label: "Reading the text" });
      else onProgress({ fraction: 0.3 * m.progress, label: "Loading the text reader" });
    },
  });
  try {
    const { data } = await worker.recognize(image);
    onProgress({ fraction: 1, label: "Done" });
    return data.text;
  } finally {
    await worker.terminate();
  }
}
