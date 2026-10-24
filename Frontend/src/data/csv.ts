// Minimal CSV reader for the backend's committed files. None of them quote fields (no commas or
// quotes inside values), so a split is exact; a row with the wrong cell count fails closed rather
// than silently shifting columns.

export type Row = Record<string, string>;

export function parseCsv(text: string): Row[] {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.length > 0);
  if (lines.length === 0) throw new Error("empty CSV");
  if (lines.some((l) => l.includes('"'))) throw new Error("quoted CSV fields are not supported");
  const header = lines[0].split(",");
  return lines.slice(1).map((line, i) => {
    const cells = line.split(",");
    if (cells.length !== header.length) {
      throw new Error(`CSV row ${i + 1} has ${cells.length} cells, expected ${header.length}`);
    }
    const row: Row = {};
    header.forEach((h, j) => (row[h] = cells[j]));
    return row;
  });
}

/** Number from a cell; blank means "no value" (e.g. no term ended that month). */
export function num(cell: string): number | null {
  if (cell === "") return null;
  const n = Number(cell);
  if (!Number.isFinite(n)) throw new Error(`not a number: ${cell}`);
  return n;
}

export function req(cell: string): number {
  const n = num(cell);
  if (n === null) throw new Error("required value is blank");
  return n;
}
