// Copies the bill reader's browser files from node_modules into public/, so Bill check runs entirely
// from this site: no CDN requests, and the bill never leaves the visitor's browser. Runs before
// `dev` and `build`.
//   public/ocr/  Tesseract.js worker, its WebAssembly core and the English model (photos, scans)
//   public/pdf/  PDF.js worker, fonts, character maps and image decoders (PDF bills)

import { copyFileSync, cpSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const pkgDir = (name) => dirname(require.resolve(`${name}/package.json`));
const ocr = fileURLToPath(new URL("../public/ocr/", import.meta.url));
const pdf = fileURLToPath(new URL("../public/pdf/", import.meta.url));

const files = [
  [join(pkgDir("tesseract.js"), "dist", "worker.min.js"), join(ocr, "worker.min.js")],
  // LSTM-only cores (with and without SIMD); the worker picks one for the device.
  [join(pkgDir("tesseract.js-core"), "tesseract-core-simd-lstm.wasm.js"), join(ocr, "tesseract-core-simd-lstm.wasm.js")],
  [join(pkgDir("tesseract.js-core"), "tesseract-core-lstm.wasm.js"), join(ocr, "tesseract-core-lstm.wasm.js")],
  // The compact integer model: about 3 MB instead of 11 MB, accurate enough for printed bills.
  [join(pkgDir("@tesseract.js-data/eng"), "4.0.0_best_int", "eng.traineddata.gz"), join(ocr, "eng.traineddata.gz")],
  [join(pkgDir("pdfjs-dist"), "build", "pdf.worker.min.mjs"), join(pdf, "pdf.worker.min.mjs")],
];
// Fetched by PDF.js only when a PDF needs them (non-embedded fonts, CJK encodings, JBIG2/JPEG 2000
// scans, colour profiles). The QuickJS sandbox runs PDF scripts, which the reader never does.
const dirs = ["cmaps", "standard_fonts", "wasm", "iccs"].map((d) => [join(pkgDir("pdfjs-dist"), d), join(pdf, d)]);

for (const dir of [ocr, pdf]) mkdirSync(dir, { recursive: true });
for (const [from, to] of files) copyFileSync(from, to);
for (const [from, to] of dirs) cpSync(from, to, { recursive: true, filter: (src) => !src.includes("quickjs") });
console.log(`copied ${files.length} files and ${dirs.length} folders to public/ocr/ and public/pdf/`);
