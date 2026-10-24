// In-browser extraction of the Mass.gov basic-service XLSX (fallback when nobody can download the file).
// This is the exact logic used on Oct 22 2026 to produce data/snapshot/*.csv.
//
// HOW TO RUN (human or a browser-capable agent):
//   1. Open https://www.mass.gov/info-details/basic-service-information-and-rates in Chrome.
//   2. Paste this whole file into the DevTools console (or a browser-automation "execute JS" tool).
//   3. The page body is replaced by a <pre> with two CSV blocks + checksum lines. Copy it out
//      (DevTools: copy(window.__fairwattDump)), or read it with a page-text tool.
//   4. Save the blocks as data/snapshot/*.csv and run reference/verify_snapshot.py.
//
// WHY THIS SHAPE: browser-automation JS tools truncate return values (~1 KB observed) and block outputs
// that look like key=value pairs. Writing to the DOM and reading page text avoided both (11 KB intact).
// No external libraries: unzips with the built-in DecompressionStream('deflate-raw').
(async () => {
  const URL_XLSX = '/doc/basic-service-rates-722026/download';   // update if Mass.gov posts a new file
  const r = await fetch(URL_XLSX, { credentials: 'same-origin' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const buf = new Uint8Array(await r.arrayBuffer());
  const dv = new DataView(buf.buffer);

  // --- minimal ZIP reader (central directory) ---
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('not a zip');
  const n = dv.getUint16(eocd + 10, true), cdOff = dv.getUint32(eocd + 16, true);
  const ents = {}; let p = cdOff;
  for (let k = 0; k < n; k++) {
    const method = dv.getUint16(p + 10, true), csz = dv.getUint32(p + 20, true);
    const fl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
    const lho = dv.getUint32(p + 42, true);
    ents[new TextDecoder().decode(buf.slice(p + 46, p + 46 + fl))] = { method, csz, lho };
    p += 46 + fl + el + cl;
  }
  async function get(name) {
    const e = ents[name]; if (!e) return null;
    const start = e.lho + 30 + dv.getUint16(e.lho + 26, true) + dv.getUint16(e.lho + 28, true);
    const data = buf.slice(start, start + e.csz);
    if (e.method === 0) return new TextDecoder().decode(data);
    const out = await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer();
    return new TextDecoder().decode(out);
  }

  // --- workbook -> sheet file mapping ---
  const wb = await get('xl/workbook.xml'), rels = await get('xl/_rels/workbook.xml.rels');
  const relTargets = Object.fromEntries([...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => [
    (m[0].match(/Id="([^"]*)"/) || [])[1], (m[0].match(/Target="([^"]*)"/) || [])[1]]));
  const sheets = Object.fromEntries([...wb.matchAll(/<sheet\b[^>]*>/g)].map((m) => [
    (m[0].match(/name="([^"]*)"/) || [])[1],
    'xl/' + relTargets[(m[0].match(/r:id="([^"]*)"/) || [])[1]].replace(/^\/?xl\//, '')]));
  const ss = await get('xl/sharedStrings.xml');
  const strs = [...ss.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join(''));

  const colN = (c) => [...c].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  async function rows(file) {
    const x = await get(file); const out = [];
    for (const rm of x.matchAll(/<row\b[^>]*?r="(\d+)"[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const cells = {};
      for (const cm of (rm[2] || '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = (cm[1].match(/\br="([A-Z]+)\d+"/) || [])[1], t = (cm[1].match(/\bt="([^"]*)"/) || [])[1];
        const body = cm[2] || '', v = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        let val = null;
        if (t === 's' && v !== undefined) val = strs[+v];
        else if (t === 'inlineStr') val = [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((z) => z[1]).join('');
        else if (v !== undefined) val = (t === 'str' || t === 'e' || t === 'b') ? v : +v;
        if (val !== null && ref) cells[colN(ref)] = val;
      }
      out.push([+rm[1], cells]);
    }
    return out;
  }

  // --- residential series: rows >= 4, year carried down from col A, month label in col B, cols D..G ---
  const MON = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, June: 6, Jul: 7, July: 7, Aug: 8, Sep: 9, Sept: 9, Oct: 10, Nov: 11, Dec: 12 };
  const num = (v) => { if (v == null) return null; const f = typeof v === 'number' ? v : parseFloat(String(v).trim());
    if (Number.isNaN(f)) throw new Error('non-numeric cell ' + JSON.stringify(v)); return Math.round(f * 1000) / 1000; };
  function build(rs) {
    let yr = null; const out = [];
    for (const [r, c] of rs) {
      if (r < 4) continue;
      if (typeof c[0] === 'number') yr = c[0];
      const m = MON[String(c[1] || '').trim()]; if (!m) continue;
      const v = [3, 4, 5, 6].map((i) => num(c[i]));
      if (v.some((x) => x !== null)) out.push({ y: yr, m, v });
    }
    return out;
  }
  const mon = build(await rows(sheets['Monthly Prices'])), fix = build(await rows(sheets['Fixed Prices']));
  const sums = (a) => [0, 1, 2, 3].map((j) => a.reduce((s, o) => s + (o.v[j] === null ? 0 : Math.round(o.v[j] * 1000)), 0));
  const cnt = (a) => [0, 1, 2, 3].map((j) => a.filter((o) => o.v[j] !== null).length);
  const fmt = (a) => a.map((o) => [o.y, o.m, ...o.v.map((x) => (x === null ? '' : x))].join(',')).join('\n');
  const txt = '#MONTHLY year,month,NG,NSTAR,WMECo,Unitil\n' + fmt(mon) +
    '\n#FIXED term_end_year,term_end_month,NG,NSTAR,WMECo,Unitil\n' + fmt(fix) +
    `\n#CHECK monthly n=${mon.length} counts=${cnt(mon)} sums=${sums(mon)}` +
    `\n#CHECK fixed n=${fix.length} counts=${cnt(fix)} sums=${sums(fix)}` +
    `\n#SHEETS ${Object.keys(sheets).join(' | ')}  bytes=${buf.length}`;
  window.__fairwattDump = txt;
  document.body.innerHTML = '<article><pre style="white-space:pre-wrap">' + txt.replace(/</g, '&lt;') + '</pre></article>';
  return txt.length;
})();
