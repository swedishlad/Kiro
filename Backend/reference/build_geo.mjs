// Reference geo build: LMEC 351-town GeoJSON -> data/build/towns.json (pre-projected SVG paths).
//
// Usage (Node >= 20, run from the repo root so node_modules resolves):
//   npm i -D mapshaper@0.7.82 d3-geo@3.1.1
//   curl -L -o data/raw/mass-municipalities.geojson \
//     https://raw.githubusercontent.com/nblmc/massachusetts-municipal-boundaries/main/data-cooked/mass-municipalities.geojson
//   node reference/build_geo.mjs data/raw/mass-municipalities.geojson data/build/towns.json [intervalMeters=300] [digits=1]
//
// WHY PLANAR: d3's spherical projections expect clockwise exterior rings; RFC 7946 GeoJSON (what
// mapshaper writes) is counter-clockwise, so d3 draws every town as "the whole globe minus the town"
// (all centroids identical, huge paths). We avoid the whole class of bug by projecting to
// Massachusetts State Plane (EPSG:26986, metres) inside mapshaper and using d3.geoIdentity.
//
// Gate G-GEO: 351 towns, unique ids 1..351, no NaN, distinct centroids, every town inside the
// panel, gzip size <= 150 KB, raw <= 600 KB, then a human visual check of the PNG preview.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { geoIdentity, geoPath } from 'd3-geo';

const [, , inFile, outFile, intervalArg = '300', digitsArg = '1'] = process.argv;
if (!inFile || !outFile) {
  console.error('usage: build_geo.mjs <in.geojson> <out.json> [intervalMeters] [digits]');
  process.exit(2);
}
const W = 680, H = 420, PAD = 6;
const MAX_GZIP = 150 * 1024, MAX_RAW = 600 * 1024;

// 1) project to MA State Plane and simplify with shared borders kept shared (no slivers)
const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'geo-')), 'planar.json');
const ms = path.resolve('node_modules/.bin/mapshaper');
execFileSync(ms, ['-i', inFile, '-proj', 'EPSG:26986',
  '-simplify', `interval=${intervalArg}`, 'keep-shapes',
  '-o', tmp, 'format=geojson', 'precision=1'], { stdio: ['ignore', 'ignore', 'inherit'] });
const gj = JSON.parse(fs.readFileSync(tmp, 'utf8'));

// 2) planar fit: y axis flips because SVG y grows downward
const proj = geoIdentity().reflectY(true).fitExtent([[PAD, PAD], [W - PAD, H - PAD]], gj);
const pathGen = geoPath(proj).digits(Number(digitsArg));

const towns = gj.features.map((f) => {
  const p = f.properties;
  const c = pathGen.centroid(f);
  return {
    id: p.massgis_town_id, name: p.massgis_name, census: p.census_name, geoid: p.GEOID,
    cx: Math.round(c[0] * 10) / 10, cy: Math.round(c[1] * 10) / 10, d: pathGen(f),
  };
}).sort((a, b) => a.id - b.id);

// 3) automatic gate checks
const problems = [];
const ids = new Set(towns.map((t) => t.id));
if (towns.length !== 351) problems.push(`towns=${towns.length}`);
if (ids.size !== 351 || Math.min(...ids) !== 1 || Math.max(...ids) !== 351) problems.push('ids not unique 1..351');
const cents = new Set(towns.map((t) => `${t.cx},${t.cy}`));
if (cents.size < 345) problems.push(`only ${cents.size} distinct centroids (winding/projection bug?)`);
for (const t of towns) {
  if (!t.d || /NaN|Infinity/.test(t.d) || !Number.isFinite(t.cx)) problems.push(`bad geometry ${t.name}`);
  if (t.cx < 0 || t.cx > W || t.cy < 0 || t.cy > H) problems.push(`centroid outside panel ${t.name}`);
}
const out = JSON.stringify({
  w: W, h: H, crs: 'EPSG:26986 fitted to panel',
  source: 'LMEC nblmc/massachusetts-municipal-boundaries (MassGIS/Census-derived)',
  simplifyIntervalMeters: Number(intervalArg), towns,
});
fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
fs.writeFileSync(outFile, out);
const raw = Buffer.byteLength(out), gz = zlib.gzipSync(out, { level: 9 }).length;
if (gz > MAX_GZIP) problems.push(`gzip ${gz} > ${MAX_GZIP}`);
if (raw > MAX_RAW) problems.push(`raw ${raw} > ${MAX_RAW}`);

// 4) preview for the human visual check
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W * 2}" height="${H * 2}">` +
  `<rect width="${W}" height="${H}" fill="#fff"/>` +
  towns.map((t) => `<path d="${t.d}" fill="#dbe7f5" stroke="#2a78d6" stroke-width="0.3"/>`).join('') + '</svg>';
fs.writeFileSync(outFile.replace(/\.json$/, '') + '.preview.svg', svg);

console.log(`towns=${towns.length} distinctCentroids=${cents.size} raw=${(raw / 1024).toFixed(0)}KB ` +
  `gzip=${(gz / 1024).toFixed(0)}KB interval=${intervalArg}m digits=${digitsArg}`);
console.log(problems.length ? `G-GEO: FAIL ${problems.join('; ')}`
  : 'G-GEO (automatic part): PASS — now open the .preview.svg and do the visual check');
process.exit(problems.length ? 1 : 0);
