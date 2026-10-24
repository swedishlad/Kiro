// Copies the Tesseract.js worker, its WebAssembly core and the English language data from
// node_modules into public/ocr/, so the bill reader runs entirely from this site: no CDN requests,
// and the bill photo never leaves the visitor's browser. Runs before `dev` and `build`.

import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const out = fileURLToPath(new URL("../public/ocr/", import.meta.url));
const pkgDir = (name) => dirname(require.resolve(`${name}/package.json`));

const files = [
  [join(pkgDir("tesseract.js"), "dist", "worker.min.js"), "worker.min.js"],
  // LSTM-only cores (with and without SIMD); the worker picks one for the device.
  [join(pkgDir("tesseract.js-core"), "tesseract-core-simd-lstm.wasm.js"), "tesseract-core-simd-lstm.wasm.js"],
  [join(pkgDir("tesseract.js-core"), "tesseract-core-lstm.wasm.js"), "tesseract-core-lstm.wasm.js"],
  // The compact integer model: about 3 MB instead of 11 MB, accurate enough for printed bills.
  [join(pkgDir("@tesseract.js-data/eng"), "4.0.0_best_int", "eng.traineddata.gz"), "eng.traineddata.gz"],
];

mkdirSync(out, { recursive: true });
for (const [from, to] of files) copyFileSync(from, join(out, to));
console.log(`copied ${files.length} OCR files to public/ocr/`);
